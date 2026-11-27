/**
 * Prix « dès » et JSON-LD `Service` des prestations Spirit ACS (L85).
 *
 * Fonctions PURES, sans serveur ni base : elles ne font que LIRE les formules
 * déjà validées dans `seo-content.ts`. Aucun montant n'est écrit ici.
 *  - Seules les formules `exact` / `from` ayant un `priceCents` sont publiées.
 *  - Rien pour `quote` (PPF, devis) ; pas d'`aggregateRating`.
 */

import { formatPrice } from "@/lib/format"
import { SPIRIT_CITIES, type ServiceContent, type ServiceFormula } from "./seo-content"

/** Formule chiffrée (montant confirmé en centimes). */
type PricedFormula = ServiceFormula & { priceCents: number }

/** Formules publiables : `exact` / `from` avec un montant entier positif. */
export function spiritPricedFormulas(service: Pick<ServiceContent, "formules">): PricedFormula[] {
  return (service.formules ?? []).filter(
    (f): f is PricedFormula =>
      (f.priceKind === "exact" || f.priceKind === "from") &&
      typeof f.priceCents === "number" &&
      Number.isInteger(f.priceCents) &&
      f.priceCents > 0,
  )
}

/**
 * Plus petit montant publié d'une prestation, avec le NOM de la formule
 * concernée (D1 : le prix n'est jamais affiché sans sa formule). `null` si la
 * prestation est entièrement sur devis.
 */
export function spiritStartingPrice(
  service: Pick<ServiceContent, "formules">,
): { priceCents: number; label: string; unit?: string; condition?: string } | null {
  const priced = spiritPricedFormulas(service)
  if (priced.length === 0) return null
  const min = priced.reduce((a, b) => (b.priceCents < a.priceCents ? b : a))
  return {
    priceCents: min.priceCents,
    label: min.label,
    ...(min.priceUnit ? { unit: min.priceUnit } : {}),
    ...(min.startingCondition ? { condition: min.startingCondition } : {}),
  }
}

/** Les deux parties du prix « dès » : montant avec son unité, puis formule et conditions. */
export function spiritStartingPriceParts(
  service: Pick<ServiceContent, "formules">,
): { amount: string; detail: string } | null {
  const start = spiritStartingPrice(service)
  if (!start) return null
  return {
    amount: `dès ${formatPrice(start.priceCents)}${start.unit ? ` ${start.unit}` : ""}`,
    detail: `${start.label}${start.condition ?? ""}`,
  }
}

/** Libellé complet : « dès 15,00 € par chaise · À partir de 5 chaises », ou « Sur devis ». */
export function spiritStartingPriceLabel(service: Pick<ServiceContent, "formules">): string {
  const parts = spiritStartingPriceParts(service)
  return parts ? `${parts.amount} · ${parts.detail}` : "Sur devis"
}

/** Une `Offer` Schema.org par formule chiffrée (montant en euros = centimes / 100). */
export function spiritServiceOffers(service: Pick<ServiceContent, "formules">): Array<Record<string, unknown>> {
  return spiritPricedFormulas(service).map((f) => ({
    "@type": "Offer",
    name: f.label,
    ...(f.note?.trim() ? { description: f.note.trim() } : {}),
    priceCurrency: "EUR",
    priceSpecification: {
      "@type": "PriceSpecification",
      minPrice: f.priceCents / 100,
      priceCurrency: "EUR",
    },
  }))
}

/**
 * JSON-LD `Service` d'une page prestation Spirit. Le prestataire est référencé
 * par l'`@id` stable de l'établissement (`<accueil>#business`, D7). `offers`
 * est omis si aucune formule n'est chiffrée.
 */
export function buildSpiritServiceJsonLd(args: {
  service: Pick<ServiceContent, "h1" | "metaDescription" | "breadcrumbLabel" | "formules">
  /** URL canonique absolue de la page. */
  url: string
  /** `@id` de l'établissement (`<accueil canonique>#business`). */
  providerId: string
  providerName: string
}): Record<string, unknown> {
  const offers = spiritServiceOffers(args.service)
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: args.service.h1,
    description: args.service.metaDescription,
    url: args.url,
    serviceType: args.service.breadcrumbLabel,
    provider: { "@type": "AutoWash", "@id": args.providerId, name: args.providerName },
    areaServed: SPIRIT_CITIES.map((name) => ({ "@type": "City", name })),
    ...(offers.length ? { offers } : {}),
  }
}

/**
 * Options du JSON-LD `AutoWash` de Spirit (layout du site) : les 14 communes en
 * objets `City` et l'`@id` stable référencé par les pages prestation.
 */
export const SPIRIT_LOCAL_BUSINESS_OPTIONS: {
  areaServed: string[]
  areaServedAsCity: boolean
  withStableId: boolean
} = {
  areaServed: [...SPIRIT_CITIES],
  areaServedAsCity: true,
  withStableId: true,
}
