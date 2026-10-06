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
import { resolveCustomRequestsConfig } from "@/lib/custom-requests"

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
    /** Affiche le sur-titre. false = masqué ; true + vide = texte par défaut. */
    eyebrowEnabled?: boolean
    /** Sur-titre (eyebrow) au-dessus du titre. Vide = texte par défaut si activé. */
    eyebrow?: string
    /** Affiche le titre principal. Indépendant du sur-titre. false = masqué. */
    titleEnabled?: boolean
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
  /** Section « Comment ça marche » (4 étapes, icônes fixes côté rendu). */
  process?: {
    enabled?: boolean
    eyebrow?: string
    title?: string
    description?: string
    steps?: Array<{
      title?: string
      description?: string
    }>
  }
  /** Ordre d'affichage des sections de la homepage (clés de HOME_SECTION_KEYS). */
  sectionOrder?: string[]
}

/**
 * Ordre canonique des sections de la page d'accueil. Il correspond EXACTEMENT
 * à l'ordre de rendu actuel : c'est le repli utilisé quand un tenant n'a jamais
 * configuré d'ordre. Toute nouvelle section ajoutée ici sera automatiquement
 * placée en fin d'ordre pour les tenants ayant déjà un ordre enregistré.
 */
export const HOME_SECTION_KEYS = [
  "about",
  "whyUs",
  "services",
  "process",
  "gallery",
  "reviews",
  "customRequests",
  "contact",
] as const

export type HomeSectionKey = (typeof HOME_SECTION_KEYS)[number]

/** Libellés lisibles pour l'admin (« Ordre des sections »). */
export const HOME_SECTION_LABELS: Record<HomeSectionKey, string> = {
  about: "Présentation",
  whyUs: "Pourquoi nous choisir",
  services: "Prestations",
  process: "Déroulement",
  gallery: "Galerie",
  reviews: "Avis",
  customRequests: "Demandes personnalisées",
  contact: "Contact",
}

/**
 * Normalise l'ordre des sections à partir du JSON du tenant :
 *  - ne conserve que les clés connues, sans doublon ;
 *  - complète avec les sections manquantes dans l'ordre canonique (nouvelles
 *    sections ajoutées automatiquement à la fin) ;
 *  - si rien n'est enregistré, renvoie l'ordre canonique (= ordre actuel).
 */
export function resolveSectionOrder(raw: unknown): HomeSectionKey[] {
  const saved = (raw as SiteContent | null)?.sectionOrder
  const known = new Set<string>(HOME_SECTION_KEYS)
  const seen = new Set<HomeSectionKey>()
  const ordered: HomeSectionKey[] = []
  if (Array.isArray(saved)) {
    for (const k of saved) {
      if (typeof k === "string" && known.has(k) && !seen.has(k as HomeSectionKey)) {
        seen.add(k as HomeSectionKey)
        ordered.push(k as HomeSectionKey)
      }
    }
  }
  for (const k of HOME_SECTION_KEYS) if (!seen.has(k)) ordered.push(k)
  return ordered
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
    eyebrowEnabled: true,
    eyebrow: "Nos prestations",
    titleEnabled: true,
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
  process: {
    enabled: true,
    eyebrow: "Comment ça marche",
    title: "Simple et sans effort",
    description: "Un processus clair en quatre étapes pour une expérience sans souci.",
    steps: [
      {
        title: "1. Réservation",
        description: "Choisissez votre prestation et un créneau qui vous convient, en ligne ou par téléphone.",
      },
      {
        title: "2. Prise en charge",
        description: "Nous venons à vous ou vous accueillons à l'atelier, à l'heure convenue.",
      },
      {
        title: "3. Detailing",
        description: "Votre véhicule est traité avec soin selon un protocole professionnel rigoureux.",
      },
      {
        title: "4. Livraison",
        description: "Vous récupérez un véhicule impeccable, protégé et éclatant de propreté.",
      },
    ],
  },
} as any

/** Nombre d'étapes fixes de la section « Comment ça marche » (rendu standard). */
export const PROCESS_STEP_COUNT = 4

export type ResolvedProcessStep = { title: string; description: string }
export type ResolvedProcessContent = {
  enabled: boolean
  eyebrow: string
  title: string
  description: string
  steps: ResolvedProcessStep[]
}

/**
 * Résout la section « Comment ça marche » : exactement 4 étapes, chaque champ
 * absent, non textuel ou vide retombe sur le texte par défaut correspondant
 * (jamais d'« undefined » ni d'étape vide). Ancienne config sans `process`
 * → rendu par défaut strictement identique à l'ancien rendu codé en dur.
 */
