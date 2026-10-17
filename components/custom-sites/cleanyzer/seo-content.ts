/**
 * ============================================================================
 *  CLEANYZER — CONTENU SEO DU SITE PUBLIC (pages indexables)
 * ============================================================================
 *
 *  Source de vérité ÉDITORIALE des pages publiques de CLEANYZER : métadonnées
 *  de l'accueil, 3 pages de prestations et 1 page « zone d'intervention ».
 *
 *  RÈGLE (cahier §10) : aucun chiffre n'est écrit en dur ici. Les prix, les
 *  règles de déplacement et les horaires sont LUS dans `content.ts` (barème de
 *  Tom) : si un tarif change là-bas, toutes les pages, FAQ et données
 *  structurées suivent automatiquement.
 *
 *  Mots-clés visés (recherche locale) : nettoyage voiture à domicile Annecy,
 *  nettoyage intérieur voiture Annecy, lavage voiture à domicile Annecy,
 *  nettoyage canapé Annecy. Une intention = une page (pas de cannibalisation :
 *  l'accueil vise la requête générique, chaque page sa prestation, la page zone
 *  les communes du secteur, sans pages satellites par commune).
 *
 *  Module PUR (aucune dépendance React / serveur) : importable par la route,
 *  le sitemap (via le catalogue public) et les tests.
 * ============================================================================
 */

import {
  BRAND,
  EXTERIEUR_FORMULAS,
  EXTERIEUR_OPTIONS,
  INTERIEUR_FORMULAS,
  INTERIEUR_OPTIONS,
  TEXTILE_ITEMS,
  TEXTILE_SUPPLEMENTS,
  TRAVEL,
  VEHICLES,
  type Formula,
} from "./content"

export type ClzFaq = { q: string; a: string }

/* -------------------------------------------------------------------------- */
/*  Prix dérivés du barème (jamais saisis à la main)                          */
/* -------------------------------------------------------------------------- */

function fixedPrices(formulas: Formula[]): number[] {
  return formulas.flatMap((f) => Object.values(f.prices).filter((p): p is number => p != null))
}

function formula(formulas: Formula[], key: string): Formula {
  const f = formulas.find((x) => x.key === key)
  if (!f) throw new Error(`[cleanyzer] formule inconnue : ${key}`)
  return f
}

/** « 50 € (citadine), 60 € (berline) et 75 € (SUV) » */
function perVehicle(f: Formula): string {
  const parts = VEHICLES.map((v) => `${f.prices[v.key]} € (${v.label.toLowerCase()})`)
  return `${parts.slice(0, -1).join(", ")} et ${parts[parts.length - 1]}`
}

export const CLZ_PRICES = {
  interieurMin: Math.min(...fixedPrices(INTERIEUR_FORMULAS)),
  interieurMax: Math.max(...fixedPrices(INTERIEUR_FORMULAS)),
  exterieurMin: Math.min(...fixedPrices(EXTERIEUR_FORMULAS)),
  exterieurMax: Math.max(...fixedPrices(EXTERIEUR_FORMULAS)),
  textileMin: Math.min(...TEXTILE_ITEMS.map((t) => t.price).filter((p): p is number => p != null)),
}

/** Fourchette publiée pour le JSON-LD de l'établissement (formules à prix fixe). */
export const CLZ_PRICE_RANGE = `${Math.min(CLZ_PRICES.interieurMin, CLZ_PRICES.exterieurMin, CLZ_PRICES.textileMin)} € – ${Math.max(
  CLZ_PRICES.interieurMax,
  CLZ_PRICES.exterieurMax,
)} €`

const ZONE_SENTENCE = `${TRAVEL.includedKmOneWay} km à l'aller depuis Choisy, près d'Annecy, sont inclus (soit ${TRAVEL.includedKmRoundTrip} km aller-retour). Au-delà, le déplacement est facturé ${TRAVEL.pricePerExtraKm} € par kilomètre supplémentaire parcouru.`
const HOURS_SENTENCE = `du ${TRAVEL.daysLabel.toLowerCase()}, de ${TRAVEL.hoursLabel}`

/** Zone servie déclarée dans le JSON-LD (cahier §9 : Annecy et alentours). */
export const CLZ_AREA_SERVED = ["Annecy"]

