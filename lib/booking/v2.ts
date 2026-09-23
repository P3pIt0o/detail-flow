/**
 * ============================================================================
 *  BOOKING V2 — logique PURE (aucune I/O), partagée site standard + widget
 * ============================================================================
 *  Le moteur métier reste celui de DetailFlow (buildQuote, getAvailability,
 *  computeTravel, createBookingAction, Stripe). Ce module ne contient que des
 *  calculs d'APERÇU et de présentation : le montant facturé, les créneaux et la
 *  confirmation sont TOUJOURS décidés côté serveur.
 * ============================================================================
 */

import {
  resolvePrice,
  newServiceLine,
  type OptionRow,
  type PriceMap,
  type ServiceRow,
  type VehicleRow,
  type VehicleSelection,
} from "@/components/booking/shared"
import type { PaymentMode } from "@/lib/payments/mode"

/* -------------------------------------------------------------------------- */
/*  Véhicules                                                                  */
/* -------------------------------------------------------------------------- */

/** Véhicule composé dans Booking V2 : la prestation choisie à l'étape 1 s'applique à chaque véhicule. */
export type V2Vehicle = {
  uid: string
  vehicleTypeId: number | null
  brand: string
  model: string
  optionIds: number[]
}

function uid(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `v${Math.random()}`
}

/** Nouveau véhicule ; présélectionne le type quand un seul est configuré (aucun choix à faire). */
export function newV2Vehicle(vehicleTypes: Pick<VehicleRow, "id">[]): V2Vehicle {
  return {
    uid: uid(),
    vehicleTypeId: vehicleTypes.length === 1 ? vehicleTypes[0].id : null,
    brand: "",
    model: "",
    optionIds: [],
  }
}

export function isV2VehicleComplete(v: V2Vehicle): boolean {
  return v.vehicleTypeId != null && v.brand.trim().length > 0 && v.model.trim().length > 0
}

/** Conversion vers le format partagé du moteur (brouillon + payload serveur). */
export function toVehicleSelections(vehicles: V2Vehicle[], serviceId: number | null): VehicleSelection[] {
  return vehicles.map((v) => ({
    uid: v.uid,
    vehicleTypeId: v.vehicleTypeId,
    brand: v.brand,
    model: v.model,
    services: [{ ...newServiceLine(serviceId), lid: `${v.uid}-l`, optionIds: v.optionIds }],
  }))
}

/** Reprise depuis le format partagé (brouillon). Seule la 1re prestation d'un véhicule est conservée. */
export function fromVehicleSelections(selections: VehicleSelection[]): {
  serviceId: number | null
  vehicles: V2Vehicle[]
} {
  const vehicles = selections.map((s) => ({
    uid: s.uid || uid(),
    vehicleTypeId: s.vehicleTypeId ?? null,
    brand: s.brand ?? "",
    model: s.model ?? "",
    optionIds: Array.isArray(s.services?.[0]?.optionIds) ? s.services[0].optionIds : [],
  }))
  const serviceId = selections.flatMap((s) => s.services ?? []).find((l) => l.serviceId != null)?.serviceId ?? null
  return { serviceId, vehicles }
}

/* -------------------------------------------------------------------------- */
/*  Prix & durée (aperçu, recalcul serveur à la validation)                    */
/* -------------------------------------------------------------------------- */

/** Fourchette de prix/durée d'une prestation sur l'ensemble des types de véhicule configurés. */
export function servicePriceRange(
  service: ServiceRow,
  vehicleTypes: Pick<VehicleRow, "id">[],
  services: ServiceRow[],
  priceMap: PriceMap,
): { minCents: number; maxCents: number; minDuration: number; maxDuration: number } {
  const points =
    vehicleTypes.length > 0
      ? vehicleTypes.map((t) => resolvePrice(services, priceMap, service.id, t.id))
      : [{ priceCents: service.basePriceCents, durationMin: service.durationMin }]
  return {
    minCents: Math.min(...points.map((p) => p.priceCents)),
    maxCents: Math.max(...points.map((p) => p.priceCents)),
    minDuration: Math.min(...points.map((p) => p.durationMin)),
    maxDuration: Math.max(...points.map((p) => p.durationMin)),
  }
}

/**
 * Estimation d'un véhicule. Tant que le type n'est pas choisi, on affiche le
 * prix de base de la prestation (le prix reste toujours visible).
 */
export function vehicleEstimate(
  v: V2Vehicle,
  serviceId: number | null,
  services: ServiceRow[],
  options: OptionRow[],
  priceMap: PriceMap,
): { priceCents: number; durationMin: number } {
  if (serviceId == null) return { priceCents: 0, durationMin: 0 }
  const svc = services.find((s) => s.id === serviceId)
  const base =
    v.vehicleTypeId != null
      ? resolvePrice(services, priceMap, serviceId, v.vehicleTypeId)
      : { priceCents: svc?.basePriceCents ?? 0, durationMin: svc?.durationMin ?? 0 }
  const chosen = v.optionIds.map((id) => options.find((o) => o.id === id)).filter(Boolean) as OptionRow[]
  return {
    priceCents: base.priceCents + chosen.reduce((s, o) => s + o.priceCents, 0),
    durationMin: base.durationMin + chosen.reduce((s, o) => s + o.durationMin, 0),
  }
}

