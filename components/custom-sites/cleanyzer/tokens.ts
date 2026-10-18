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

/** Slug du tenant CLEANYZER enregistré dans DetailFlow (companies.slug). */
export const CLEANYZER_TENANT_SLUG = "cleanyzer"

/**
 * Base des liens internes du site PUBLIC : TOUJOURS « /p/cleanyzer ».
 *
 * Le middleware résout `/p/<slug>/…` AVANT toute logique d'hôte : ces liens
 * fonctionnent donc à l'identique sur www.detailflow.fr, sur le sous-domaine
 * et sur un futur domaine personnalisé. Des liens racine (« /prestations/… »)
 * casseraient sur www.detailflow.fr/p/cleanyzer (réécrits vers la vitrine
 * marketing). La canonique, elle, suit `TENANT_CANONICAL_HOST` (tenant-url.ts).
 */
export const CLZ_SITE_BASE = publicPagePath(CLEANYZER_TENANT_SLUG)

/** Chemin public d'une page du site (« / », « /prestations/… »). */
export function clzPath(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`
  if (p === "/") return CLZ_SITE_BASE
  return `${CLZ_SITE_BASE}${p}`
}

/**
 * Module de réservation standard (BookingV2) du tenant CLEANYZER — AUTOMOBILE
 * uniquement. Le textile (canapé, matelas, tapis, moquette) passe TOUJOURS par
 * `CLZ_DEMANDE_HREF`. `/p/<slug>/reservation` fonctionne aussi sur un domaine
 * personnalisé (préfixe résolu par le middleware sur tout hôte).
 */
export const CLZ_BOOKING_HREF = publicReservationPath(CLEANYZER_TENANT_SLUG)

/**
 * Identifiants réels (table `services`, tenant CLEANYZER) vérifiés dans Neon.
 * Diamond : sur devis, volontairement absent (aucune présélection).
 */
export const CLZ_SERVICE_IDS: Record<"interieur" | "exterieur", Partial<Record<string, number>>> = {
  interieur: { eco: 143, premium: 144, excellence: 145 },
  exterieur: { eco: 146, premium: 157, excellence: 147 },
}

/**
 * Lien BookingV2 avec présélection via le mécanisme existant `?service=<id>`.
 * Formule inconnue → parcours BookingV2 normal, sans présélection.
 */
export function clzBookingHref(kind: "interieur" | "exterieur", formulaKey: string): string {
  const id = CLZ_SERVICE_IDS[kind][formulaKey]
  return id ? `${CLZ_BOOKING_HREF}?service=${id}` : CLZ_BOOKING_HREF
}

/** Accueil public officiel du site personnalisé CLEANYZER (production). */
export const CLZ_HOME_HREF = clzPath("/")

/** Demande personnalisée existante (app/(site)/demande), résolue par tenant. */
export const CLZ_DEMANDE_HREF = clzPath("/demande")
