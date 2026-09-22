import "server-only"
import { cache } from "react"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { publicPageConfig } from "@/lib/db/schema"
import { getCurrentTenant } from "@/lib/tenant"
import {
  resolveEffectivePublicPage,
  type EffectivePublicPage,
  type PublicPageConfigRow,
} from "./resolve"

/**
 * Accès SERVEUR à la configuration de page publique (LOT 2).
 *
 * Toutes les lectures sont TOLÉRANTES à l'absence de la table
 * `public_page_config` (migration non encore appliquée sur un environnement
 * donné) : dans ce cas on renvoie `null` / le repli company-only, sans jamais
 * planter le rendu public. La table est requêtée par `companyId` uniquement →
 * strictement isolé par tenant.
 */

/** Vrai si l'erreur PostgreSQL est « relation inexistante » (table absente). */
function isUndefinedTable(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "42P01"
}

type ConfigSelect = typeof publicPageConfig.$inferSelect

function toRow(r: ConfigSelect): PublicPageConfigRow {
  return {
    layoutVariant: r.layoutVariant,
    heroImageUrl: r.heroImageUrl,
    heroImagePosition: r.heroImagePosition,
    heroOverlay: r.heroOverlay,
    accentPrimary: r.accentPrimary,
    accentSecondary: r.accentSecondary,
    theme: r.theme,
    showGallery: r.showGallery,
    showReviews: r.showReviews,
    showAbout: r.showAbout,
    interventionZone: r.interventionZone,
    depositRuleText: r.depositRuleText,
    cancellationPolicy: r.cancellationPolicy,
    seoIndexable: r.seoIndexable,
    publishedAt: r.publishedAt,
  }
}

/**
 * Ligne de config brute d'une entreprise, ou `null` (aucune config OU table
 * absente). Ne lève jamais pour une table manquante.
 */
export async function getPublicPageConfigRow(companyId: number): Promise<ConfigSelect | null> {
  try {
    const [row] = await db
      .select()
      .from(publicPageConfig)
      .where(eq(publicPageConfig.companyId, companyId))
      .limit(1)
    return row ?? null
  } catch (err) {
    if (isUndefinedTable(err)) return null
    throw err
  }
}

/**
 * Configuration EFFECTIVE (après repli config → colonnes company → défauts)
 * pour une entreprise donnée. Tolérante à l'absence de table.
 */
export async function resolvePublicPageForCompany(company: {
  id: number
  brandPrimary: string | null
  brandSecondary: string | null
}): Promise<EffectivePublicPage> {
  const row = await getPublicPageConfigRow(company.id)
  return resolveEffectivePublicPage(row ? toRow(row) : null, {
    brandPrimary: company.brandPrimary,
    brandSecondary: company.brandSecondary,
  })
}

/**
 * Config EFFECTIVE du TENANT COURANT (en-tête posé par le middleware), ou
 * `null` hors contexte tenant (vitrine racine). Mémoïsé par requête : une seule
 * lecture DB par rendu, partagée entre le layout et la page.
 *
 * Le tenant est TOUJOURS résolu côté serveur, jamais depuis le client →
 * isolation garantie. Tolérante à l'absence de table (repli company-only).
 */
export const getEffectivePublicPageForCurrentTenant = cache(
  async (): Promise<EffectivePublicPage | null> => {
    const tenant = await getCurrentTenant()
    if (!tenant) return null
    return resolvePublicPageForCompany({
      id: tenant.id,
      brandPrimary: tenant.brandPrimary ?? null,
      brandSecondary: tenant.brandSecondary ?? null,
    })
  },
)

export type PublicPageConfigInput = {
  layoutVariant?: string | null
  heroImageUrl?: string | null
  heroImagePosition?: string | null
  heroOverlay?: number | null
  accentPrimary?: string | null
  accentSecondary?: string | null
  theme?: string | null
  showGallery?: boolean
  showReviews?: boolean
  showAbout?: boolean
  interventionZone?: string | null
  depositRuleText?: string | null
  cancellationPolicy?: string | null
  seoIndexable?: boolean
}

/**
 * Crée ou met à jour (UPSERT par `companyId`) la config d'une entreprise.
 * Idempotent, scoping strict par tenant. Renvoie la ligne résultante.
 */
export async function upsertPublicPageConfig(
  companyId: number,
  input: PublicPageConfigInput,
): Promise<ConfigSelect> {
  const now = new Date()
  // Retire les clés `undefined` : le type `set` de Drizzle (PgUpdateSetSource)
  // n'accepte pas `undefined`, et une clé absente = « ne pas modifier ».
  const patch = Object.fromEntries(
    Object.entries(input).filter(([, v]) => v !== undefined),
  ) as Partial<typeof publicPageConfig.$inferInsert>
  const [row] = await db
    .insert(publicPageConfig)
    .values({ companyId, ...patch, updatedAt: now })
    .onConflictDoUpdate({ target: publicPageConfig.companyId, set: { ...patch, updatedAt: now } })
    .returning()
  return row
}

/**
 * Publie la page (pose `publishedAt` si absent). Idempotent : ne réécrit pas
 * une date de publication déjà posée. Crée la ligne si nécessaire.
 */
export async function publishPublicPageConfig(companyId: number): Promise<ConfigSelect> {
  const now = new Date()
  const [row] = await db
    .insert(publicPageConfig)
    .values({ companyId, publishedAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: publicPageConfig.companyId,
      // COALESCE : conserve la première date de publication si déjà publiée.
      set: { publishedAt: now, updatedAt: now },
    })
    .returning()
  return row
}
