/**
 * PARCOURS CLEANYZER — source de données unique reliant :
 * zone 3D (Porsche) ↔ formules ↔ options ↔ séquence du film ↔ page de prestation ↔ action.
 *
 * Origine : maquette `visit3d.js` (Z2S, F2S, CLZ_VISIT_DATA.Z) et `film.js` (STEPS).
 * Tarifs : TOUJOURS `content.ts` (aucun prix ici). Scopé au tenant CLEANYZER.
 *
 * Film : chaque « séquence » est un clip découpé en bandes d'images, lu au
 * défilement (pas de vidéo à timecodes). La séquence exacte = l'index d'étape.
 */

import { EXTERIEUR_FORMULAS, EXTERIEUR_OPTIONS, INTERIEUR_FORMULAS, INTERIEUR_OPTIONS, type Formula } from "./content"
import { CLZ_BOOKING_HREF, CLZ_DEMANDE_HREF, CLZ_HOME_HREF, clzBookingHref, clzPath } from "./tokens"

export type ZoneKey = "body" | "optics" | "rims" | "engine" | "mats" | "seats" | "vents" | "leather"
export type FormulaRef = "eco_int" | "premium" | "excellence" | "eco_ext" | "exc_ext" | "diamond"
export type FilmStepId = "exterieur" | "tapis" | "habitacle" | "sieges" | "moteur" | "diamond"
export type Side = "int" | "ext" | "both"
export type ClzAction = { label: string; href: string }

const INT_PAGE = clzPath("/prestations/nettoyage-interieur-voiture-annecy")
const EXT_PAGE = clzPath("/prestations/lavage-exterieur-voiture-annecy")
export const CLZ_SERVICE_SLUG = { interieur: "nettoyage-interieur-voiture-annecy", exterieur: "lavage-exterieur-voiture-annecy" } as const

const BOOK: ClzAction = { label: "Réserver", href: CLZ_BOOKING_HREF }
const ASK: ClzAction = { label: "Faire une demande", href: CLZ_DEMANDE_HREF }

const pick = (list: Formula[], key: string) => {
  const f = list.find((x) => x.key === key)
  if (!f) throw new Error(`[cleanyzer] formule inconnue : ${key}`)
  return f
}

export type JourneyFormula = {
  side: Side
  name: string
  full: string
  formula: Formula
  /** Page de prestation réelle du dépôt. */
  href: string
  action: ClzAction
  note?: string
  film: FilmStepId
}

export const JOURNEY_FORMULAS: Record<FormulaRef, JourneyFormula> = {
  eco_int: { side: "int", name: "Éco", full: "Nettoyage intérieur Éco", formula: pick(INTERIEUR_FORMULAS, "eco"), href: INT_PAGE, action: BOOK, note: "Seulement après une première intervention CLEANYZER.", film: "habitacle" },
  premium: { side: "int", name: "Premium", full: "Nettoyage intérieur Premium", formula: pick(INTERIEUR_FORMULAS, "premium"), href: INT_PAGE, action: BOOK, film: "habitacle" },
  excellence: { side: "int", name: "Excellence", full: "Nettoyage intérieur Excellence", formula: pick(INTERIEUR_FORMULAS, "excellence"), href: INT_PAGE, action: BOOK, film: "sieges" },
  eco_ext: { side: "ext", name: "Éco", full: "Lavage extérieur Éco", formula: pick(EXTERIEUR_FORMULAS, "eco"), href: EXT_PAGE, action: BOOK, film: "exterieur" },
  exc_ext: { side: "ext", name: "Excellence", full: "Lavage extérieur Excellence", formula: pick(EXTERIEUR_FORMULAS, "excellence"), href: EXT_PAGE, action: BOOK, film: "exterieur" },
  // Pas de page Diamond dans le dépôt : la formule sur mesure passe par la demande.
  diamond: { side: "both", name: "Diamond", full: "Formule Diamond sur mesure", formula: pick(INTERIEUR_FORMULAS, "diamond"), href: CLZ_DEMANDE_HREF, action: ASK, note: "Sur devis : le prix est établi après votre demande.", film: "diamond" },
}

export type JourneyZone = {
  name: string
  title: string
  side: "int" | "ext"
  /** Ce que chaque formule fait sur cette zone (maquette CLZ_VISIT_DATA.Z). */
  formulas: Partial<Record<FormulaRef, string>>
  options: { label: string; price: string }[]
  /** Séquence du film ; `null` quand aucune séquence ne montre la zone. */
  film: FilmStepId | null
  description?: string
  /** Page de prestation dédiée : remplace l'action par défaut de la zone. */
  link?: ClzAction
}

const optPrice = (key: string) => {
  const o = [...INTERIEUR_OPTIONS, ...EXTERIEUR_OPTIONS].find((x) => x.key === key)
  return o ? (o.priceLabel ?? `${o.price} €`) : "Sur demande"
}

export const CLZ_OPTIQUES_PAGE = clzPath("/prestations/renovation-optiques-phares-annecy")

