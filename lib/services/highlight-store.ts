import "server-only"
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"

/**
 * ============================================================================
 *  ACCÈS DÉDIÉ AUX BADGES DE MISE EN AVANT (LOT C) — TOLÉRANT À L'ABSENCE DE SCHÉMA
 * ============================================================================
 *  Les colonnes `highlightKind` / `highlightLabel` de la table `services` sont
 *  ajoutées par une MIGRATION ADDITIVE qui peut ne pas encore être appliquée en
 *  base (voir scripts/service-highlight-badge-migration.sql).
 *
 *  Pour NE JAMAIS casser les pages publiques, le catalogue admin ni le parcours
 *  de réservation avant migration, ces colonnes ne sont PAS déclarées dans le
 *  schéma Drizzle (sinon tous les `select()` de `services` référenceraient des
 *  colonnes inexistantes → erreur SQL 42703). Elles sont lues/écrites UNIQUEMENT
 *  ici, via des requêtes ciblées qui se dégradent proprement :
 *   - avant migration : lectures = aucun badge, écritures = no-op signalé ;
 *   - après migration : parcours complet admin → stockage → affichage.
 *
 *  On ne masque AUCUNE autre erreur : seule l'absence des colonnes est absorbée,
 *  déterminée par un contrôle explicite sur information_schema (pas un catch large).
 * ============================================================================
 */

export type ServiceHighlightRow = { highlightKind: string | null; highlightLabel: string | null }

// Cache mémoire du résultat du contrôle de schéma. Le positif est conservé ;
// le négatif expire vite pour que la fonctionnalité s'active d'elle-même après
// migration, sans redémarrage (utile aussi entre requêtes d'un même process).
let cache: { value: boolean; at: number } | null = null
const NEGATIVE_TTL_MS = 30_000

/** Vrai si les deux colonnes de badge existent réellement en base. */
export async function serviceHighlightColumnsExist(): Promise<boolean> {
  const now = Date.now()
  if (cache && (cache.value || now - cache.at < NEGATIVE_TTL_MS)) return cache.value
  try {
    const res = await db.execute(sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'services'
        AND column_name IN ('highlightKind', 'highlightLabel')
    `)
    const rows = (res as unknown as { rows?: unknown[] }).rows ?? []
    const value = rows.length >= 2
    cache = { value, at: now }
    return value
  } catch {
    // Échec du contrôle lui-même (ex. table absente en test) → on considère les
    // colonnes indisponibles, sans propager (le contrôle est non essentiel).
    cache = { value: false, at: now }
    return false
  }
}

/** Badges d'un tenant, indexés par id de prestation. Vide si schéma absent. */
export async function getServiceHighlights(companyId: number): Promise<Map<number, ServiceHighlightRow>> {
  const map = new Map<number, ServiceHighlightRow>()
  if (!(await serviceHighlightColumnsExist())) return map
  const res = await db.execute(sql`
    SELECT "id", "highlightKind", "highlightLabel"
    FROM "services"
    WHERE "companyId" = ${companyId}
  `)
  const rows = ((res as unknown as { rows?: Record<string, unknown>[] }).rows ?? [])
  for (const r of rows) {
    map.set(Number(r.id), {
      highlightKind: (r.highlightKind ?? null) as string | null,
      highlightLabel: (r.highlightLabel ?? null) as string | null,
    })
  }
  return map
}

/**
 * Fusionne les badges dans une liste de prestations déjà chargées (par id).
 * Avant migration, ajoute simplement `highlightKind/highlightLabel = null`.
 */
export async function attachServiceHighlights<T extends { id: number }>(
  companyId: number,
  rows: T[],
): Promise<(T & ServiceHighlightRow)[]> {
  const map = await getServiceHighlights(companyId)
  return rows.map((r) => ({
    ...r,
    highlightKind: map.get(r.id)?.highlightKind ?? null,
    highlightLabel: map.get(r.id)?.highlightLabel ?? null,
  }))
}

/**
 * Écrit (ou efface) le badge d'une prestation, SCOPÉ AU TENANT (anti-IDOR).
 * Retourne false si les colonnes n'existent pas encore (aucune écriture faite),
 * pour que l'appelant évite tout faux succès d'enregistrement du badge.
 */
export async function writeServiceHighlight(
  companyId: number,
  serviceId: number,
  highlightKind: string | null,
  highlightLabel: string | null,
): Promise<boolean> {
  if (!(await serviceHighlightColumnsExist())) return false
  await db.execute(sql`
    UPDATE "services"
    SET "highlightKind" = ${highlightKind}, "highlightLabel" = ${highlightLabel}
    WHERE "id" = ${serviceId} AND "companyId" = ${companyId}
  `)
  return true
}
