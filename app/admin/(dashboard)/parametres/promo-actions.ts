"use server"

/**
 * ============================================================================
 *  ACTIONS ADMIN — CODES PROMO (isolées par tenant)
 * ============================================================================
 *  Le companyId provient TOUJOURS du contexte serveur authentifié
 *  (requireCompanyMember). Aucun companyId n'est jamais accepté du navigateur.
 * ============================================================================
 */

import { and, desc, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { promoCodes } from "@/lib/db/schema"
import { requireCompanyMember } from "@/lib/admin"
import { normalizePromoCode } from "@/lib/promo/service"

export type PromoActionResult = { ok: true } | { ok: false; error: string }

export type PromoCodeRow = {
  id: number
  code: string
  active: boolean
  discountType: "percent" | "fixed"
  discountValue: number
  startsAt: Date | null
  endsAt: Date | null
  maxUses: number | null
  usageCount: number
}

function revalidate() {
  revalidatePath("/admin/parametres")
}

/** Liste des codes promo du tenant courant. */
export async function listPromoCodes(): Promise<PromoCodeRow[]> {
  const { tenant } = await requireCompanyMember()
  const rows = await db
    .select({
      id: promoCodes.id,
      code: promoCodes.code,
      active: promoCodes.active,
      discountType: promoCodes.discountType,
      discountValue: promoCodes.discountValue,
      startsAt: promoCodes.startsAt,
      endsAt: promoCodes.endsAt,
      maxUses: promoCodes.maxUses,
      usageCount: promoCodes.usageCount,
    })
    .from(promoCodes)
    .where(eq(promoCodes.companyId, tenant.id))
    .orderBy(desc(promoCodes.createdAt))
  return rows as PromoCodeRow[]
}

/** Crée un code promo. Le code est normalisé (MAJUSCULES) ; UNIQUE(company, code). */
export async function createPromoCode(input: {
  code: string
  discountType: "percent" | "fixed"
  /** percent : 1-100 ; fixed : montant en euros (converti en centimes). */
  discountValue: number
  startsAt?: string | null
  endsAt?: string | null
  maxUses?: number | null
  active?: boolean
}): Promise<PromoActionResult> {
  const { tenant } = await requireCompanyMember()

  const code = normalizePromoCode(input.code)
  if (!code) return { ok: false, error: "Code requis." }
  if (input.discountType !== "percent" && input.discountType !== "fixed") {
    return { ok: false, error: "Type de remise invalide." }
  }

  // percent : 1-100 ; fixed : euros -> centimes (> 0).
  let discountValue: number
  if (input.discountType === "percent") {
    discountValue = Math.round(input.discountValue)
    if (discountValue < 1 || discountValue > 100) return { ok: false, error: "Le pourcentage doit être entre 1 et 100." }
  } else {
    discountValue = Math.round(input.discountValue * 100)
    if (discountValue <= 0) return { ok: false, error: "Le montant doit être supérieur à 0." }
  }

  const startsAt = input.startsAt ? new Date(input.startsAt) : null
  const endsAt = input.endsAt ? new Date(input.endsAt) : null
  if (startsAt && endsAt && endsAt < startsAt) {
    return { ok: false, error: "La date de fin doit suivre la date de début." }
  }

  const maxUses = input.maxUses != null && input.maxUses > 0 ? Math.round(input.maxUses) : null

  try {
    await db.insert(promoCodes).values({
      companyId: tenant.id,
      code,
      active: input.active ?? true,
      discountType: input.discountType,
      discountValue,
      startsAt,
      endsAt,
      maxUses,
    })
  } catch (e) {
    // Violation d'unicité (companyId, code).
    if (e instanceof Error && /unique|duplicate/i.test(e.message)) {
      return { ok: false, error: "Ce code existe déjà." }
    }
    return { ok: false, error: "Impossible de créer le code." }
  }
  revalidate()
  return { ok: true }
}

/** Active/désactive un code (scopé tenant). */
export async function togglePromoCode(id: number, active: boolean): Promise<PromoActionResult> {
  const { tenant } = await requireCompanyMember()
  await db
    .update(promoCodes)
    .set({ active, updatedAt: new Date() })
    .where(and(eq(promoCodes.id, id), eq(promoCodes.companyId, tenant.id)))
  revalidate()
  return { ok: true }
}

/** Supprime un code (scopé tenant). Les réservations passées gardent leur snapshot. */
export async function deletePromoCode(id: number): Promise<PromoActionResult> {
  const { tenant } = await requireCompanyMember()
  await db.delete(promoCodes).where(and(eq(promoCodes.id, id), eq(promoCodes.companyId, tenant.id)))
  revalidate()
  return { ok: true }
}
