/**
 * Constructeur CENTRALISÉ de métadonnées de page par tenant.
 *
 * Évite toute duplication entre les pages publiques (accueil, avis, contact,
 * prestations…) : chaque page fournit son titre / sa description / son chemin,
 * et ce module produit un objet `Metadata` cohérent (canonique tenant-aware,
 * Open Graph, Twitter Card, image, favicon éventuel) via le helper d'URL.
 *
 * Aucune donnée inventée : les textes proviennent des appelants (config
 * éditoriale du tenant ou valeurs réelles). La canonique et l'`og:url`
 * partagent EXACTEMENT la même URL (issue de `tenantCanonicalUrl`).
 */

import type { Metadata } from "next"
import { siteConfig } from "@/config/site"
import { tenantCanonicalUrl, type TenantSeoIdentity } from "./tenant-url"

export type TenantPageMetadataInput = {
  /** Identité SEO du tenant (slug + éventuel domaine vérifié). */
  identity: TenantSeoIdentity
  /** Chemin de la page (« / », « /avis », « /prestations/... »). */
  path: string
  /** Titre complet de la page (balise <title> ET og:title / twitter:title). */
  title: string
  /** Meta description (ET og:description / twitter:description). */
  description: string
  /** Nom du site / de l'entreprise (og:siteName). */
  siteName: string
  /** URL ABSOLUE de l'image Open Graph (1200×630 recommandé). */
  imageUrl: string
  /** Texte alternatif de l'image OG (défaut : nom du site). */
  imageAlt?: string
  /** Icônes/favicon propres au tenant (optionnel). */
  icons?: Metadata["icons"]
  /** Surcharge d'indexation (ex. pages légales : noindex, follow). */
  robots?: Metadata["robots"]
}

/**
 * Produit l'objet `Metadata` complet d'une page tenant. La canonique et
 * `og:url` sont identiques et tenant-aware (paramètre `?tenant=` conservé tant
 * qu'aucun domaine personnalisé vérifié n'est configuré).
 */
export function buildTenantPageMetadata(input: TenantPageMetadataInput): Metadata {
  const canonical = tenantCanonicalUrl(input.path, input.identity)
  const alt = input.imageAlt ?? input.siteName

  return {
    title: { absolute: input.title },
    description: input.description,
    alternates: { canonical },
    ...(input.icons ? { icons: input.icons } : {}),
    ...(input.robots ? { robots: input.robots } : {}),
    openGraph: {
      type: "website",
      locale: siteConfig.seo.locale,
      url: canonical,
      siteName: input.siteName,
      title: input.title,
      description: input.description,
      images: [{ url: input.imageUrl, width: 1200, height: 630, alt }],
    },
    twitter: {
      card: "summary_large_image",
      title: input.title,
      description: input.description,
      images: [input.imageUrl],
    },
  }
}