/* -------------------------------------------------------------------------- */
/*  Accueil                                                                    */
/* -------------------------------------------------------------------------- */

export const CLZ_HOME_META = {
  title: `Nettoyage voiture à domicile à Annecy | ${BRAND.name}`,
  description: `Nettoyage intérieur et extérieur de voiture à domicile à Annecy et alentours, 7j/7. Formules dès ${CLZ_PRICES.exterieurMin} €, réservation en ligne. Canapé et textile sur demande.`,
}

/* -------------------------------------------------------------------------- */
/*  Pages de prestations                                                       */
/* -------------------------------------------------------------------------- */

export type ClzServiceKind = "interieur" | "exterieur" | "textile"

export type ClzServicePage = {
  slug: string
  kind: ClzServiceKind
  /** Libellé court (navigation, fil d'Ariane, cartes, pied de page). */
  label: string
  metaTitle: string
  metaDescription: string
  eyebrow: string
  h1: string
  intro: string
  /** Réponse directe placée en tête (SEO / moteurs de réponse). */
  answer: ClzFaq
  /** Nom Schema.org du service. */
  serviceName: string
  serviceType: string
  image: string
  imageAlt: string
  faq: ClzFaq[]
  sitemapPriority: number
}

const INT_ECO = formula(INTERIEUR_FORMULAS, "eco")
const INT_PREMIUM = formula(INTERIEUR_FORMULAS, "premium")
const INT_EXC = formula(INTERIEUR_FORMULAS, "excellence")
const EXT_ECO = formula(EXTERIEUR_FORMULAS, "eco")
const EXT_EXC = formula(EXTERIEUR_FORMULAS, "excellence")
const optionPrice = (key: string) => {
  const o = [...INTERIEUR_OPTIONS, ...EXTERIEUR_OPTIONS].find((x) => x.key === key)
  if (!o || o.price == null) throw new Error(`[cleanyzer] option sans prix fixe : ${key}`)
  return o.price
}
const canape = (key: string) => {
  const t = TEXTILE_ITEMS.find((x) => x.key === key)
  if (!t) throw new Error(`[cleanyzer] article textile inconnu : ${key}`)
  return t.priceLabel
}

