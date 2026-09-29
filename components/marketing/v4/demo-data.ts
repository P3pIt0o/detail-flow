/**
 * Données de DÉMONSTRATION de la landing (fictives, clairement illustratives).
 * Elles alimentent les mockups et la mini-démo de réservation. Elles ne
 * représentent AUCUN résultat commercial de DetailFlow ni de ses clients.
 *
 * La structure reflète le vrai modèle : prix et durée par couple
 * (prestation × type de véhicule), options avec supplément de prix ET de durée.
 */

export type DemoVehicleType = { id: string; name: string; examples: string }
export type DemoService = {
  id: string
  name: string
  category: string
  /** Prix TTC en euros, index = type de véhicule. */
  prices: number[]
  /** Durée en minutes, index = type de véhicule. */
  durations: number[]
}
export type DemoOption = { id: string; name: string; price: number; minutes: number }

export const DEMO_VEHICLE_TYPES: DemoVehicleType[] = [
  { id: "citadine", name: "Citadine", examples: "Clio, 208, Polo" },
  { id: "berline", name: "Berline", examples: "Audi A3, Série 3, 308" },
  { id: "suv", name: "SUV", examples: "Tiguan, 3008, Q5" },
  { id: "utilitaire", name: "Utilitaire", examples: "Trafic, Kangoo, Vito" },
]

export const DEMO_SERVICES: DemoService[] = [
  {
    id: "interieur",
    name: "Nettoyage intérieur complet",
    category: "Intérieur",
    prices: [79, 89, 109, 129],
    durations: [120, 150, 180, 210],
  },
  {
    id: "exterieur",
    name: "Lavage extérieur premium",
    category: "Extérieur",
    prices: [49, 59, 69, 89],
    durations: [60, 75, 90, 120],
  },
  {
    id: "polissage",
    name: "Polissage 1 étape",
    category: "Correction",
    prices: [249, 289, 339, 399],
    durations: [300, 360, 420, 480],
  },
  {
    id: "ceramique",
    name: "Traitement céramique",
    category: "Protection",
    prices: [590, 690, 790, 890],
    durations: [420, 480, 540, 600],
  },
]

export const DEMO_OPTIONS: DemoOption[] = [
  { id: "poils", name: "Poils d'animaux", price: 25, minutes: 30 },
  { id: "sieges", name: "Shampoing des sièges", price: 35, minutes: 45 },
  { id: "plastiques", name: "Rénovation des plastiques", price: 19, minutes: 15 },
  { id: "ozone", name: "Désodorisation à l'ozone", price: 29, minutes: 30 },
]

export const DEMO_DEPOSIT_RATE = 0.3

export function formatEuro(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`
}

export type DemoUpcoming = {
  time: string
  client: string
  vehicle: string
  service: string
  status: "confirmed" | "pending_deposit" | "completed"
  place: "Atelier" | "Déplacement"
}

export const DEMO_UPCOMING: DemoUpcoming[] = [
  { time: "09:00", client: "Karim Haddad", vehicle: "Peugeot 3008", service: "Lavage extérieur premium", status: "completed", place: "Atelier" },
  { time: "11:00", client: "Julie Petit", vehicle: "Renault Clio", service: "Nettoyage intérieur complet", status: "confirmed", place: "Déplacement" },
  { time: "14:30", client: "Thomas Martin", vehicle: "Audi A3", service: "Nettoyage intérieur complet", status: "confirmed", place: "Atelier" },
  { time: "17:30", client: "Léa Moreau", vehicle: "Volkswagen Tiguan", service: "Polissage 1 étape", status: "pending_deposit", place: "Atelier" },
]
