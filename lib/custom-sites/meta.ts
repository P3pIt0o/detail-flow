/**
 * MÉTADONNÉES PURES des sites publics personnalisés (aucun composant, aucune
 * dépendance serveur / DB / `next/font`).
 *
 * SOURCE DE VÉRITÉ des clés techniques valides (`customSiteKey`) et de leurs
 * libellés lisibles. Ce module est volontairement SANS effet de bord : il peut
 * donc être importé aussi bien par un composant CLIENT (ex. le tableau de bord
 * super-admin) que par le serveur, sans jamais tirer le code des pages
 * personnalisées (Oswald/`next/font`, composants React) dans le bundle client.
 *
 * Le lien clé → composant de page vit séparément dans `registry.ts` (serveur).
 */

/** Métadonnée sûre d'un site personnalisé (jamais de composant ici). */
export interface CustomSiteMeta {
  /** Clé technique stable (ex. "spirit-acs"). */
  key: string
  /** Nom lisible affiché au super-admin (ex. "Spirit ACS"). */
  name: string
  /** true = le site rend son propre shell (pas de Navbar/Footer standard). */
  ownShell: boolean
}

/**
 * Table des métadonnées, indexée par clé technique. C'est ICI qu'on déclare
 * qu'un site personnalisé existe pour la plateforme. Le composant de page
 * correspondant est associé dans `registry.ts` (même clé).
 */
export const customSiteMetaRegistry: Readonly<Record<string, CustomSiteMeta>> = Object.freeze({
  "spirit-acs": { key: "spirit-acs", name: "Spirit ACS", ownShell: true },
})

/** Normalise une clé entrante (défensif) avant toute recherche/validation. */
export function normalizeKey(key: string | null | undefined): string {
  return (key ?? "").trim()
}

/** Vrai si la clé correspond à un site personnalisé réellement enregistré. */
export function isRegisteredCustomSiteKey(key: string | null | undefined): boolean {
  const k = normalizeKey(key)
  return k !== "" && Object.prototype.hasOwnProperty.call(customSiteMetaRegistry, k)
}

/** Métadonnée d'une clé enregistrée, ou `null` si absente/inconnue. */
export function getCustomSiteMeta(key: string | null | undefined): CustomSiteMeta | null {
  const k = normalizeKey(key)
  if (!k) return null
  return customSiteMetaRegistry[k] ?? null
}

/**
 * Liste des sites enregistrés (clé + nom), pour l'affichage super-admin.
 * Ne renvoie jamais de composant : uniquement des métadonnées sûres.
 */
export function listRegisteredCustomSites(): Array<{ key: string; name: string }> {
  return Object.values(customSiteMetaRegistry).map((d) => ({ key: d.key, name: d.name }))
}

/** Nom lisible d'une clé enregistrée, ou `null` si inconnue/absente. */
export function customSiteLabel(key: string | null | undefined): string | null {
  return getCustomSiteMeta(key)?.name ?? null
}
