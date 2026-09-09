/**
 * Constantes partagées du site personnalisé Rozan Cleaning Services.
 *
 * Fichier PUR (aucune dépendance serveur / DB) : importable par les composants
 * serveur ET client de Rozan. On n'y met que des identifiants d'ancres, des
 * classes utilitaires (accent de marque via variables CSS scopées) et des
 * types de lecture.
 */

/** Ancres des sections de la page d'accueil (navigation + scroll). */
export const ROZAN_SECTIONS = {
  accueil: "accueil",
  prestations: "prestations",
  avantApres: "avant-apres",
  realisations: "realisations",
  pourquoi: "pourquoi",
  process: "process",
  avis: "avis",
  zones: "zones",
  faq: "faq",
  devis: "devis",
  contact: "contact",
} as const

/** Bouton principal (accent de marque, pilule premium). */
export const ROZAN_BTN_PRIMARY =
  "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[var(--rozan-accent)] px-7 text-sm font-semibold text-white transition-colors hover:bg-[var(--rozan-accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rozan-accent)] focus-visible:ring-offset-2"

/** Bouton secondaire « contour sombre » sur fond clair. */
export const ROZAN_BTN_OUTLINE =
  "inline-flex h-12 items-center justify-center gap-2 rounded-full border border-[color:var(--rozan-line)] bg-transparent px-7 text-sm font-semibold text-[var(--rozan-fg)] transition-colors hover:border-[var(--rozan-accent)] hover:text-[var(--rozan-accent)]"

/** Bouton secondaire « contour clair » sur fond sombre. */
export const ROZAN_BTN_OUTLINE_DARK =
  "inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/25 bg-transparent px-7 text-sm font-semibold text-white transition-colors hover:border-white hover:bg-white/10"

/** Élément de navigation : ancre in-page, ou route Next si `route` est défini. */
export type RozanNavItem = { id: string; label: string; route?: string }

/**
 * Logo Rozan de repli (à remplacer par le logo officiel fourni). On n'invente
 * jamais un faux logo : tant que le vrai n'est pas là, on affiche le nom de la
 * marque en toutes lettres via le composant de marque.
 */
export const ROZAN_LOGO_FALLBACK: string | null = null
