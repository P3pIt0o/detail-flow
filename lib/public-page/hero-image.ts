/**
 * Photo de bannière (hero) de la page publique — helpers partagés client + serveur
 * (pas de "server-only" : importé aussi par le champ de téléversement).
 *
 * `public_page_config.heroImageUrl` peut contenir :
 *  - une URL https héritée ou un chemin interne `/…` → affichés tels quels ;
 *  - un pathname Blob PRIVÉ `hero-image/company-<id>-…` → servi via /api/hero-image.
 */

/** Préfixe Blob privé des photos de bannière d'une entreprise. */
export function heroImagePrefix(companyId: number): string {
  return `hero-image/company-${companyId}-`
}

/** Vrai si la valeur est un pathname Blob privé (ni URL http(s), ni chemin `/`). */
export function isPrivateHeroImage(value: string | null | undefined): boolean {
  const v = value?.trim()
  if (!v) return false
  if (/^https?:\/\//i.test(v)) return false
  return !v.startsWith("/")
}

/** Valeur stockée → `src` affichable (null si vide). */
export function resolveHeroImageSrc(value: string | null | undefined, slug: string): string | null {
  const v = value?.trim()
  if (!v) return null
  if (!isPrivateHeroImage(v)) return v
  return `/api/hero-image?company=${encodeURIComponent(slug)}&p=${encodeURIComponent(v)}`
}

/**
 * Valide la valeur à enregistrer pour le tenant `companyId` :
 * null/vide → null ; `/…` ou `https://…` → inchangé (rétrocompatibilité) ;
 * pathname sous le préfixe DE CE tenant → accepté ; tout le reste → erreur.
 */
export function parseHeroImageValue(value: string | null | undefined, companyId: number): string | null {
  const v = value?.trim()
  if (!v) return null
  // `//hôte` et `/\hôte` sont des URL externes relatives au protocole, pas des chemins internes.
  if (v.startsWith("/") && !/^\/[/\\]/.test(v)) return v
  if (v.startsWith(heroImagePrefix(companyId)) && !v.includes("..")) return v
  try {
    if (new URL(v).protocol === "https:") return v
  } catch {
    /* invalide */
  }
  throw new Error("Photo de la bannière : image non valide.")
}
