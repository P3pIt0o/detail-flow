/**
 * Helpers de résolution d'image de prestation, partagés client + serveur
 * (ne PAS ajouter "server-only" ici : importé aussi par le formulaire admin).
 *
 * `services.image` peut contenir trois formes, qu'on doit toutes préserver :
 *  - une URL http(s) héritée      → affichée telle quelle ;
 *  - un chemin local `/services/…` → affiché tel quel ;
 *  - un pathname Blob PRIVÉ         → servi via /api/service-image (isolé tenant).
 *
 * C'est le pendant de `lib/public-gallery.ts` pour la galerie Avant/Après.
 */

/** Préfixe Blob privé des images de prestation d'une entreprise. */
export function serviceImagePrefix(companyId: number): string {
  return `service-image/company-${companyId}-`
}

/**
 * Vrai si la valeur est un pathname Blob privé (ni URL http(s), ni chemin
 * local commençant par `/`). Ce sont les images à servir via la route sécurisée.
 */
export function isPrivateServiceImage(image: string | null | undefined): boolean {
  const v = image?.trim()
  if (!v) return false
  if (/^https?:\/\//i.test(v)) return false
  if (v.startsWith("/")) return false
  return true
}

/**
 * Transforme la valeur stockée en `src` affichable.
 *  - null/vide            → null (au caller de mettre une image par défaut) ;
 *  - http(s) / chemin `/` → inchangé (rétrocompatibilité) ;
 *  - pathname Blob privé  → /api/service-image?company=<slug>&p=<pathname>.
 */
export function resolveServiceImageSrc(
  image: string | null | undefined,
  slug: string,
): string | null {
  const v = image?.trim()
  if (!v) return null
  if (!isPrivateServiceImage(v)) return v
  return `/api/service-image?company=${encodeURIComponent(slug)}&p=${encodeURIComponent(v)}`
}
