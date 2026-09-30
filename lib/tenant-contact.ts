/**
 * Lien « Nous contacter » d'un tenant : `mailto:` vers SA propre adresse.
 *
 * Aucun repli (ni DetailFlow, ni module de réservation) : sans adresse valide,
 * renvoie `null` et l'appelant masque le CTA. Les caractères pouvant injecter
 * des paramètres mailto (`?`, `&`, retours ligne…) sont refusés.
 */
const SAFE_EMAIL = /^[^\s@?&<>"',;]+@[^\s@?&<>"',;]+\.[^\s@?&<>"',;]+$/

export function tenantContactMailto(email: string | null | undefined): string | null {
  const value = (email ?? "").trim()
  if (!value || !SAFE_EMAIL.test(value)) return null
  return `mailto:${value}`
}
