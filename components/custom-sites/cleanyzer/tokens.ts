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
 * Base des liens internes du site PUBLIC : « /p/cleanyzer », résolu par le middleware sur tout hôte.
 * Toutes les adresses sont écrites avec cette base ; `ClzLink` la retire au rendu sur le domaine
 * Cleanyzer (L60 : décidé par l'hôte de la requête, plus par une variable d'environnement).
 */
export const CLZ_SITE_BASE = publicPagePath(CLEANYZER_TENANT_SLUG)

/** Hôtes où le site est servi à la racine (liens sans « /p/cleanyzer »). */
const CLZ_ROOT_HOSTS = ["www.cleanyzer.fr", "cleanyzer.fr"]

/** Base des liens selon l'hôte de la requête : « » sur le domaine Cleanyzer, sinon « /p/cleanyzer ». */
export function clzBaseForHost(host: string | null | undefined): string {
  const h = (host ?? "").trim().toLowerCase().replace(/:\d+$/, "")
  return CLZ_ROOT_HOSTS.includes(h) ? "" : CLZ_SITE_BASE
}

/** Chemin public d'une page du site (« / », « /prestations/… »). */
export function clzPath(path: string, base: string = CLZ_SITE_BASE): string {
  const p = path.startsWith("/") ? path : `/${path}`
  if (p === "/") return base || "/"
  return `${base}${p}`
}

/** Adresse écrite avec « /p/cleanyzer » → adresse pour la base donnée (préfixe retiré à la racine). */
export function clzHref(href: string, base: string = CLZ_SITE_BASE): string {
  if (base !== "" || !href.startsWith(CLZ_SITE_BASE)) return href
  const rest = href.slice(CLZ_SITE_BASE.length)
  if (rest === "") return "/"
  // « /p/cleanyzer-autre » n'est pas le site : seul un séparateur suit le préfixe.
  return rest[0] === "/" ? rest : rest[0] === "#" || rest[0] === "?" ? `/${rest}` : href
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
