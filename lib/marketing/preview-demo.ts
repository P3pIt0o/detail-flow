/**
 * Données de DÉMONSTRATION pour les captures marketing du site vitrine.
 *
 * Objectif : alimenter les VRAIS composants produit (tunnel de réservation,
 * devis, calendrier, facture, tableau de bord) avec des données propres et
 * inventées afin de produire des captures d'écran fidèles à 100 % — SANS
 * exposer les données d'un vrai client (isolation multi-tenant préservée),
 * SANS authentification et SANS toucher à la base de données.
 *
 * Aucune de ces valeurs n'est persistée : elles ne servent qu'au rendu des
 * pages `/capture/*` utilisées pour générer les images de la landing.
 */

import type {
  ServiceRow,
  CategoryRow,
  VehicleRow,
  OptionRow,
  PriceMap,
  VehicleSelection,
} from "@/components/booking/shared"
import type { TravelResult } from "@/lib/booking/types"
import type { CalendarBooking } from "@/lib/admin/types"
import type {
  InvoiceRow,
  InvoiceItemRow,
  InvoicePaymentRow,
  InvoiceEventRow,
} from "@/lib/invoice/queries"

/* -------------------------- Catalogue de démonstration -------------------- */

export const DEMO_CATEGORIES: CategoryRow[] = [
  { id: 1, name: "Extérieur", slug: "exterieur", description: null },
  { id: 2, name: "Intérieur", slug: "interieur", description: null },
  { id: 3, name: "Premium", slug: "premium", description: null },
]

export const DEMO_SERVICES: ServiceRow[] = [
  {
    id: 1,
    categoryId: 3,
    name: "Detailing complet",
    slug: "detailing-complet",
    description: "Rénovation intérieure et extérieure en profondeur.",
    image: null,
    basePriceCents: 29000,
    durationMin: 300,
  },
  {
    id: 2,
    categoryId: 1,
    name: "Lavage extérieur premium",
    slug: "lavage-exterieur-premium",
    description: "Décontamination, lustrage et protection.",
    image: null,
    basePriceCents: 9000,
    durationMin: 120,
  },
  {
    id: 3,
    categoryId: 2,
    name: "Nettoyage intérieur",
    slug: "nettoyage-interieur",
    description: "Aspiration, plastiques, vitres et sellerie.",
    image: null,
    basePriceCents: 8000,
    durationMin: 120,
  },
  {
    id: 4,
    categoryId: 3,
    name: "Traitement céramique",
    slug: "traitement-ceramique",
    description: "Protection longue durée de la carrosserie.",
    image: null,
    basePriceCents: 45000,
    durationMin: 480,
  },
]

export const DEMO_VEHICLE_TYPES: VehicleRow[] = [
  { id: 1, name: "Citadine", slug: "citadine", description: null },
  { id: 2, name: "Berline", slug: "berline", description: null },
  { id: 3, name: "SUV / 4x4", slug: "suv", description: null },
  { id: 4, name: "Utilitaire", slug: "utilitaire", description: null },
]

export const DEMO_OPTIONS: OptionRow[] = [
  {
    id: 1,
    name: "Rénovation optiques de phares",
    slug: "optiques",
    description: null,
    priceCents: 4000,
    durationMin: 45,
  },
  {
    id: 2,
    name: "Traitement anti-pluie pare-brise",
    slug: "anti-pluie",
    description: null,
    priceCents: 2500,
    durationMin: 20,
  },
  {
    id: 3,
    name: "Shampoing sièges",
    slug: "shampoing-sieges",
    description: null,
    priceCents: 6000,
    durationMin: 60,
  },
]

/** Grille tarifaire service × type de véhicule (centimes). */
export const DEMO_PRICE_MAP: PriceMap = {
  "1-3": { priceCents: 39000, durationMin: 360 }, // Detailing complet · SUV
  "1-2": { priceCents: 34000, durationMin: 320 },
  "2-2": { priceCents: 11000, durationMin: 120 },
  "3-2": { priceCents: 9000, durationMin: 120 },
}

/** Véhicule composé par le client (Thomas Martin · SUV · Detailing complet). */
export const DEMO_VEHICLE_SELECTION: VehicleSelection[] = [
  {
    uid: "demo-veh-1",
    serviceId: 1,
    vehicleTypeId: 3,
    optionIds: [1, 2],
    brand: "BMW",
    model: "X3",
  },
]

