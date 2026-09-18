/**
 * Identifiants d'ancres et types de navigation CLEANYZER (maquettes Phase 1).
 * Purement structurel — aucune donnée métier, aucun couplage tenant.
 */

export const CLZ_SECTIONS = {
  prestations: "prestations",
  realisations: "realisations",
  apropos: "apropos",
  zone: "zone",
  faq: "faq",
} as const

export type ClzNavItem = { id: string; label: string; href?: string }

/** Base du préfixe des routes de maquette (pour liens internes des mockups). */
export const CLZ_PREVIEW_BASE = "/cleanyzer-preview"
