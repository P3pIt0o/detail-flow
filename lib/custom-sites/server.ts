import "server-only"

/**
 * Adaptateur SERVEUR des sites personnalisés.
 *
 * Deux responsabilités :
 *  1. Résoudre le site personnalisé du TENANT COURANT (dispatch public sûr).
 *  2. Composer le CONTRAT DE DONNÉES PUBLIC à partir des fonctions publiques
 *     existantes du dépôt, sans dupliquer de logique métier.
 *
 * ISOLATION : le tenant est TOUJOURS résolu côté serveur via `getCurrentTenant()`
 * (en-tête posé par le middleware), jamais depuis une valeur du navigateur.
 */

import { getCurrentTenant } from "@/lib/tenant"
import { getPublicContact, getPublicHours } from "@/lib/public-contact"
import { getPublicServices, getPublicReviews } from "@/lib/catalog-queries"
import { getPublicGallery } from "@/lib/public-gallery"
import { getPublicSiteContent, getPublicCustomRequestsConfig } from "@/lib/site-content"
import { getCustomSiteDefinition } from "./registry"
import type { CustomSiteDefinition, CustomSitePublicData } from "./types"

/**
 * Site personnalisé effectif du tenant courant, ou `null` pour le site standard.
 *
 *  - `customSiteKey` NULL / vide  => `null` (site standard exact, historique).
 *  - clé enregistrée              => sa définition.
 *  - clé INCONNUE                 => `null` + journalisation sobre côté serveur
 *                                    (repli sûr : jamais de crash en production).
 *
 * Aucune autre entreprise n'est affectée : la résolution part du seul tenant
 * de la requête.
 */
export async function resolveCustomSite(): Promise<CustomSiteDefinition | null> {
  const tenant = await getCurrentTenant()
  const key = tenant?.customSiteKey?.trim()
  if (!key) return null

  const def = getCustomSiteDefinition(key)
  if (!def) {
    console.log(
      `[v0] custom-sites: clé inconnue "${key}" (tenant "${tenant?.slug}") — repli sur le site standard.`,
    )
    return null
  }
  return def
}

/**
 * Contrat de données public du tenant courant, ou `null` hors contexte tenant.
 *
 * Les données lourdes sont exposées via des loaders paresseux : un site
 * personnalisé n'appelle que ce dont il a besoin sur chaque route.
 */
export async function getCustomSitePublicData(): Promise<CustomSitePublicData | null> {
  const tenant = await getCurrentTenant()
  if (!tenant) return null

  return {
    tenant: {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      logoUrl: tenant.logoUrl ?? null,
      brandPrimary: tenant.brandPrimary ?? null,
      brandSecondary: tenant.brandSecondary ?? null,
    },
    getContact: () => getPublicContact(),
    getHours: () => getPublicHours(),
    getServices: () => getPublicServices() as Promise<Array<Record<string, unknown> & { image: string }>>,
    getReviews: () => getPublicReviews(),
    getGallery: () => getPublicGallery(),
    getContent: () => getPublicSiteContent(),
    getCustomRequestsConfig: () => getPublicCustomRequestsConfig(),
  }
}
