/**
 * Constructeurs PURS de données structurées Schema.org (JSON-LD).
 *
 * Aucune dépendance serveur / DB / React : testables unitairement et
 * réutilisables par toutes les pages publiques. Règle d'or : ne JAMAIS émettre
 * une propriété vide et ne JAMAIS inventer de valeur. Chaque champ n'apparaît
 * que si une donnée RÉELLE est fournie par l'appelant.
 */

import { normalizePhoneForJsonLd } from "./phone"

/** Adresse postale structurée (champs réels du tenant). */
export type PostalAddressInput = {
  /** Rue / voie (ex. « 12 rue des Artisans »). */
  streetAddress?: string | null
  postalCode?: string | null
  /** Ville (addressLocality). */
  addressLocality?: string | null
  /** Région / état (addressRegion, ex. « Île-de-France »). */
  addressRegion?: string | null
  /** Code pays ISO (ex. « FR »). */
  addressCountry?: string | null
}

/** Horaire d'un jour (0 = dimanche … 6 = samedi). */
export type OpeningHoursDay = {
  day: number
  open: boolean
  from: string | null
  to: string | null
}

/** Fragment du `@id` stable de l'établissement (`<accueil canonique>#business`). */
export const LOCAL_BUSINESS_ID_FRAGMENT = "#business"

export type LocalBusinessInput = {
  /** `@id` stable optionnel ; omis par défaut (sortie inchangée). */
  id?: string | null
  /** Type Schema.org (défaut « AutoWash »). */
  type?: string
  name: string
  /** Nom commercial alternatif (ex. sigle « Spirit ACS »). */
  alternateName?: string | null
  url?: string | null
  telephone?: string | null
  email?: string | null
  image?: string | null
  logo?: string | null
  address?: PostalAddressInput | null
  openingHours?: OpeningHoursDay[] | null
  areaServed?: string[] | null
  sameAs?: string[] | null
  hasMap?: string | null
  /** Fourchette de prix réellement publiée (ex. « 30 € – 160 € »). */
  priceRange?: string | null
}

/** Jours Schema.org indexés 0 (dimanche) → 6 (samedi). */
const SCHEMA_DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const

function clean(v: string | null | undefined): string | null {
  const t = (v ?? "").trim()
  return t ? t : null
}

/**
 * Assainit une liste d'URL de réseaux sociaux / profils (`sameAs`) :
 *  - ne conserve que des URL HTTP/HTTPS valides ;
 *  - retire les chaînes vides ;
 *  - supprime les doublons (en préservant l'ordre d'apparition).
 */
export function sanitizeSameAs(urls: (string | null | undefined)[] | null | undefined): string[] {
  if (!urls) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of urls) {
    const v = clean(raw)
    if (!v) continue
    let parsed: URL
    try {
      parsed = new URL(v)
    } catch {
      continue
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue
    if (seen.has(v)) continue
    seen.add(v)
    out.push(v)
  }
  return out
}

/** Construit un objet PostalAddress, ou `null` si aucune donnée exploitable. */
export function buildPostalAddress(input: PostalAddressInput | null | undefined): Record<string, unknown> | null {
  if (!input) return null
  const street = clean(input.streetAddress)
  const postal = clean(input.postalCode)
  const locality = clean(input.addressLocality)
  const region = clean(input.addressRegion)
  const country = clean(input.addressCountry)
  // Il faut au moins une localité OU une rue pour une adresse crédible.
  if (!street && !locality) return null
  return {
    "@type": "PostalAddress",
    ...(street ? { streetAddress: street } : {}),
    ...(postal ? { postalCode: postal } : {}),
    ...(locality ? { addressLocality: locality } : {}),
    ...(region ? { addressRegion: region } : {}),
    ...(country ? { addressCountry: country } : {}),
  }
}

/**
 * Regroupe les jours ouvrés partageant les mêmes horaires en spécifications
 * `OpeningHoursSpecification`. Ignore les jours fermés ou incomplets.
 */
export function buildOpeningHours(
  days: OpeningHoursDay[] | null | undefined,
): Array<Record<string, unknown>> {
  if (!days || days.length === 0) return []
  const specs: Array<Record<string, unknown>> = []
  for (const d of days) {
    if (!d.open || !d.from || !d.to) continue
    const dayName = SCHEMA_DAYS[d.day]
    if (!dayName) continue
    // Fusionne avec une spécification existante identique (mêmes heures).
    const existing = specs.find((s) => s.__from === d.from && s.__to === d.to)
    if (existing) {
      ;(existing.dayOfWeek as string[]).push(dayName)
    } else {
      specs.push({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: [dayName],
        opens: d.from,
        closes: d.to,
        __from: d.from,
        __to: d.to,
      })
    }
  }
  // Retire les clés techniques de fusion.
  return specs.map(({ __from, __to, ...rest }) => rest)
}

/**
 * Construit le JSON-LD d'un établissement local (défaut `AutoWash`), en
 * n'incluant que les propriétés réellement disponibles. Renvoie un objet prêt
 * à sérialiser.
 */
