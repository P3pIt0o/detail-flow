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

/**
 * Classes des deux dégradés (voile) superposés à l'image du Hero.
 * `top` = dégradé vertical, `left` = dégradé horizontal derrière les textes.
 */
export type HeroOverlay = { top: string; left: string }

/**
 * Voile HISTORIQUE par défaut. Identique au comportement d'avant toute
 * personnalisation : TOUS les tenants (et la racine) l'utilisent, à
 * l'exception explicite de ceux listés dans `TENANT_HERO_OVERLAYS`.
 */
export const DEFAULT_HERO_OVERLAY: HeroOverlay = {
  top: "from-background via-background/85 to-background/40",
  left: "from-background/90 to-transparent",
}

/**
 * Surcharges de voile par slug d'entreprise. Voile légèrement réduit pour
 * rendre l'image plus visible tout en préservant la lisibilité des textes et
 * boutons (dégradé gauche conservé). Aucun autre tenant n'est impacté.
 */
const TENANT_HERO_OVERLAYS: Readonly<Record<string, HeroOverlay>> = {
  justcleandetailing: {
    top: "from-background via-background/70 to-background/25",
    left: "from-background/80 to-transparent",
  },
}

/**
 * Renvoie le voile du Hero pour un slug donné.
 * Repli garanti sur le voile historique si le tenant n'a aucune surcharge.
 */
export function getTenantHeroOverlay(slug: string | null | undefined): HeroOverlay {
  if (!slug) return DEFAULT_HERO_OVERLAY
  return TENANT_HERO_OVERLAYS[slug] ?? DEFAULT_HERO_OVERLAY
}
