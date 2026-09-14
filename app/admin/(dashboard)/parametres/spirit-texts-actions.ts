"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { requireCompanyMember, type MemberContext } from "@/lib/admin"
import { canUseFeature, FEATURE_LOCKED_MESSAGE } from "@/lib/licensing/enforce"
import { SITE_CONTENT_DEFAULTS } from "@/lib/site-content"
import { resolveCustomRequestsConfig, resolveCustomRequestTexts } from "@/lib/custom-requests"
import {
  SPIRIT_SITE_TEXTS_KEY,
  SPIRIT_STATIC_FALLBACKS,
  SPIRIT_TEXT_FIELDS,
  readSpiritOverride,
  type SpiritTextFieldValue,
} from "@/components/custom-sites/spirit-acs/site-texts"

export type SpiritTextsResult = {
  ok: boolean
  error?: string
  /** Valeurs recalculées après l'opération (rafraîchit les badges de l'admin). */
  values?: Record<string, SpiritTextFieldValue>
}

/**
 * Chemins revalidés après une sauvegarde réussie (cf. §22). L'accueil et le
 * layout couvrent hero, prestations, présentation, zone, flotte, galeries,
 * avis et demande de devis ; les pages prestations et /contact sont explicites.
 */
const REVALIDATE_PATHS: Array<[string] | [string, "layout" | "page"]> = [
  ["/admin/parametres"],
  ["/", "layout"],
  ["/contact"],
  ["/prestations/nettoyage-automobile"],
  ["/prestations/polissage-automobile"],
  ["/prestations/protection-ceramique"],
  ["/prestations/protection-ppf"],
  ["/prestations/renovation-phares"],
  ["/prestations/detailing-moto"],
  ["/prestations/nettoyage-textile"],
]

/**
 * Garde commune : membre OWNER/ADMIN d'une entreprise + licence `website` +
 * tenant Spirit ACS. Un super-admin plateforme conserve un accès de maintenance
 * (requireCompanyMember laisse toujours passer le super-admin). Renvoie le
 * contexte, ou un message d'erreur sûr (jamais de détail technique au client).
 */
async function requireSpiritEditor(): Promise<
  { ok: true; ctx: MemberContext } | { ok: false; error: string }
> {
  const ctx = await requireCompanyMember(["OWNER", "ADMIN"])
  if (ctx.tenant.customSiteKey !== SPIRIT_SITE_TEXTS_KEY) {
    return { ok: false, error: "Cette fonctionnalité est réservée au site Spirit ACS." }
  }
  if (!(await canUseFeature(ctx.tenant.id, "website"))) {
    return { ok: false, error: FEATURE_LOCKED_MESSAGE }
  }
  return { ok: true, ctx }
}

/** Fallback des champs réutilisant leur emplacement historique (hors `spiritAcs`). */
function reusedFallback(fieldId: string): string {
  const cr = resolveCustomRequestTexts(resolveCustomRequestsConfig(undefined))
  switch (fieldId) {
    case "galleryTitle":
      return SITE_CONTENT_DEFAULTS.gallery.title
    case "galleryIntro":
      return SITE_CONTENT_DEFAULTS.gallery.intro
    case "reviewsTitle":
      return SITE_CONTENT_DEFAULTS.reviews.title
    case "reviewsIntro":
      return SITE_CONTENT_DEFAULTS.reviews.intro
    case "footerTagline":
      return SITE_CONTENT_DEFAULTS.footer.tagline
    case "customRequestsTitle":
      return cr.title
    case "customRequestsDescription":
      return cr.description
    default:
      return ""
  }
}

/** Fallback effectif d'un champ (statique pour spiritAcs/hero, sinon résolu). */
function fallbackFor(fieldId: string): string {
  return SPIRIT_STATIC_FALLBACKS[fieldId] ?? reusedFallback(fieldId)
}

/** Construit la carte valeur+badge de TOUS les champs à partir des données brutes. */
function buildValues(
  siteContent: unknown,
  heroSubtitle: string | null,
): Record<string, SpiritTextFieldValue> {
  const values: Record<string, SpiritTextFieldValue> = {}
  for (const [fieldId, spec] of Object.entries(SPIRIT_TEXT_FIELDS)) {
    const override = readSpiritOverride(fieldId, siteContent, heroSubtitle)
    values[fieldId] = {
      value: override ?? fallbackFor(fieldId),
      custom: override !== undefined,
      max: spec.max,
    }
  }
  return values
}

/**
 * Lecture (admin) des valeurs effectives + état défaut/personnalisé de tous les
 * textes Spirit modifiables. Chaque champ est pré-rempli avec la valeur RÉELLE
 * affichée sur le site (override si présent, sinon fallback exact du code).
 */
export async function getSpiritSiteTexts(): Promise<SpiritTextsResult> {
  const guard = await requireSpiritEditor()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { tenant } = guard.ctx
  return { ok: true, values: buildValues(tenant.siteContent, tenant.heroSubtitle ?? null) }
}

/* --- Sanitisation & écriture ------------------------------------------------ */

