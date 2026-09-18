/**
 * DONNÉES CLEANYZER — SOURCE OF TRUTH = "CLEANYZER - Cahier v0 V2" (PDF Tom).
 *
 * RÈGLE ABSOLUE (cahier §10) : aucune hallucination. Chaque tarif, contenu de
 * formule, option et règle de déplacement provient EXACTEMENT du cahier. Toute
 * donnée absente du cahier est marquée `null` / "à confirmer" — jamais inventée.
 *
 * Ce fichier ne sert que les MAQUETTES (Phase 1, isolées sous /cleanyzer-preview).
 * Il ne touche ni la base, ni un autre tenant. En Phase 2, ces valeurs seront
 * rapprochées des données réellement enregistrées pour le tenant CLEANYZER dans
 * DetailFlow (en cas de conflit : signaler, ne pas trancher — cahier §10).
 */

export type VehicleKey = "citadine" | "berline" | "suv"

export const VEHICLES: { key: VehicleKey; label: string; hint: string }[] = [
  { key: "citadine", label: "Citadine", hint: "Petite voiture, 5 portes compactes" },
  { key: "berline", label: "Berline", hint: "Voiture familiale, coffre classique" },
  { key: "suv", label: "SUV", hint: "Grand véhicule surélevé, 4x4, monospace" },
]

export type CleaningKind = "interieur" | "exterieur"

/** Prix `null` = "Sur mesure" → déclenche une demande, jamais un prix fabriqué. */
export type Formula = {
  key: string
  name: string
  kind: CleaningKind
  content: string
  prices: Record<VehicleKey, number | null>
  highlight?: "populaire" | "best-seller"
}

// Cahier §5 — Tarifs automobile INTÉRIEUR
export const INTERIEUR_FORMULAS: Formula[] = [
  {
    key: "eco",
    name: "Éco",
    kind: "interieur",
    content:
      "Aspiration habitacle, dépoussiérage et nettoyage plastiques. Seulement après une première intervention CLEANYZER.",
    prices: { citadine: 50, berline: 60, suv: 75 },
  },
  {
    key: "premium",
    name: "Premium",
    kind: "interieur",
    content:
      "Aspiration complète habitacle + coffre, tapis, plastiques, tableau de bord, portières, seuils, volant, commandes, vitres intérieures.",
    prices: { citadine: 80, berline: 95, suv: 120 },
    highlight: "populaire",
  },
  {
    key: "excellence",
    name: "Excellence",
    kind: "interieur",
    content:
      "Premium + shampoing et traitement sièges/tapis, désinfection complète, traitement anti-UV plastiques et odeurs tenaces.",
    prices: { citadine: 115, berline: 135, suv: 160 },
    highlight: "best-seller",
  },
  {
    key: "diamond",
    name: "Diamond",
    kind: "interieur",
    content: "Prestation entièrement personnalisée selon véhicule, état et besoins.",
    prices: { citadine: null, berline: null, suv: null },
  },
]

// Cahier §6 — Tarifs automobile EXTÉRIEUR
export const EXTERIEUR_FORMULAS: Formula[] = [
  {
    key: "eco",
    name: "Éco",
    kind: "exterieur",
    content: "Lavage complet carrosserie, roues, séchage à la main, brillant pneus.",
    prices: { citadine: 30, berline: 40, suv: 50 },
  },
  {
    key: "excellence",
    name: "Excellence",
    kind: "exterieur",
    content:
      "Éco + jantes approfondies, détails au pinceau (trappe carburant, calandre, emblèmes, recoins) + double séchage.",
    prices: { citadine: 50, berline: 65, suv: 80 },
    highlight: "best-seller",
  },
  {
    key: "diamond",
    name: "Diamond",
    kind: "exterieur",
    content: "Prestation personnalisée selon véhicule, état et besoins.",
    prices: { citadine: null, berline: null, suv: null },
  },
]

export function formulasFor(kind: CleaningKind): Formula[] {
  return kind === "interieur" ? INTERIEUR_FORMULAS : EXTERIEUR_FORMULAS
}

/** Option automobile. `priceKind` porte les tarifs "au lieu de" / "selon" du cahier. */
export type Option = {
  key: string
  label: string
  kind: CleaningKind
  price: number | null
  /** Étiquette de prix affichée telle quelle quand le tarif n'est pas un montant fixe simple. */
  priceLabel?: string
  note?: string
}

// Cahier §7 — Options INTÉRIEURES
export const INTERIEUR_OPTIONS: Option[] = [
  { key: "ozone", label: "Traitement à l'ozone", kind: "interieur", price: 49 },
  { key: "vapeur", label: "Nettoyage vapeur habitacle", kind: "interieur", price: 40 },
  { key: "duo-ozone-vapeur", label: "Duo ozone + vapeur", kind: "interieur", price: 75, priceLabel: "75 € au lieu de 89 €" },
  { key: "desinfection", label: "Désinfection complète habitacle", kind: "interieur", price: 40 },
  { key: "vitres", label: "Vitres intérieures", kind: "interieur", price: 15 },
  { key: "shampoing-moquettes", label: "Shampoing moquettes", kind: "interieur", price: 49 },
  { key: "imper-tapis", label: "Imperméabilisation tapis", kind: "interieur", price: 5, priceLabel: "5 € / tapis" },
  { key: "imper-coffre", label: "Imperméabilisation coffre", kind: "interieur", price: 10 },
  { key: "imper-sieges", label: "Imperméabilisation sièges", kind: "interieur", price: 15, priceLabel: "15 € / siège" },
  { key: "imper-complete", label: "Imperméabilisation complète", kind: "interieur", price: 85 },
  { key: "vomi", label: "Nettoyage spécial vomi", kind: "interieur", price: 69 },
  { key: "rails", label: "Rails + regraissage des deux sièges avant", kind: "interieur", price: 35 },
  { key: "demontage-sieges", label: "Démontage des sièges", kind: "interieur", price: 25 },
]

