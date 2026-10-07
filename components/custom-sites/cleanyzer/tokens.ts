/**
 * Identifiants d'ancres et types de navigation CLEANYZER (maquettes Phase 1).
 * Purement structurel — aucune donnée métier, aucun couplage tenant.
 */

import { publicPagePath, publicReservationPath } from "@/lib/tenant-shared"

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

/** Module de réservation standard (BookingV2) du tenant CLEANYZER. */
export const CLZ_BOOKING_HREF = publicReservationPath("cleanyzer")

/** Accueil public officiel du site personnalisé CLEANYZER (production). */
export const CLZ_HOME_HREF = publicPagePath("cleanyzer")

/** Demande personnalisée existante (app/(site)/demande), résolue par tenant. */
export const CLZ_DEMANDE_HREF = `${publicPagePath("cleanyzer")}/demande`