export const JOURNEY_ZONES: Record<ZoneKey, JourneyZone> = {
  body: { name: "Carrosserie", title: "Carrosserie", side: "ext", film: "exterieur", options: [], formulas: { eco_ext: "Lavage complet de la carrosserie, séchage à la main", exc_ext: "+ détails au pinceau et double séchage", diamond: "Sur devis" } },
  optics: {
    name: "Optiques",
    title: "Rénovation des optiques",
    side: "ext",
    film: null,
    description: "Des phares jaunis ou ternis ? Redonnez de la transparence à vos optiques et améliorez l'apparence de votre véhicule.",
    options: [{ label: "Rénovation optiques de phares", price: optPrice("renovation-optiques") }],
    formulas: {},
    link: { label: "Découvrir la rénovation des phares", href: CLZ_OPTIQUES_PAGE },
  },
  rims: { name: "Jantes", title: "Jantes", side: "ext", film: "exterieur", options: [], formulas: { exc_ext: "Jantes approfondies", diamond: "Sur devis" } },
  engine: { name: "Moteur", title: "Compartiment moteur", side: "ext", film: "moteur", options: [{ label: "Nettoyage moteur", price: "Sur demande" }], formulas: {} },
  mats: { name: "Tapis", title: "Tapis & moquettes", side: "int", film: "tapis", options: [{ label: "Shampoing moquettes", price: optPrice("shampoing-moquettes") }, { label: "Imperméabilisation tapis", price: optPrice("imper-tapis") }], formulas: { premium: "Tapis", excellence: "Shampoing et traitement des tapis", diamond: "Sur devis" } },
  seats: { name: "Sièges", title: "Sièges", side: "int", film: "sieges", options: [{ label: "Imperméabilisation sièges", price: optPrice("imper-sieges") }], formulas: { premium: "Aspiration complète", excellence: "Shampoing et traitement des sièges", diamond: "Sur devis" } },
  vents: { name: "Aérations", title: "Aérations & plastiques", side: "int", film: "habitacle", options: [], formulas: { eco_int: "Dépoussiérage et nettoyage des plastiques", premium: "Plastiques et tableau de bord", excellence: "+ traitement anti-UV des plastiques", diamond: "Sur devis" } },
  leather: { name: "Volant & commandes", title: "Volant, commandes & portières", side: "int", film: "sieges", options: [], formulas: { premium: "Volant, commandes, portières et seuils", excellence: "+ finition détaillée", diamond: "Sur devis" } },
}

/** Ordre des séquences du film (= ordre des étapes dans `prestations-film.tsx`). */
export const FILM_SEQUENCES: { id: FilmStepId; clip: string; strips: number; zone: ZoneKey | null; action: ClzAction }[] = [
  { id: "exterieur", clip: "mousse", strips: 8, zone: "body", action: BOOK },
  { id: "tapis", clip: "tapis", strips: 6, zone: "mats", action: BOOK },
  { id: "habitacle", clip: "audi", strips: 6, zone: "vents", action: BOOK },
  // Seule séquence à formule unique (Intérieur Excellence) : présélection BookingV2.
  { id: "sieges", clip: "volant", strips: 4, zone: "seats", action: { label: "Réserver", href: clzBookingHref("interieur", "excellence") } },
  { id: "moteur", clip: "moteur", strips: 5, zone: "engine", action: ASK },
  { id: "diamond", clip: "macan", strips: 6, zone: null, action: ASK },
]

export const filmIndex = (id: FilmStepId) => FILM_SEQUENCES.findIndex((s) => s.id === id)

/** Formules qui traitent une zone, sans Diamond, la plus complète en dernier. */
export const zoneFormulas = (z: ZoneKey) => Object.keys(JOURNEY_ZONES[z].formulas) as FormulaRef[]

export function zoneAction(z: ZoneKey): ClzAction {
  const link = JOURNEY_ZONES[z].link
  if (link) return link
  return zoneFormulas(z).some((k) => k !== "diamond") ? BOOK : ASK
}

export const ZONE_KEYS = Object.keys(JOURNEY_ZONES) as ZoneKey[]

/** Zones montrées sur une page de prestation automobile. */
export const zonesForSide = (side: "int" | "ext") => ZONE_KEYS.filter((k) => JOURNEY_ZONES[k].side === side)

/* ---------- Liens profonds (page de prestation → accueil) ---------- */
export const CLZ_FILM_ANCHOR = "prestations-video"
export const CLZ_VISIT_ANCHOR = "visite-3d"

export function filmDeepLink(step: FilmStepId, fromSlug?: string) {
  return `${CLZ_HOME_HREF}#video=${step}${fromSlug ? `&from=${fromSlug}` : ""}`
}
export function visitDeepLink(zone: ZoneKey, fromSlug?: string) {
  return `${CLZ_HOME_HREF}#zone=${zone}${fromSlug ? `&from=${fromSlug}` : ""}`
}