/** Frais de déplacement calculés (aperçu du devis client). */
export const DEMO_TRAVEL: TravelResult = {
  ok: true,
  address: "18 rue des Lilas, 69100 Villeurbanne",
  lat: 45.77,
  lng: 4.88,
  distanceKm: 12,
  billedDistanceKm: 12,
  feeCents: 1500,
}

/* -------------------------------- Calendrier ------------------------------ */

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
function mondayOf(base: Date): Date {
  const d = new Date(base)
  d.setHours(0, 0, 0, 0)
  const day = (d.getDay() + 6) % 7 // 0 = lundi
  d.setDate(d.getDate() - day)
  return d
}
function addDays(base: Date, n: number): Date {
  const d = new Date(base)
  d.setDate(d.getDate() + n)
  return d
}

/**
 * Génère une semaine de réservations réalistes, ancrée sur la semaine en cours,
 * pour afficher un vrai planning rempli dans la capture « Planning ».
 */
export function buildDemoCalendarBookings(now = new Date()): CalendarBooking[] {
  const monday = mondayOf(now)
  const at = (dayOffset: number) => iso(addDays(monday, dayOffset))

  const rows: Omit<CalendarBooking, "id" | "reference">[] = [
    { customerName: "Thomas Martin", date: at(1), startTime: "10:00", endTime: "16:00", status: "confirmed", totalCents: 40500, totalDurationMin: 360, vehicles: 1 },
    { customerName: "Sophie Bernard", date: at(1), startTime: "16:30", endTime: "18:30", status: "confirmed", totalCents: 11000, totalDurationMin: 120, vehicles: 1 },
    { customerName: "Karim Haddad", date: at(0), startTime: "09:00", endTime: "11:00", status: "completed", totalCents: 9000, totalDurationMin: 120, vehicles: 1 },
    { customerName: "Julie Petit", date: at(0), startTime: "14:00", endTime: "16:00", status: "completed", totalCents: 8000, totalDurationMin: 120, vehicles: 1 },
    { customerName: "Antoine Rousseau", date: at(2), startTime: "09:30", endTime: "17:30", status: "confirmed", totalCents: 45000, totalDurationMin: 480, vehicles: 1 },
    { customerName: "Léa Moreau", date: at(3), startTime: "10:00", endTime: "12:00", status: "pending_deposit", totalCents: 9000, totalDurationMin: 120, vehicles: 1 },
    { customerName: "Mehdi Ould", date: at(3), startTime: "13:30", endTime: "16:30", status: "confirmed", totalCents: 29000, totalDurationMin: 180, vehicles: 1 },
    { customerName: "Camille Faure", date: at(4), startTime: "09:00", endTime: "13:00", status: "confirmed", totalCents: 34000, totalDurationMin: 240, vehicles: 2 },
    { customerName: "Nicolas Girard", date: at(5), startTime: "10:00", endTime: "12:00", status: "confirmed", totalCents: 11000, totalDurationMin: 120, vehicles: 1 },
  ]

  return rows.map((r, i) => ({
    ...r,
    id: i + 1,
    reference: `RDV-2026-${String(i + 1).padStart(3, "0")}`,
  }))
}

/* --------------------------------- Facture -------------------------------- */

/** Facture payée de démonstration (suite logique du devis Thomas Martin). */
export const DEMO_INVOICE: InvoiceRow = {
  id: 1,
  companyId: 0,
  number: "FAC-2026-014",
  bookingId: 1,
  status: "paid",
  customerName: "Thomas Martin",
  customerEmail: "thomas.martin@email.fr",
  customerPhone: "06 12 34 56 78",
  customerAddress: "18 rue des Lilas\n69100 Villeurbanne",
  vehicleTypeName: "SUV / 4x4",
  vehicleBrand: "BMW",
  vehicleModel: "X3",
  vehiclePlate: "GE-482-QR",
  serviceDate: "2026-08-11",
  issueDate: "2026-08-11",
  dueDate: "2026-08-25",
  itemsTotalCents: 42000,
  discountCents: 0,
  netCents: 42000,
  vatEnabled: false,
  vatRate: "0",
  vatCents: 0,
  totalCents: 42000,
  depositCents: 12600,
  paidCents: 42000,
  balanceCents: 0,
  customerComment: null,
  internalNote: null,
  issuerName: "AutoCare Detailing",
  issuerEmail: "contact@autocare-detailing.fr",
  issuerPhone: "04 78 00 00 00",
  issuerAddress: "5 avenue de la République, 69003 Lyon",
  issuerSiret: "912 345 678 00019",
  issuerIban: null,
  issuerBic: null,
  issuerLogoPathname: null,
  vatExemptNote: "TVA non applicable, art. 293 B du CGI",
  footerNote: null,
  legalMentions: null,
  pdfPathname: null,
  createdAt: new Date("2026-08-11T09:00:00"),
  updatedAt: new Date("2026-08-11T18:00:00"),
}