export function buildLocalBusinessJsonLd(input: LocalBusinessInput): Record<string, unknown> {
  const address = buildPostalAddress(input.address)
  const hours = buildOpeningHours(input.openingHours)
  const area = (input.areaServed ?? []).map((a) => clean(a)).filter((a): a is string => a !== null)
  const sameAs = sanitizeSameAs(input.sameAs)
  // Téléphone normalisé E.164 pour le JSON-LD, en tenant compte du pays de
  // l'adresse (aucune valeur en dur, aucune écriture en base).
  const telephone = normalizePhoneForJsonLd(input.telephone, input.address?.addressCountry)

  return {
    "@context": "https://schema.org",
    "@type": input.type ?? "AutoWash",
    ...(clean(input.id) ? { "@id": clean(input.id) } : {}),
    name: input.name,
    ...(clean(input.alternateName) ? { alternateName: clean(input.alternateName) } : {}),
    ...(clean(input.url) ? { url: clean(input.url) } : {}),
    ...(telephone ? { telephone } : {}),
    ...(clean(input.email) ? { email: clean(input.email) } : {}),
    ...(clean(input.image) ? { image: clean(input.image) } : {}),
    ...(clean(input.logo) ? { logo: clean(input.logo) } : {}),
    ...(address ? { address } : {}),
    ...(hours.length ? { openingHoursSpecification: hours } : {}),
    ...(area.length ? { areaServed: area } : {}),
    ...(sameAs.length ? { sameAs } : {}),
    ...(clean(input.hasMap) ? { hasMap: clean(input.hasMap) } : {}),
    ...(clean(input.priceRange) ? { priceRange: clean(input.priceRange) } : {}),
  }
}

/** Offre publiée d'une prestation (prix TTC réel en euros, jamais estimé). */
export type ServiceOfferInput = { name: string; price: number }

export type ServiceInput = {
  /** Nom de la prestation (ex. « Nettoyage intérieur de voiture à domicile »). */
  name: string
  description?: string | null
  /** URL canonique ABSOLUE de la page de la prestation. */
  url: string
  /** Type de service (ex. « Nettoyage automobile »). */
  serviceType?: string | null
  /** Prestataire : nom + URL canonique de l'accueil. */
  provider: { name: string; url: string; type?: string; id?: string }
  areaServed?: string[] | null
  image?: string | null
  /** Offres à prix FIXE publiés ; les prix « sur devis » sont exclus. */
  offers?: ServiceOfferInput[] | null
}

/**
 * Construit un `Service` Schema.org. Les offres à prix publiés sont regroupées
 * dans un `OfferCatalog` et résumées par une `AggregateOffer` (prix min/max) ;
 * aucune offre n'est émise sans prix réel.
 */
export function buildServiceJsonLd(input: ServiceInput): Record<string, unknown> {
  const area = (input.areaServed ?? []).map((a) => clean(a)).filter((a): a is string => a !== null)
  const offers = (input.offers ?? []).filter((o) => Number.isFinite(o.price) && o.price > 0 && clean(o.name))
  const prices = offers.map((o) => o.price)
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: input.name,
    ...(clean(input.description) ? { description: clean(input.description) } : {}),
    url: input.url,
    ...(clean(input.serviceType) ? { serviceType: clean(input.serviceType) } : {}),
    provider: {
      "@type": input.provider.type ?? "AutoWash",
      ...(clean(input.provider.id) ? { "@id": clean(input.provider.id) } : {}),
      name: input.provider.name,
      url: input.provider.url,
    },
    ...(area.length ? { areaServed: area.map((name) => ({ "@type": "City", name })) } : {}),
    ...(clean(input.image) ? { image: clean(input.image) } : {}),
    ...(offers.length
      ? {
          offers: {
            "@type": "AggregateOffer",
            priceCurrency: "EUR",
            lowPrice: Math.min(...prices),
            highPrice: Math.max(...prices),
            offerCount: offers.length,
          },
          hasOfferCatalog: {
            "@type": "OfferCatalog",
            name: input.name,
            itemListElement: offers.map((o) => ({
              "@type": "Offer",
              name: o.name,
              price: o.price,
              priceCurrency: "EUR",
            })),
          },
        }
      : {}),
  }
}

/** Élément d'un fil d'Ariane (nom + URL absolue). */
export type BreadcrumbItem = { name: string; url: string }

/** Construit un `BreadcrumbList` Schema.org à partir d'items ordonnés. */
export function buildBreadcrumbJsonLd(items: BreadcrumbItem[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  }
}

/** Question / réponse d'une FAQ (texte brut, identique au contenu visible). */
export type FaqEntry = { question: string; answer: string }

/**
 * Construit un `FAQPage` Schema.org. Le contenu DOIT correspondre EXACTEMENT à
 * la FAQ visible sur la page (aucune question/réponse cachée ou différente).
 */
export function buildFaqJsonLd(entries: FaqEntry[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entries.map((e) => ({
      "@type": "Question",
      name: e.question,
      acceptedAnswer: { "@type": "Answer", text: e.answer },
    })),
  }
}
