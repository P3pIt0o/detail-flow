/**
 * Constantes partagées du site personnalisé Spirit ACS.
 *
 * Aucune donnée métier ici : uniquement des identifiants d'ancres, des classes
 * utilitaires (couleurs de marque Spirit via variables CSS scopées) et les
 * types de lecture seule du contrat public déjà résolu côté serveur.
 *
 * Ce fichier est PUR (aucune dépendance serveur / DB) : il peut être importé
 * aussi bien par les composants serveur que client de Spirit.
 */

/** Ancres des sections (navigation par ancres + scroll-spy). */
export const SPIRIT_SECTIONS = {
  prestations: "prestations",
  realisations: "realisations",
  apropos: "apropos",
  avis: "avis",
  contact: "contact",
} as const

/**
 * Classes du bouton principal Spirit (rose de marque). Passées à `CtaButton` :
 * `tailwind-merge` remplace alors `bg-primary`/`text-primary-foreground` par
 * ces valeurs scopées, sans toucher au thème global des autres tenants.
 */
export const SPIRIT_BTN_PRIMARY =
  "bg-[var(--spirit-pink)] text-white shadow-none hover:bg-[var(--spirit-pink-strong)] hover:shadow-[0_12px_34px_-12px_var(--spirit-pink)]"

/** Bouton secondaire « contour clair » sur fond sombre (variant outline). */
export const SPIRIT_BTN_GHOST =
  "border-white/35 bg-transparent text-white hover:border-[var(--spirit-teal)] hover:text-[var(--spirit-teal)]"

/** Bouton secondaire « contour sombre » sur fond clair (variant outline). */
export const SPIRIT_BTN_GHOST_DARK =
  "border-[color:var(--spirit-ink)]/20 bg-transparent text-[var(--spirit-ink)] hover:border-[var(--spirit-teal-strong)] hover:text-[var(--spirit-teal-strong)]"

/**
 * Contenu éditable résolu des sections statiques (miroir de la valeur renvoyée
 * par `getContent()`, typée `unknown` dans le contrat public). Tous les champs
 * sont déjà normalisés côté serveur (repli sur les défauts neutres).
 */
export type SpiritResolvedContent = {
  about: { title: string; text: string; buttonLabel: string; buttonHref: string }
  services: { eyebrowEnabled: boolean; eyebrow: string; titleEnabled: boolean; title: string; intro: string }
  gallery: { enabled: boolean; title: string; intro: string }
  reviews: { enabled: boolean; title: string; intro: string }
  contact: { enabled: boolean; title: string; text: string; buttonLabel: string }
  footer: { text: string; tagline: string }
}

/** Prestation publique amincie (sérialisable) transmise aux sections client. */
export type SpiritService = {
  id: number
  name: string
  description: string | null
  image: string
  basePriceCents: number
}

/** Élément de navigation (ancre interne à la page longue). */
export type SpiritNavItem = { id: string; label: string }