export function resolveProcessContent(raw: unknown): ResolvedProcessContent {
  const defaults = (SITE_CONTENT_DEFAULTS as any).process as ResolvedProcessContent
  const src = (raw && typeof raw === "object" ? raw : {}) as NonNullable<SiteContent["process"]>
  const text = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? v.trim() : fallback)
  const rawSteps = Array.isArray(src.steps) ? src.steps : []
  return {
    enabled: typeof src.enabled === "boolean" ? src.enabled : true,
    eyebrow: text(src.eyebrow, defaults.eyebrow),
    title: text(src.title, defaults.title),
    description: text(src.description, defaults.description),
    steps: defaults.steps.slice(0, PROCESS_STEP_COUNT).map((def, i) => {
      const s = rawSteps[i] && typeof rawSteps[i] === "object" ? rawSteps[i] : {}
      return { title: text(s.title, def.title), description: text(s.description, def.description) }
    }),
  }
}

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
  // Sur-titre Prestations : état du switch. Rétrocompat pour les tenants qui
  // n'ont jamais vu le switch — on déduit de l'ancien comportement
  // « vide = masqué » afin que l'admin reflète exactement le rendu public.
  result.services.eyebrowEnabled = resolveEyebrowEnabled(custom.services)
  // « Comment ça marche » : fusion étape par étape (la fusion superficielle
  // ci-dessus remplacerait le tableau `steps` en entier).
  result.process = resolveProcessContent(custom.process)
  return result
}

/**
 * Détermine si le sur-titre Prestations doit être affiché :
 *  - `eyebrowEnabled` explicite (nouveau modèle avec switch) → cette valeur ;
 *  - sinon rétrocompat : masqué uniquement si `eyebrow` a été explicitement
 *    vidé (""/espaces) ; sinon affiché (clé absente ou texte réel).
 */
function resolveEyebrowEnabled(raw: SiteContent["services"] | undefined): boolean {
  const svc = raw ?? {}
  if (typeof svc.eyebrowEnabled === "boolean") return svc.eyebrowEnabled
  const trimmed = typeof svc.eyebrow === "string" ? svc.eyebrow.trim() : undefined
  return !("eyebrow" in svc) || (trimmed ?? "") !== ""
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

/**
 * Ordre des sections de la homepage pour le TENANT COURANT (site public).
 * Résolution du tenant côté serveur (jamais depuis le client) : ne peut pas
 * renvoyer l'ordre d'une autre entreprise.
 */
export async function getPublicSectionOrder(): Promise<HomeSectionKey[]> {
  const tenant = await resolveRequestTenant()
  return resolveSectionOrder(tenant?.siteContent)
}

/**
 * Sur-titre (eyebrow) de la section Prestations pour le TENANT COURANT.
 *
 * Modèle « switch + texte » :
 *  - switch désactivé                → null (masqué, aucun conteneur rendu) ;
 *  - switch activé + texte réel       → ce texte ;
 *  - switch activé + vide/espaces     → texte par défaut.
 * L'état du switch est déduit avec rétrocompat (voir resolveEyebrowEnabled) :
 * les anciens tenants ayant vidé le champ pour le masquer le restent.
 * Résolution du tenant côté serveur : jamais le sur-titre d'un autre tenant.
 */
export async function getPublicServicesEyebrow(): Promise<string | null> {
  const tenant = await resolveRequestTenant()
  const raw = (tenant?.siteContent as SiteContent | null)?.services ?? {}
  if (!resolveEyebrowEnabled(raw)) return null
  const trimmed = typeof raw.eyebrow === "string" ? raw.eyebrow.trim() : ""
  return trimmed === "" ? SITE_CONTENT_DEFAULTS.services.eyebrow : trimmed
}

/**
 * Configuration résolue des « Demandes personnalisées » pour le TENANT COURANT.
 * Lit `companies.siteContent.customRequests`. Comme getPublicSiteContent, la
 * résolution du tenant se fait côté serveur (jamais depuis le client) : ne peut
 * pas renvoyer la configuration d'une autre entreprise.
 */
export async function getPublicCustomRequestsConfig() {
  const tenant = await resolveRequestTenant()
  const raw = (tenant?.siteContent as { customRequests?: unknown } | null)?.customRequests
  return resolveCustomRequestsConfig(raw)
}
