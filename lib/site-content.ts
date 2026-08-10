/**
 * Contenu éditable des sections statiques du site public, par entreprise.
 *
 * Stocké dans une seule colonne générique `companies.siteContent` (jsonb),
 * sur le même modèle que `socialLinks`. Évite une colonne dédiée par texte
 * de section. Chaque section est facultative : toute valeur manquante ou
 * vide retombe sur un texte par défaut neutre (rétrocompatibilité garantie
 * pour les tenants existants qui n'ont jamais rien configuré).
 *
 * Les modules déjà fonctionnels (Header/Hero, Avis CRUD, Prestations CRUD,
 * Galerie Avant/Après CRUD) ne sont PAS gérés ici : seuls les titres/textes
 * d'introduction de ces sections et leur activation/masquage le sont.
 */

import { resolveRequestTenant } from "@/lib/tenant"

export interface SiteContent {
  about?: {
    title?: string
    text?: string
    buttonLabel?: string
    buttonHref?: string
  }
  whyUs?: {
    enabled?: boolean
    title?: string
    subtitle?: string
    /** Textes libres des avantages (repli sur les avantages par défaut si vide). */
    points?: string[]
  }
  services?: {
    title?: string
    intro?: string
  }
  gallery?: {
    enabled?: boolean
    title?: string
    intro?: string
  }
  reviews?: {
    enabled?: boolean
    title?: string
    intro?: string
  }
  contact?: {
    enabled?: boolean
    title?: string
    text?: string
    buttonLabel?: string
  }
  footer?: {
    text?: string
    tagline?: string
  }
}

export const SITE_CONTENT_DEFAULTS: Required<{
  [K in keyof SiteContent]: Required<SiteContent[K]>
}> = {
  about: {
    title: "Qui sommes-nous ?",
    text: "Une équipe passionnée par l'entretien automobile, au service de la qualité et de la satisfaction client.",
    buttonLabel: "",
    buttonHref: "",
  },
  whyUs: {
    enabled: true,
    title: "Pourquoi nous choisir",
    subtitle: "Un service pensé pour votre tranquillité",
    points: [
      "Des produits professionnels et respectueux de votre véhicule",
      "Une équipe expérimentée et soignée",
      "Un service fiable, à l'heure, sans mauvaise surprise",
    ],
  },
  services: {
    title: "Nos prestations",
    intro: "Des formules adaptées à chaque besoin, du simple lavage à la remise en état complète.",
  },
  gallery: {
    enabled: true,
    title: "Avant / Après",
    intro: "Le résultat de notre travail, en images.",
  },
  reviews: {
    enabled: true,
    title: "Ce que disent nos clients",
    intro: "Leur satisfaction est notre meilleure publicité.",
  },
  contact: {
    enabled: true,
    title: "Prêt à faire briller votre véhicule ?",
    text: "Réservez votre créneau en quelques clics.",
    buttonLabel: "Réserver maintenant",
  },
  footer: {
    text: "",
    tagline: "",
  },
} as any

/** Fusionne le contenu personnalisé du tenant avec les valeurs par défaut, section par section. */
export function resolveSiteContent(raw: unknown): typeof SITE_CONTENT_DEFAULTS {
  const custom = (raw ?? {}) as SiteContent
  const result: any = {}
  for (const key of Object.keys(SITE_CONTENT_DEFAULTS) as (keyof SiteContent)[]) {
    result[key] = { ...SITE_CONTENT_DEFAULTS[key], ...(custom[key] ?? {}) }
    // Un champ texte explicitement vide ("") doit retomber sur le défaut, pas rester vide.
    for (const field of Object.keys(result[key])) {
      const value = result[key][field]
      if (typeof value === "string" && value.trim() === "") {
        result[key][field] = (SITE_CONTENT_DEFAULTS as any)[key][field]
      }
    }
    if (Array.isArray(custom[key]?.points) && custom[key]!.points!.filter((p) => p.trim()).length > 0) {
      result[key].points = custom[key]!.points!.filter((p) => p.trim())
    }
  }
  return result
}

/**
 * Contenu résolu des sections statiques pour le TENANT COURANT (site public).
 * `resolveRequestTenant` détermine l'entreprise à partir du domaine/slug de la
 * requête (jamais depuis une valeur envoyée par le client) ; ce helper ne peut
 * donc jamais renvoyer le contenu d'une autre entreprise.
 */
export async function getPublicSiteContent() {
  const tenant = await resolveRequestTenant()
  return resolveSiteContent(tenant?.siteContent)
}
