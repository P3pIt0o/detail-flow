/**
 * HELPER CENTRALISÉ des URL publiques par tenant (SEO).
 *
 * Module PUR (aucune dépendance serveur / DB / React) : testable unitairement
 * et importable partout. Il concentre TOUTE la logique de construction des URL
 * canoniques d'un site public multi-tenant, pour éviter toute duplication entre
 * les pages (accueil, avis, contact, prestations…).
 *
 * RÈGLE DE RÉSOLUTION (préparée pour le futur domaine personnalisé) :
 *   1. si le tenant a un domaine personnalisé VÉRIFIÉ → l'URL utilise ce domaine
 *      (sans paramètre `?tenant=`) ;
 *   2. sinon → l'URL DetailFlow (`https://www.detailflow.fr…`) en conservant le
 *      paramètre `?tenant={slug}` (forme fonctionnelle tant que le domaine
 *      personnalisé n'est pas connecté).
 *
 * Aucun domaine n'est inventé ici : tant qu'aucun domaine vérifié n'est fourni,
 * on reste sur la forme `?tenant=`. Le jour où un champ « domaine vérifié » sera
 * ajouté (hors de cette tâche, sans migration ici), il suffira de le mapper dans
 * `tenantSeoIdentity()` — tout le reste (canoniques, sitemap, OG) basculera
 * automatiquement.
 */

import { siteConfig } from "@/config/site"

/** Base absolue DetailFlow, sans slash final (ex. « https://www.detailflow.fr »). */
export const SEO_BASE = siteConfig.seo.url.replace(/\/+$/, "")

/**
 * Identité SEO minimale d'un tenant nécessaire à la construction d'URL.
 * `customDomain` = domaine personnalisé VÉRIFIÉ (sans protocole), ou null/absent.
 */
export type TenantSeoIdentity = {
  slug: string
  customDomain?: string | null
}

/**
 * Construit l'identité SEO d'un tenant à partir de l'entité entreprise.
 *
 * POINT D'EXTENSION UNIQUE pour le futur domaine personnalisé : aujourd'hui,
 * aucune colonne « domaine vérifié » n'existe (et on ne crée pas de migration),
 * donc `customDomain` vaut toujours `null`. Lorsqu'un tel champ sera ajouté,
 * mapper `publicDomain` ici suffira à activer le basculement partout.
 */
export function tenantSeoIdentity(tenant: {
  slug: string
  /** Futur champ « domaine personnalisé vérifié » (n'existe pas encore). */
  publicDomain?: string | null
}): TenantSeoIdentity {
  const domain = (tenant.publicDomain ?? "").trim()
  return { slug: tenant.slug, customDomain: domain ? domain : null }
}

/**
 * Normalise un chemin pour une forme canonique : garantit un slash initial,
 * retire un éventuel query/hash et les slashes finaux superflus. « / » reste « / ».
 */
export function normalizePath(path: string): string {
  if (!path) return "/"
  let p = path.trim()
  if (p === "" || p === "/") return "/"
  if (!p.startsWith("/")) p = `/${p}`
  const cut = p.search(/[?#]/)
  if (cut >= 0) p = p.slice(0, cut)
  p = p.replace(/\/+$/, "")
  return p === "" ? "/" : p
}

/**
 * Origine publique VÉRIFIÉE d'un tenant (ex. « https://www.spirit-acs.fr »), ou
 * `null` si aucun domaine personnalisé n'est encore connecté. Le protocole et
 * les slashes finaux éventuels sont normalisés.
 */
export function resolveTenantOrigin(identity: TenantSeoIdentity): string | null {
  const domain = (identity.customDomain ?? "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "")
  return domain ? `https://${domain}` : null
}

/**
 * URL CANONIQUE absolue d'une page d'un tenant.
 *
 * - domaine vérifié présent → `https://{domaine}{path}` (jamais de `?tenant=`) ;
 * - sinon                   → `https://www.detailflow.fr{path}?tenant={slug}`.
 *
 * `path` accepte « / », « /avis », « /prestations/nettoyage-automobile »…
 * Tout query/hash passé dans `path` est ignoré (forme canonique stricte).
 */
export function tenantCanonicalUrl(path: string, identity: TenantSeoIdentity): string {
  const p = normalizePath(path)
  const origin = resolveTenantOrigin(identity)
  if (origin) {
    return p === "/" ? `${origin}/` : `${origin}${p}`
  }
  const base = p === "/" ? `${SEO_BASE}/` : `${SEO_BASE}${p}`
  const sep = base.includes("?") ? "&" : "?"
  return `${base}${sep}tenant=${encodeURIComponent(identity.slug)}`
}