// Cahier §7 — Suppléments / options EXTÉRIEUR
export const EXTERIEUR_OPTIONS: Option[] = [
  { key: "sale", label: "Véhicule sale", kind: "exterieur", price: 39, priceLabel: "+39 €" },
  {
    key: "tres-sale",
    label: "Véhicule très sale",
    kind: "exterieur",
    price: 79,
    priceLabel: "+79 €",
    note: "Poils, sable, terre, saletés importantes…",
  },
  { key: "tres-encrasse", label: "Véhicule très encrassé", kind: "exterieur", price: 35, priceLabel: "+35 €" },
  { key: "capote-nettoyage", label: "Nettoyage capote", kind: "exterieur", price: 75 },
  { key: "capote-imper", label: "Imperméabilisation capote", kind: "exterieur", price: 100 },
  {
    key: "capote-duo",
    label: "Duo nettoyage + imperméabilisation capote",
    kind: "exterieur",
    price: 150,
    priceLabel: "150 € au lieu de 175 €",
  },
  { key: "ceramique", label: "Protection céramique hybride", kind: "exterieur", price: 65 },
  {
    key: "renovation-plastiques",
    label: "Rénovation plastiques extérieurs ternis",
    kind: "exterieur",
    price: null,
    priceLabel: "30 à 70 € selon pièces / surface",
    note: "Tarif défini après état des lieux.",
  },
  { key: "renovation-optiques", label: "Rénovation optiques de phares", kind: "exterieur", price: 65 },
  {
    key: "revernissage",
    label: "Revernissage à froid sans ponçage",
    kind: "exterieur",
    price: null,
    priceLabel: "50 à 200 € selon surface / nombre de pièces",
    note: "Tarif défini après état des lieux.",
  },
]

export function optionsFor(kind: CleaningKind): Option[] {
  return kind === "interieur" ? INTERIEUR_OPTIONS : EXTERIEUR_OPTIONS
}

// Cahier §8 — Textile / mobilier (demande personnalisée, PAS le booking auto)
export const TEXTILE_BASE =
  "Aspiration complète + shampoing + désinfection + traitement des odeurs."

export type TextileItem = { key: string; label: string; price: number | null; priceLabel: string; hint?: string }

export const TEXTILE_ITEMS: TextileItem[] = [
  { key: "canape-2-3", label: "Canapé 2/3 places", price: 80, priceLabel: "80 €" },
  {
    key: "canape-3-4",
    label: "Canapé 3/4 places",
    price: 110,
    priceLabel: "110 €",
    hint: "Avec ou sans méridienne",
  },
  { key: "canape-5", label: "Canapé 5 places et +", price: 150, priceLabel: "à partir de 150 €" },
  { key: "matelas", label: "Matelas", price: null, priceLabel: "Sur devis" },
  { key: "tapis", label: "Tapis", price: null, priceLabel: "Sur devis" },
  { key: "moquette", label: "Moquette", price: null, priceLabel: "Sur devis" },
  { key: "autre", label: "Autre besoin", price: null, priceLabel: "Sur devis" },
]

export const TEXTILE_SUPPLEMENTS: { label: string; priceLabel: string }[] = [
  { label: "Traitement cuir", priceLabel: "+15 € / place" },
  { label: "Imperméabilisation", priceLabel: "+10 € / place" },
]

// Cahier §9 — Déplacement et disponibilités
export const TRAVEL = {
  includedKmOneWay: 20, // 20 km à l'aller inclus
  includedKmRoundTrip: 40, // soit 40 km A/R inclus
  pricePerExtraKm: 1, // 1 € / km supplémentaire parcouru (A/R)
  daysLabel: "Lundi au dimanche",
  hoursLabel: "7 h 30 à 20 h 30",
  base: "Annecy et alentours",
} as const

/**
 * Frais de déplacement A/R (cahier §9).
 * Exemple Tom : +5 km à l'aller = +10 € A/R. Donc facturation = km supplémentaires
 * A/R × 1 €. distanceOneWayKm = distance à l'aller depuis la base.
 */
export function travelFee(distanceOneWayKm: number): number {
  const extraOneWay = Math.max(0, distanceOneWayKm - TRAVEL.includedKmOneWay)
  const extraRoundTrip = extraOneWay * 2
  return Math.round(extraRoundTrip * TRAVEL.pricePerExtraKm)
}

// Marque / contact. Ce qui n'est pas dans le cahier reste `null` → "à confirmer".
export const BRAND = {
  name: "CLEANYZER",
  area: "Annecy & alentours",
  tagline: "Le détail fait toute la différence.",
  subtitle: "Nettoyage automobile et textile à domicile.",
  ownerFirstName: "Tom", // cahier : afficher « Tom » uniquement, pas de nom de famille
  phone: null as string | null, // absent du cahier → à confirmer
  email: null as string | null, // absent du cahier → à confirmer
  // Preuve sociale Google : note + nombre d'avis NON fournis → ne jamais hardcoder (brief §4)
  googleRating: null as number | null,
  googleReviewCount: null as number | null,
}

export const NAV_LABELS = {
  prestations: "Prestations",
  realisations: "Réalisations",
  apropos: "À propos",
  zone: "Zone d'intervention",
  faq: "Questions fréquentes",
}
