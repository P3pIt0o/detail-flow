/**
 * OVERRIDE CENTRALISÉ DE L'IMAGE DE FOND DU HERO PAR TENANT.
 *
 * Indexé par le `slug` VALIDÉ de l'entreprise résolue CÔTÉ SERVEUR
 * (getCurrentTenant → colonne companies.slug), jamais par l'URL, le
 * searchParam `?tenant=` ni le hostname. Conséquence : dès qu'un futur domaine
 * personnalisé sera rattaché à la même entreprise, il résoudra le même slug et
 * affichera donc automatiquement la même image, sans duplication.
 *
 * Aucune entrée => image par défaut (`DEFAULT_HERO_IMAGE`). Aucun autre tenant
 * n'est affecté. Aucune donnée en base n'est modifiée.
 *
 * ÉVOLUTION FUTURE (non implémentée ici) : un champ `heroImageUrl` propre à
 * chaque entreprise, alimenté par un upload sécurisé depuis l'administration,
 * prendra la priorité sur cette table statique. La signature
 * `getTenantHeroImage(slug)` restera le point d'entrée unique côté rendu.
 */

/** Image de fond par défaut (comportement historique inchangé). */
export const DEFAULT_HERO_IMAGE = "/hero.png"

/** Surcharges statiques par slug d'entreprise (source unique et typée). */
const TENANT_HERO_IMAGES: Readonly<Record<string, string>> = {
  justcleandetailing: "/tenants/justcleandetailing/justclean-hero-v1.jpg",
}

/**
 * Renvoie l'image de fond du Hero pour un slug d'entreprise donné.
 * Repli garanti sur l'image par défaut si le tenant n'a aucune surcharge.
 */
export function getTenantHeroImage(slug: string | null | undefined): string {
  if (!slug) return DEFAULT_HERO_IMAGE
  return TENANT_HERO_IMAGES[slug] ?? DEFAULT_HERO_IMAGE
}
