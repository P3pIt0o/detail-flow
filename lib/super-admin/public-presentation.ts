/**
 * Présentation PUBLIQUE contextuelle d'un tenant dans le Super Admin — helper
 * PUR (aucun accès DB / réseau), calqué sur `companies.onboardingIntent` comme
 * SOURCE DE VÉRITÉ (jamais déduit de licensePlan / features / websiteUrl).
 *
 * Le Super Admin doit refléter le PRODUIT réellement choisi :
 *  - booking_only  → « Réservation en ligne » : le tenant n'a PAS de vitrine
 *                    DetailFlow ; le lien partageable est le moteur de
 *                    réservation canonique `/p/<slug>/reservation` (jamais dupliqué).
 *  - public_page   → « Site vitrine » : la vitrine DetailFlow, servie via
 *                    `/?tenant=<slug>` (comportement historique de la vitrine).
 *  - custom_website / customSiteKey → affichage « site personnalisé » historique.
 *  - null (legacy)  → comportement historique strict (« Site standard »).
 *
 * PRIORITÉ : un `customSiteKey` (Spirit ACS, Rozan, Cleanyzer…) l'emporte
 * toujours et conserve exactement son affichage actuel — aucun site custom
 * n'est affecté par la logique d'intention.
 */

import { tenantPublicUrl, publicReservationUrl } from "@/lib/tenant-shared"
import { customSiteLabel } from "@/lib/custom-sites/meta"

/** Nature du produit public d'un tenant, telle qu'affichée au super-admin. */
export type TenantPublicKind = "reservation" | "vitrine" | "custom" | "standard"

export type TenantPublicPresentation = {
  kind: TenantPublicKind
  /** Libellé du champ méta « Site public » de la carte. */
  siteLabel: string
  /** Libellé de la LIGNE de lien dans le récapitulatif d'accès. */
  linkLabel: string
  /** URL publique RÉELLE correspondant au produit choisi. */
  publicUrl: string
}

/**
 * Dérive la présentation publique d'un tenant à partir de sa valeur canonique
 * `onboardingIntent`, de son éventuel `customSiteKey` et de son slug.
 */
export function resolveTenantPublicPresentation(params: {
  slug: string
  onboardingIntent: string | null | undefined
  customSiteKey: string | null | undefined
  rootDomain?: string
}): TenantPublicPresentation {
  const { slug, onboardingIntent, customSiteKey, rootDomain } = params

  // 1) Site 100 % personnalisé : affichage historique inchangé (prioritaire).
  const customKey = (customSiteKey ?? "").trim()
  if (customKey) {
    return {
      kind: "custom",
      siteLabel: customSiteLabel(customKey) ?? "Site personnalisé",
      linkLabel: "Site public",
      publicUrl: tenantPublicUrl(slug, rootDomain),
    }
  }

  // 2) Produit « moteur/widget de réservation » : pas de vitrine DetailFlow.
  if (onboardingIntent === "booking_only") {
    return {
      kind: "reservation",
      siteLabel: "Réservation / Widget",
      linkLabel: "Lien de réservation",
      publicUrl: publicReservationUrl(slug, rootDomain),
    }
  }

  // 3) Produit « site vitrine » DetailFlow.
  if (onboardingIntent === "public_page") {
    return {
      kind: "vitrine",
      siteLabel: "Site vitrine",
      linkLabel: "Site vitrine",
      publicUrl: tenantPublicUrl(slug, rootDomain),
    }
  }

  // 4) null (legacy) OU custom_website sans clé enregistrée : comportement
  //    historique strict — « Site standard » et URL de vitrine par `?tenant=`.
  return {
    kind: "standard",
    siteLabel: "Site standard",
    linkLabel: "Site public",
    publicUrl: tenantPublicUrl(slug, rootDomain),
  }
}