export const CLZ_SERVICE_PAGES: ClzServicePage[] = [
  {
    slug: "nettoyage-interieur-voiture-annecy",
    kind: "interieur",
    label: "Nettoyage intérieur",
    metaTitle: `Nettoyage intérieur voiture à Annecy, à domicile | ${BRAND.name}`,
    metaDescription: `Nettoyage intérieur de voiture à domicile à Annecy : aspiration, plastiques, vitres, shampoing des sièges et tapis. Dès ${CLZ_PRICES.interieurMin} €, réservation en ligne 7j/7.`,
    eyebrow: "Nettoyage automobile · intérieur",
    h1: "Nettoyage intérieur de voiture à domicile à Annecy",
    intro: `Aspiration, plastiques, vitres, sièges et tapis : Tom nettoie l'habitacle de votre voiture chez vous, à Annecy et alentours. Trois formules à prix fixe, dès ${CLZ_PRICES.interieurMin} €.`,
    answer: {
      q: "Combien coûte un nettoyage intérieur de voiture à Annecy ?",
      a: `La formule Premium coûte ${perVehicle(INT_PREMIUM)}. L'Excellence, avec shampoing des sièges et des tapis, coûte ${perVehicle(INT_EXC)}. La formule Éco démarre à ${INT_ECO.prices.citadine} € après une première intervention. Le déplacement est inclus dans un rayon de ${TRAVEL.includedKmOneWay} km.`,
    },
    serviceName: "Nettoyage intérieur de voiture à domicile",
    serviceType: "Nettoyage intérieur automobile",
    image: "/custom-sites/cleanyzer/interieur-audi.webp",
    imageAlt: "Habitacle d'Audi nettoyé : volant, tableau de bord et sièges en cuir",
    faq: [
      {
        q: "Que comprend le nettoyage intérieur Premium ?",
        a: `${INT_PREMIUM.content} Il coûte ${perVehicle(INT_PREMIUM)}.`,
      },
      {
        q: "Quelle différence entre Premium et Excellence ?",
        a: `L'Excellence reprend tout le Premium et ajoute le shampoing et le traitement des sièges et des tapis, la désinfection complète, le traitement anti-UV des plastiques et des odeurs tenaces.`,
      },
      {
        q: "Peut-on traiter les mauvaises odeurs ?",
        a: `Oui. L'Excellence traite les odeurs tenaces. En option, le traitement à l'ozone coûte ${optionPrice("ozone")} € et le nettoyage vapeur de l'habitacle ${optionPrice("vapeur")} €.`,
      },
      {
        q: "Comment réserver un nettoyage intérieur ?",
        a: `En ligne, en quelques étapes : type de véhicule, formule, options, adresse, puis date et créneau, ${HOURS_SENTENCE}. Le total, déplacement compris, s'affiche avant validation.`,
      },
    ],
    sitemapPriority: 0.9,
  },
  {
    slug: "lavage-exterieur-voiture-annecy",
    kind: "exterieur",
    label: "Lavage extérieur",
    metaTitle: `Lavage extérieur voiture à domicile à Annecy | ${BRAND.name}`,
    metaDescription: `Lavage de voiture à domicile à Annecy : carrosserie, jantes, séchage à la main, brillant pneus. Dès ${CLZ_PRICES.exterieurMin} €. Options céramique et rénovation des phares.`,
    eyebrow: "Nettoyage automobile · extérieur",
    h1: "Lavage extérieur de voiture à domicile à Annecy",
    intro: `Carrosserie, roues, jantes et finitions au pinceau, séchées à la main : votre voiture est lavée chez vous, à Annecy et alentours. Dès ${CLZ_PRICES.exterieurMin} €.`,
    answer: {
      q: "Combien coûte un lavage de voiture à domicile à Annecy ?",
      a: `Le lavage Éco coûte ${perVehicle(EXT_ECO)}. L'Excellence, avec jantes approfondies, détails au pinceau et double séchage, coûte ${perVehicle(EXT_EXC)}. Le déplacement est inclus dans un rayon de ${TRAVEL.includedKmOneWay} km.`,
    },
    serviceName: "Lavage extérieur de voiture à domicile",
    serviceType: "Lavage automobile",
    image: "/custom-sites/cleanyzer/porsche-lavage.webp",
    imageAlt: "Porsche rouge recouverte de mousse pendant le lavage extérieur",
    faq: [
      {
        q: "Que comprend le lavage extérieur Éco ?",
        a: `${EXT_ECO.content} Il coûte ${perVehicle(EXT_ECO)}.`,
      },
      {
        q: "Que comprend le lavage extérieur Excellence ?",
        a: `${EXT_EXC.content.replace(/^Éco \+ /, "Tout le lavage Éco, plus ")} Il coûte ${perVehicle(EXT_EXC)}.`,
      },
      {
        q: "Rénovez-vous les phares jaunis ?",
        a: `Oui, la rénovation des optiques de phares est une option à ${optionPrice("renovation-optiques")} €. Une protection céramique hybride est aussi proposée à ${optionPrice("ceramique")} €.`,
      },
      {
        q: "Et si la voiture est très sale ?",
        a: `Un supplément s'applique selon l'état : +${optionPrice("sale")} € pour un véhicule sale, +${optionPrice("tres-sale")} € pour un véhicule très sale (poils, sable, terre).`,
      },
    ],
    sitemapPriority: 0.9,
  },
  {
    slug: "nettoyage-canape-textile-annecy",
    kind: "textile",
    label: "Canapé & textile",
    metaTitle: `Nettoyage canapé et textile à domicile à Annecy | ${BRAND.name}`,
    metaDescription: `Nettoyage de canapé, matelas, tapis et moquette à domicile à Annecy : aspiration, shampoing, désinfection, traitement des odeurs. Canapé dès ${CLZ_PRICES.textileMin} €.`,
    eyebrow: "Textile & mobilier",
    h1: "Nettoyage de canapé et de textile à domicile à Annecy",
    intro: `Canapé, matelas, tapis ou moquette : aspiration complète, shampoing, désinfection et traitement des odeurs, chez vous. Canapé dès ${CLZ_PRICES.textileMin} €.`,
    answer: {
      q: "Combien coûte le nettoyage d'un canapé à Annecy ?",
      a: `Un canapé 2/3 places coûte ${canape("canape-2-3")}, un canapé 3/4 places (avec ou sans méridienne) ${canape("canape-3-4")}, et un canapé 5 places et plus ${canape("canape-5")}. Matelas, tapis et moquette sont chiffrés sur devis.`,
    },
    serviceName: "Nettoyage de canapé et de textile à domicile",
    serviceType: "Nettoyage de canapé et de textile d'ameublement",
    image: "/custom-sites/cleanyzer/textile-canape.webp",
    imageAlt: "Canapé en tissu gris clair après nettoyage textile",
    faq: [
      {
        q: "Que comprend le nettoyage d'un canapé ?",
        a: "Aspiration complète, shampoing, désinfection et traitement des odeurs, à votre domicile.",
      },
      {
        q: "Nettoyez-vous les canapés en cuir ?",
        a: `Oui. ${TEXTILE_SUPPLEMENTS.map((x) => `${x.label} : ${x.priceLabel.replace(/^\+/, "+ ")}`).join(" ; ")}.`,
      },
      {
        q: "Comment demander le nettoyage d'un canapé, d'un matelas ou d'un tapis ?",
        a: "Le textile passe par une demande personnalisée : décrivez l'article (type, dimensions, matière, taches). Les prix des canapés sont indiqués ci-dessus ; matelas, tapis et moquette sont établis sur devis.",
      },
    ],
    sitemapPriority: 0.8,
  },
]