type Sanitized = { ok: true; value: string } | { ok: false }

/**
 * Nettoie une valeur : normalise les retours à la ligne, refuse les caractères
 * de contrôle dangereux, tout HTML (`<`/`>`) et toute URL, retire les espaces de
 * début/fin, et refuse (sans tronquer) au-delà de la longueur maximale. Une
 * chaîne vide après nettoyage vaut RÉINITIALISATION.
 */
function sanitize(raw: unknown, max: number): Sanitized {
  if (typeof raw !== "string") return { ok: false }
  let v = raw.replace(/\r\n?/g, "\n")
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(v)) return { ok: false }
  if (v.includes("<") || v.includes(">")) return { ok: false }
  if (/https?:\/\//i.test(v) || /\bwww\.\S/i.test(v)) return { ok: false }
  v = v.trim()
  if (v.length > max) return { ok: false }
  return { ok: true, value: v }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function setAtPath(root: Record<string, unknown>, path: string[], value: string): void {
  let node = root
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]
    if (!isPlainObject(node[key])) node[key] = {}
    node = node[key] as Record<string, unknown>
  }
  node[path[path.length - 1]] = value
}

function deleteAtPath(root: Record<string, unknown>, path: string[]): void {
  const parents: Record<string, unknown>[] = [root]
  let node: unknown = root
  for (let i = 0; i < path.length - 1; i++) {
    node = isPlainObject(node) ? (node as Record<string, unknown>)[path[i]] : undefined
    if (!isPlainObject(node)) return // rien à supprimer
    parents.push(node)
  }
  const parent = parents[parents.length - 1]
  delete parent[path[path.length - 1]]
  // Élagage : supprime les objets devenus vides UNIQUEMENT sous « spiritAcs »
  // (ne touche jamais aux objets réutilisés comme gallery/reviews/customRequests
  // qui portent d'autres propriétés — enabled, types…).
  if (path[0] !== "spiritAcs") return
  for (let i = parents.length - 1; i >= 1; i--) {
    const obj = parents[i]
    if (Object.keys(obj).length === 0) {
      delete parents[i - 1][path[i - 1]]
    } else break
  }
}

/**
 * Enregistre les textes éditoriaux autorisés de Spirit ACS. TOUT-OU-RIEN : si un
 * seul champ est invalide, rien n'est écrit. Fusionne uniquement les propriétés
 * concernées dans `companies.siteContent` (jsonb) et n'écrit `heroSubtitle`
 * (colonne dédiée) que s'il est fourni ; toutes les autres données sont
 * préservées. Une valeur vide réinitialise (suppression de l'override / null).
 *
 * ISOLATION : l'écriture cible EXCLUSIVEMENT `tenant.id` (jamais un id/slug
 * fourni par le client) et une double condition `customSiteKey = 'spirit-acs'`
 * verrouille l'UPDATE au niveau SQL.
 */
export async function saveSpiritSiteTexts(input: Record<string, string>): Promise<SpiritTextsResult> {
  const guard = await requireSpiritEditor()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { tenant } = guard.ctx

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Requête invalide." }
  }

  // 1) Valider/normaliser TOUS les champs avant toute écriture.
  const jsonChanges: Array<{ path: string[]; value: string }> = []
  let heroProvided = false
  let heroValue: string | null = null

  for (const [fieldId, rawValue] of Object.entries(input)) {
    const spec = SPIRIT_TEXT_FIELDS[fieldId]
    if (!spec) return { ok: false, error: `Champ inconnu : ${fieldId}.` }
    const clean = sanitize(rawValue, spec.max)
    if (!clean.ok) {
      return {
        ok: false,
        error: `Valeur invalide ou trop longue (max ${spec.max} caractères) pour « ${fieldId} ».`,
      }
    }
    if (spec.location.kind === "column") {
      heroProvided = true
      heroValue = clean.value.length > 0 ? clean.value : null
    } else {
      jsonChanges.push({ path: spec.location.path, value: clean.value })
    }
  }

  // 2) Appliquer sur une COPIE des données existantes (préserve tout le reste).
  const existing = (tenant.siteContent as Record<string, unknown> | null) ?? {}
  const next: Record<string, unknown> = structuredClone(existing)
  for (const change of jsonChanges) {
    if (change.value.length === 0) deleteAtPath(next, change.path)
    else setAtPath(next, change.path, change.value)
  }

  // 3) Écriture unique, verrouillée au tenant Spirit courant.
  const setValues: Record<string, unknown> = { siteContent: next, updatedAt: new Date() }
  if (heroProvided) setValues.heroSubtitle = heroValue

  await db
    .update(companies)
    .set(setValues)
    .where(and(eq(companies.id, tenant.id), eq(companies.customSiteKey, SPIRIT_SITE_TEXTS_KEY)))

  for (const [path, mode] of REVALIDATE_PATHS) {
    if (mode) revalidatePath(path, mode)
    else revalidatePath(path)
  }

  const effectiveHero = heroProvided ? heroValue : (tenant.heroSubtitle ?? null)
  return { ok: true, values: buildValues(next, effectiveHero) }
}
