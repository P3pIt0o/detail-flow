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
  accueil: "accueil",
  prestations: "prestations",
  realisations: "realisations",
  avantApres: "avant-apres",
  apropos: "apropos",
  avis: "avis",
  demandeDevis: "demande-devis",
  contact: "contact",
} as const

/**
 * Classes du bouton principal Spirit (rose de marque). Passées à `CtaButton` :
 * `tailwind-merge` remplace alors `bg-primary`/`text-primary-foreground` par
 * ces valeurs scopées, sans toucher au thème global des autres tenants.
 */
export const SPIRIT_BTN_PRIMARY =
  "h-12 rounded-sm bg-[var(--spirit-pink)] text-white shadow-none hover:bg-[var(--spirit-pink-strong)] hover:brightness-100 hover:shadow-[0_12px_30px_-14px_var(--spirit-pink)]"

/** Bouton secondaire « contour clair » sur fond sombre (variant outline). */
export const SPIRIT_BTN_GHOST =
  "h-12 rounded-sm border-white/35 bg-transparent text-white hover:border-[var(--spirit-teal)] hover:text-[var(--spirit-teal)]"

/** Bouton secondaire « contour sombre » sur fond clair (variant outline). */
export const SPIRIT_BTN_GHOST_DARK =
  "h-12 rounded-sm border-[color:var(--spirit-ink)]/25 bg-transparent text-[var(--spirit-ink)] hover:border-[var(--spirit-teal-strong)] hover:text-[var(--spirit-teal-strong)]"

/**
 * Logo Spirit officiel EMBARQUÉ (asset réel, repli quand le tenant n'a pas
 * encore téléversé son logo). N'est jamais un faux logo typographique : c'est
 * le logo de marque fourni. En production, le logo réel du tenant
 * (`/api/company-logo`) reste prioritaire.
 */
export const SPIRIT_LOGO_FALLBACK = "/spirit-acs/spirit-logo.png"

/**
 * Boutons « ancre » (liens internes à la longue page). Rectangulaires et nets,
 * dans l'esprit de la maquette. `CtaButton` sert aux liens de ROUTE (tenant
 * préservé) ; pour les ancres in-page on utilise un simple <a> stylé.
 */
export const SPIRIT_ANCHOR_PRIMARY =
  "inline-flex h-12 items-center justify-center rounded-sm bg-[var(--spirit-pink)] px-7 text-sm font-semibold uppercase tracking-wide text-white transition-colors hover:bg-[var(--spirit-pink-strong)]"

export const SPIRIT_ANCHOR_OUTLINE =
  "inline-flex h-12 items-center justify-center rounded-sm border border-[color:var(--spirit-teal)]/60 px-7 text-sm font-semibold uppercase tracking-wide text-[var(--spirit-teal)] transition-colors hover:border-[var(--spirit-teal)] hover:bg-[color:var(--spirit-teal)]/10"

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