export function getClzServicePage(slug: string | null | undefined): ClzServicePage | null {
  return CLZ_SERVICE_PAGES.find((p) => p.slug === slug) ?? null
}

export function clzServiceSlugs(): string[] {
  return CLZ_SERVICE_PAGES.map((p) => p.slug)
}

/* -------------------------------------------------------------------------- */
/*  Page « zone d'intervention » (une seule page, pas de pages par commune)   */
/* -------------------------------------------------------------------------- */

export const CLZ_ZONE_PAGE = {
  slug: "zone-intervention-annecy",
  label: "Zone d'intervention",
  metaTitle: `Zone d'intervention autour d'Annecy | ${BRAND.name}`,
  metaDescription: `${BRAND.name} se déplace à domicile à Annecy, Seynod, Cran-Gevrier, Annecy-le-Vieux, Épagny Metz-Tessy, Rumilly, Sévrier et alentours. ${TRAVEL.includedKmOneWay} km inclus.`,
  eyebrow: "Zone d'intervention",
  h1: "Nettoyage de voiture et de canapé à domicile autour d'Annecy",
  intro: `${BRAND.name} se déplace chez vous à Annecy et dans les communes alentour, ${HOURS_SENTENCE}, pour le nettoyage de votre voiture ou de votre canapé.`,
  answer: {
    q: "Dans quelles communes intervenez-vous ?",
    a: `À Annecy et alentours. ${ZONE_SENTENCE} Pour un nettoyage auto, le montant exact du déplacement s'affiche lors de la réservation, à partir de votre adresse.`,
  },
  faq: [
    {
      q: "Comment sont calculés les frais de déplacement ?",
      a: `${ZONE_SENTENCE} Par exemple, 5 km de plus à l'aller représentent 10 € aller-retour.`,
    },
    {
      q: "Quels sont vos horaires ?",
      a: `${BRAND.name} intervient ${HOURS_SENTENCE}, directement à votre domicile.`,
    },
    {
      q: "Mon adresse est hors de la zone, pouvez-vous venir ?",
      a: "Oui, au-delà de la zone incluse le déplacement est simplement facturé au kilomètre. Pour un nettoyage auto, saisissez votre adresse lors de la réservation pour voir le montant ; pour le textile, il est précisé en réponse à votre demande.",
    },
  ] as ClzFaq[],
  sitemapPriority: 0.7,
}

export function isClzZoneSlug(slug: string | null | undefined): boolean {
  return slug === CLZ_ZONE_PAGE.slug
}
