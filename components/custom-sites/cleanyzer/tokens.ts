/**
 * Identifiants d'ancres et types de navigation CLEANYZER (maquettes Phase 1).
 * Purement structurel — aucune donnée métier, aucun couplage tenant.
 */

import { publicPagePath } from "@/lib/tenant-shared"

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
 * Base des liens internes du site PUBLIC (L59).
 *
 * Production : « » (racine) — `/p/cleanyzer/*` y redirige toujours (308) vers www.cleanyzer.fr, autant
 * lier directement les adresses finales. Preview et local : « /p/cleanyzer » (résolu par le middleware
 * sur tout hôte). Variable absente → « /p/cleanyzer », valide partout grâce à la redirection.
 * shortcut: l'adresse technique *.vercel.app du déploiement de production aurait des liens racine
 * cassés, passer à une base par hôte si cette adresse doit servir.
 */
export const clzSiteBase = (vercelEnv: string | undefined) =>
  vercelEnv === "production" ? "" : publicPagePath(CLEANYZER_TENANT_SLUG)
export const CLZ_SITE_BASE = clzSiteBase(process.env.NEXT_PUBLIC_VERCEL_ENV)

/** Chemin public d'une page du site (« / », « /prestations/… »). */
export function clzPath(path: string, base: string = CLZ_SITE_BASE): string {
  const p = path.startsWith("/") ? path : `/${path}`
  if (p === "/") return base || "/"
  return `${base}${p}`
}

/**
 * Module de réservation standard (BookingV2) du tenant CLEANYZER — AUTOMOBILE
 * uniquement. Le textile (canapé, matelas, tapis, moquette) passe TOUJOURS par
 * `CLZ_DEMANDE_HREF`.
 */
export const CLZ_BOOKING_HREF = clzPath("/reservation")

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

/**
 * L55 — `/reservation` aux couleurs néon avec l'en-tête et le pied du site CLEANYZER : seulement si
 * le site personnalisé PUBLIÉ du tenant est « cleanyzer » (clé résolue côté serveur) et hors widget.
 */
export function clzBookingNeon(publishedCustomSiteKey: string | null | undefined, isEmbed: boolean): boolean {
  return !isEmbed && publishedCustomSiteKey?.trim() === "cleanyzer"
}

/** Accueil public officiel du site personnalisé CLEANYZER (production). */
export const CLZ_HOME_HREF = clzPath("/")

/** Demande personnalisée existante (app/(site)/demande), résolue par tenant. */
export const CLZ_DEMANDE_HREF = clzPath("/demande")
