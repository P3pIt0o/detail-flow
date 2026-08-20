"use server"

/**
 * Server Actions de gestion des LICENCES & DROITS (super-admin uniquement).
 *
 * SÉCURITÉ (zero-trust) :
 *   - CHAQUE action commence par requireSuperAdmin() : un OWNER/ADMIN/EMPLOYEE
 *     tenant ou un anonyme est refusé même en appelant l'action directement ;
 *   - AUCUNE valeur du navigateur n'est fiable : plan, feature, état, source,
 *     date sont revalidés contre les registres centraux (fail-closed) ;
 *   - pas de mass-assignment : seuls des champs explicites sont écrits ;
 *   - l'`actorUserId` provient de la session serveur, jamais du client.
 *
 * FOUNDER et les overrides ne peuvent donc être attribués QUE par le super-admin.
 */

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies, companyFeatureOverrides, licenseAuditLog } from "@/lib/db/schema"
import { requireSuperAdmin } from "@/lib/admin"
import { getCompanyEntitlements } from "@/lib/licensing/server"
import { type EntitlementView } from "@/lib/licensing/resolver"
import {
  type LicenseAuditAction,
  type FeatureKey,
  isLicensePlan,
  isFeatureKey,
  isOverrideState,
  isOverrideSource,
} from "@/lib/licensing/types"
import { PLAN_META } from "@/lib/licensing/registry"

type ActionState = { ok: true; message?: string } | { ok: false; error: string }

/* --------------------------- Helpers internes ---------------------------- */

function assertCompanyId(companyId: unknown): companyId is number {
  return typeof companyId === "number" && Number.isInteger(companyId) && companyId > 0
}

/** Écrit une entrée d'audit (best-effort : n'invalide jamais la mutation). */
async function audit(
  companyId: number,
  actorUserId: string,
  action: LicenseAuditAction,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(licenseAuditLog).values({ companyId, actorUserId, action, metadata })
  } catch (e) {
    console.log("[v0] licenseAuditLog insert failed:", e instanceof Error ? e.message : e)
  }
}

/* ------------------------------- Lecture --------------------------------- */

export type LicensePlanOption = {
  plan: string
  label: string
  internalOnly: boolean
  purchasable: boolean
}

export type LicenseViewState =
  | {
      ok: true
      view: EntitlementView
      /** Notes internes par feature (super-admin uniquement). */
      notes: Record<string, string | null>
      /** Options de plan pour le sélecteur (toutes, y compris internes). */
      plans: LicensePlanOption[]
    }
  | { ok: false; error: string }

/** Charge la vue « Licence & droits » d'une entreprise (super-admin only). */
export async function getCompanyLicenseViewAction(companyId: number): Promise<LicenseViewState> {
  await requireSuperAdmin()
  if (!assertCompanyId(companyId)) return { ok: false, error: "Entreprise invalide." }
  try {
    const view = await getCompanyEntitlements(companyId)
    if (!view) return { ok: false, error: "Entreprise introuvable." }

    const rows = await db
      .select({ featureKey: companyFeatureOverrides.featureKey, internalNote: companyFeatureOverrides.internalNote })
      .from(companyFeatureOverrides)
      .where(eq(companyFeatureOverrides.companyId, companyId))
    const notes: Record<string, string | null> = {}
    for (const r of rows) notes[r.featureKey] = r.internalNote

    const plans: LicensePlanOption[] = Object.entries(PLAN_META).map(([plan, meta]) => ({
      plan,
      label: meta.label,
      internalOnly: meta.internalOnly,
      purchasable: meta.purchasable,
    }))

    return { ok: true, view, notes, plans }
  } catch (e) {
    console.log("[v0] getCompanyLicenseViewAction:", e instanceof Error ? e.message : e)
    return { ok: false, error: "Erreur lors du chargement des droits." }
  }
}

/* ---------------------------- Attribuer un plan -------------------------- */

/**
 * Attribue / change le plan d'une entreprise. FOUNDER inclus (super-admin only).
 * N'écrit QUE les colonnes de licence : ne touche jamais à status, Stripe, SMS,
 * ni à aucune donnée métier (aucune suppression sur un downgrade).
 */