export function bookingEstimate(
  vehicles: V2Vehicle[],
  serviceId: number | null,
  services: ServiceRow[],
  options: OptionRow[],
  priceMap: PriceMap,
): { priceCents: number; durationMin: number } {
  return vehicles.reduce(
    (acc, v) => {
      const e = vehicleEstimate(v, serviceId, services, options, priceMap)
      return { priceCents: acc.priceCents + e.priceCents, durationMin: acc.durationMin + e.durationMin }
    },
    { priceCents: 0, durationMin: 0 },
  )
}

const eurCompact = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0 })
const eurFull = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" })

/** 11000 → "110 €", 11050 → "110,50 €" (montants ronds sans décimales, comme la maquette). */
export function formatPriceCompact(cents: number): string {
  return cents % 100 === 0 ? eurCompact.format(cents / 100) : eurFull.format(cents / 100)
}

/** Aperçu de l'acompte (même règle que `computeDeposit` côté serveur). */
export function previewDeposit(totalCents: number, depositType: string, depositValue: number): number {
  if (depositType === "fixed") return Math.min(depositValue, totalCents)
  if (depositType === "percent" || depositType === "percentage") return Math.round((totalCents * depositValue) / 100)
  return 0
}

export function hasDepositRule(depositType: string, depositValue: number): boolean {
  return (depositType === "fixed" || depositType === "percent" || depositType === "percentage") && depositValue > 0
}

/* -------------------------------------------------------------------------- */
/*  Modes de paiement (EXCLUSIVEMENT issus de la configuration du tenant)      */
/* -------------------------------------------------------------------------- */

export type PaymentPlan =
  /** Aucun paiement en ligne, aucun acompte : règlement le jour du rendez-vous. */
  | "on_site"
  /** Acompte exigé mais réglé hors ligne (instructions du pro après réservation). */
  | "offline_deposit"
  /** Paiement intégral en ligne (Stripe). */
  | "online_full"
  /** Acompte en ligne (Stripe), solde sur place. */
  | "online_deposit"
  /** Le client choisit acompte OU intégral en ligne. */
  | "choice"

export function resolvePaymentPlan(input: {
  paymentsReady: boolean
  mode: PaymentMode
  depositType: string
  depositValue: number
}): PaymentPlan {
  if (input.paymentsReady) {
    if (input.mode === "full") return "online_full"
    if (input.mode === "deposit") return "online_deposit"
    if (input.mode === "choice") return "choice"
  }
  return hasDepositRule(input.depositType, input.depositValue) ? "offline_deposit" : "on_site"
}

/* -------------------------------------------------------------------------- */
/*  Dates & créneaux                                                           */
/* -------------------------------------------------------------------------- */

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/** `count` dates consécutives à partir de `from` + `offsetDays`. */
export function dateWindow(from: Date, offsetDays: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offsetDays + i)
    return toDateKey(d)
  })
}

/** "09:00" → "9h00" (affichage français de la maquette). */
export function formatSlotLabel(time: string): string {
  const [h, m] = time.split(":")
  return `${Number.parseInt(h, 10)}h${m ?? "00"}`
}

/** Répartition matin / après-midi (bascule à 12:00). */
export function groupSlots(slots: string[]): { morning: string[]; afternoon: string[] } {
  return {
    morning: slots.filter((s) => s < "12:00"),
    afternoon: slots.filter((s) => s >= "12:00"),
  }
}

/* -------------------------------------------------------------------------- */
/*  Coordonnées                                                                */
/* -------------------------------------------------------------------------- */

export function joinName(firstName: string, lastName: string): string {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ")
}

export function splitName(full: string): { firstName: string; lastName: string } {
  const t = full.trim()
  const i = t.indexOf(" ")
  return i === -1 ? { firstName: t, lastName: "" } : { firstName: t.slice(0, i), lastName: t.slice(i + 1).trim() }
}

/* -------------------------------------------------------------------------- */
/*  Calendrier (.ics)                                                          */
/* -------------------------------------------------------------------------- */

function icsEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;")
}

function icsDateTime(date: string, time: string): string {
  return `${date.replace(/-/g, "")}T${time.replace(":", "")}00`
}

/** Fichier iCalendar du rendez-vous (heure locale « flottante », comme saisie par le pro). */
export function buildBookingIcs(input: {
  uid: string
  title: string
  description?: string
  location?: string
  date: string
  startTime: string
  endTime: string
  now?: Date
}): string {
  const stamp = (input.now ?? new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DetailFlow//Booking//FR",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${icsEscape(input.uid)}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${icsDateTime(input.date, input.startTime)}`,
    `DTEND:${icsDateTime(input.date, input.endTime)}`,
    `SUMMARY:${icsEscape(input.title)}`,
    input.description ? `DESCRIPTION:${icsEscape(input.description)}` : null,
    input.location ? `LOCATION:${icsEscape(input.location)}` : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n")
}