export const DEMO_INVOICE_ITEMS: InvoiceItemRow[] = [
  { id: 1, invoiceId: 1, kind: "service", label: "Detailing complet", description: "SUV / 4x4 · BMW X3", quantity: 1, unitPriceCents: 39000, sortOrder: 0 },
  { id: 2, invoiceId: 1, kind: "option", label: "Rénovation optiques de phares", description: null, quantity: 1, unitPriceCents: 4000, sortOrder: 1 },
  { id: 3, invoiceId: 1, kind: "option", label: "Traitement anti-pluie pare-brise", description: null, quantity: 1, unitPriceCents: 2500, sortOrder: 2 },
  { id: 4, invoiceId: 1, kind: "travel", label: "Déplacement (12 km)", description: null, quantity: 1, unitPriceCents: 1500, sortOrder: 3 },
]

export const DEMO_INVOICE_PAYMENTS: InvoicePaymentRow[] = [
  { id: 1, invoiceId: 1, amountCents: 12600, method: "transfer", paidAt: "2026-08-04", note: "Acompte à la réservation", createdAt: new Date("2026-08-04T10:00:00") },
  { id: 2, invoiceId: 1, amountCents: 29400, method: "card", paidAt: "2026-08-11", note: "Solde le jour du rendez-vous", createdAt: new Date("2026-08-11T18:00:00") },
]

export const DEMO_INVOICE_EVENTS: InvoiceEventRow[] = [
  { id: 1, invoiceId: 1, type: "created", message: "Facture créée depuis le devis accepté", createdAt: new Date("2026-08-11T09:00:00") },
  { id: 2, invoiceId: 1, type: "issued", message: "Facture émise et envoyée au client", createdAt: new Date("2026-08-11T09:05:00") },
  { id: 3, invoiceId: 1, type: "paid", message: "Paiement du solde enregistré — facture payée", createdAt: new Date("2026-08-11T18:00:00") },
]

/* ------------------------------ Tableau de bord --------------------------- */

export const DEMO_DASHBOARD_STATS = {
  upcomingCount: 7,
  pendingCount: 2,
  monthRevenueCents: 486000,
  totalClients: 128,
  monthProductsCents: 74000,
  monthResultCents: 412000,
}

export const DEMO_DASHBOARD_REVENUE: { month: string; totalCents: number }[] = [
  { month: "2026-03", totalCents: 312000 },
  { month: "2026-04", totalCents: 358000 },
  { month: "2026-05", totalCents: 401000 },
  { month: "2026-06", totalCents: 372000 },
  { month: "2026-07", totalCents: 445000 },
  { month: "2026-08", totalCents: 486000 },
]

export function buildDemoUpcoming(now = new Date()) {
  const monday = mondayOf(now)
  const at = (dayOffset: number) => iso(addDays(monday, dayOffset))
  return [
    { id: 1, customerName: "Thomas Martin", date: at(1), startTime: "10:00", totalCents: 40500, status: "confirmed" },
    { id: 2, customerName: "Antoine Rousseau", date: at(2), startTime: "09:30", totalCents: 45000, status: "confirmed" },
    { id: 3, customerName: "Léa Moreau", date: at(3), startTime: "10:00", totalCents: 9000, status: "pending_deposit" },
    { id: 4, customerName: "Camille Faure", date: at(4), startTime: "09:00", totalCents: 34000, status: "confirmed" },
    { id: 5, customerName: "Nicolas Girard", date: at(5), startTime: "10:00", totalCents: 11000, status: "confirmed" },
  ]
}