export async function setCompanyLicenseAction(companyId: number, plan: string): Promise<ActionState> {
  const actor = await requireSuperAdmin()
  if (!assertCompanyId(companyId)) return { ok: false, error: "Entreprise invalide." }
  if (!isLicensePlan(plan)) return { ok: false, error: "Plan de licence invalide." }

  try {
    const generation = PLAN_META[plan].generation
    const res = await db
      .update(companies)
      .set({
        licensePlan: plan,
        licenseGeneration: generation,
        licenseAssignedAt: new Date(),
        licenseAssignedByUserId: actor.id,
        updatedAt: new Date(),
      })
      .where(eq(companies.id, companyId))
      .returning({ id: companies.id })

    if (res.length === 0) return { ok: false, error: "Entreprise introuvable." }

    await audit(companyId, actor.id, "LICENSE_CHANGED", { plan, generation })
    revalidatePath("/super-admin")
    return { ok: true, message: `Licence attribuée : ${PLAN_META[plan].label} (${generation}).` }
  } catch (e) {
    console.log("[v0] setCompanyLicenseAction:", e instanceof Error ? e.message : e)
    return { ok: false, error: "Erreur lors de l'attribution de la licence." }
  }
}

/* ------------------------------- Overrides ------------------------------- */

export type SetOverrideInput = {
  featureKey: string
  state: string // INHERIT | ENABLED | DISABLED
  source?: string
  /** ISO / yyyy-mm-dd ; vide ou null = pas d'expiration. */
  expiresAt?: string | null
  internalNote?: string | null
}

const MAX_NOTE_LEN = 1000

/**
 * Définit (ENABLED/DISABLED, éventuellement avec expiration/source/note) ou
 * retire (INHERIT) un override pour UNE feature d'UNE entreprise.
 *
 * Unicité (companyId, featureKey) garantie par la contrainte DB + UPSERT :
 * deux clics simultanés ne créent jamais deux overrides contradictoires.
 * INHERIT supprime la ligne (retour au droit du plan) sans toucher aux données.
 */
export async function setFeatureOverrideAction(companyId: number, input: SetOverrideInput): Promise<ActionState> {
  const actor = await requireSuperAdmin()
  if (!assertCompanyId(companyId)) return { ok: false, error: "Entreprise invalide." }

  // Validation stricte contre les registres centraux (fail-closed).
  if (!isFeatureKey(input.featureKey)) return { ok: false, error: "Fonctionnalité inconnue." }
  if (!isOverrideState(input.state)) return { ok: false, error: "État d'override invalide." }
  const featureKey: FeatureKey = input.featureKey

  try {
    // Vérifie l'existence de l'entreprise (sans divulguer d'info d'un autre tenant).
    const [company] = await db.select({ id: companies.id }).from(companies).where(eq(companies.id, companyId)).limit(1)
    if (!company) return { ok: false, error: "Entreprise introuvable." }

    /* -------- INHERIT => suppression de l'override -------- */
    if (input.state === "INHERIT") {
      await db
        .delete(companyFeatureOverrides)
        .where(
          and(eq(companyFeatureOverrides.companyId, companyId), eq(companyFeatureOverrides.featureKey, featureKey)),
        )
      await audit(companyId, actor.id, "FEATURE_OVERRIDE_REMOVED", { featureKey })
      revalidatePath("/super-admin")
      return { ok: true, message: "Override retiré (retour au droit du plan)." }
    }

    /* -------- ENABLED / DISABLED => upsert -------- */
    const source = input.source && isOverrideSource(input.source) ? input.source : "MANUAL"

    let expiresAt: Date | null = null
    if (input.expiresAt) {
      const d = new Date(input.expiresAt)
      if (Number.isNaN(d.getTime())) return { ok: false, error: "Date d'expiration invalide." }
      expiresAt = d
    }

    let internalNote: string | null = null
    if (typeof input.internalNote === "string") {
      const trimmed = input.internalNote.trim()
      if (trimmed.length > MAX_NOTE_LEN) return { ok: false, error: "Note interne trop longue." }
      internalNote = trimmed.length ? trimmed : null
    }

    const now = new Date()
    await db
      .insert(companyFeatureOverrides)
      .values({
        companyId,
        featureKey,
        state: input.state,
        source,
        expiresAt,
        internalNote,
        createdByUserId: actor.id,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [companyFeatureOverrides.companyId, companyFeatureOverrides.featureKey],
        set: { state: input.state, source, expiresAt, internalNote, updatedAt: now },
      })

    const action: LicenseAuditAction =
      source === "TRIAL" && expiresAt
        ? "FEATURE_TRIAL_STARTED"
        : input.state === "ENABLED"
          ? "FEATURE_ENABLED"
          : "FEATURE_DISABLED"
    await audit(companyId, actor.id, action, {
      featureKey,
      state: input.state,
      source,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
    })

    revalidatePath("/super-admin")
    return { ok: true, message: "Override enregistré." }
  } catch (e) {
    console.log("[v0] setFeatureOverrideAction:", e instanceof Error ? e.message : e)
    return { ok: false, error: "Erreur lors de l'enregistrement de l'override." }
  }
}
