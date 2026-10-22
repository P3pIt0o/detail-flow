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

/**
 * Véhicule composé dans Booking V2 : la prestation choisie à l'étape 1 s'applique
 * à chaque véhicule ; le client peut y AJOUTER d'autres prestations (panier libre,
 * L22). Les options sont rattachées à la prestation principale.
 */
export type V2Vehicle = {
  uid: string
  vehicleTypeId: number | null
  brand: string
  model: string
  optionIds: number[]
  /** Prestations ajoutées à ce véhicule (sans doublon, jamais la prestation principale). Absent = aucune (brouillons antérieurs). */
  extraServiceIds?: number[]
  /** Immatriculation : demandée UNIQUEMENT quand le véhicule a plusieurs prestations. */
  plate?: string
}

/** « ab-123 cd » → « AB123CD ». */
export function normalizePlate(plate: string | null | undefined): string {
  return String(plate ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "")
}

/** Immatriculation exploitable : 4 à 12 lettres ou chiffres (formats français et étrangers). */
export function isPlateValid(plate: string | null | undefined): boolean {
  return /^[A-Z0-9]{4,12}$/.test(normalizePlate(plate))
}

/** Places occupées par la réservation : une prestation = une place (capacité journalière inchangée, comme au serveur). */
export function placesUsed(vehicles: V2Vehicle[], mainServiceId: number | null): number {
  return vehicles.reduce((n, v) => n + 1 + (v.extraServiceIds ?? []).filter((id) => id !== mainServiceId).length, 0)
}

/** Reste-t-il une place pour une prestation ou un véhicule de plus ? */
export function hasPlaceLeft(vehicles: V2Vehicle[], mainServiceId: number | null, maxPlaces: number): boolean {
  return placesUsed(vehicles, mainServiceId) < Math.max(1, maxPlaces)
}

/**
 * Prix serveur du récapitulatif (L22). Chaque réponse est liée au panier exact qui
 * l'a produite (sélections, adresse, code) : dès que le panier change, l'ancienne
 * réponse n'est plus « actuelle » et la confirmation attend le nouveau calcul.
 */
export type PricingState<T> = { key: string; status: "ok"; pricing: T } | { key: string; status: "error" } | null
export type PricingStatus<T> = { status: "ok"; pricing: T } | { status: "pending" } | { status: "error" }

export function pricingKey(selections: unknown, address: string | undefined, promoCode: string | undefined): string {
  return JSON.stringify([selections, address ?? null, promoCode ?? null])
}

export function currentPricing<T>(state: PricingState<T>, key: string): PricingStatus<T> {
  if (!state || state.key !== key) return { status: "pending" }
  return state.status === "ok" ? { status: "ok", pricing: state.pricing } : { status: "error" }
}

type CodedPricing = { code?: { status: string } | null }

/**
 * L24 : code saisi non vérifié (limite atteinte). Le prix affiché est sans code alors que
 * la réservation l'appliquerait : on ne confirme pas, on recalcule.
 */
export function isPromoUnverified(pricing: PricingStatus<CodedPricing>): boolean {
  return pricing.status === "ok" && pricing.pricing?.code?.status === "unverified"
}

/** Confirmation possible uniquement avec un prix serveur calculé pour le panier affiché. */
export function canConfirmBooking(contactValid: boolean, pricing: PricingStatus<CodedPricing>): boolean {
  return contactValid && pricing.status === "ok" && !isPromoUnverified(pricing)
}

/**
 * Bouton du bas d'écran (L23). `stepValid` de l'étape 3 vaut `canConfirmBooking` :
 * en échec du prix serveur, le bouton relance le calcul au lieu de confirmer.
 */
export function bookingCta(input: {
  step: number
  stepValid: boolean
  contactValid: boolean
  pricing: PricingStatus<CodedPricing>
  online: boolean
}): { action: "next" | "submit" | "retry"; label: string; disabled: boolean } {
  if (input.step < 3) return { action: "next", label: "Continuer", disabled: !input.stepValid }
  if (input.contactValid && (input.pricing.status === "error" || isPromoUnverified(input.pricing))) return { action: "retry", label: "Recalculer le prix", disabled: false }
  return { action: "submit", label: input.online ? "Payer et réserver" : "Confirmer", disabled: !input.stepValid }
}

/** Message client pour un code promo refusé (aperçu du code). */
export function promoRejectionMessage(reason: string): string {
  if (reason === "not_applicable_services") return "Ce code ne s'applique pas à la prestation sélectionnée."
  if (reason === "not_combinable") return "Une offre plus avantageuse est déjà appliquée à votre réservation : ce code ne se cumule pas avec elle."
  if (reason === "no_eligible_amount") return "Ce code ne s'applique pas à votre sélection."
  if (reason === "rate_limited") return "Impossible de vérifier ce code pour le moment. Merci de réessayer dans un instant."
  return "Code promo invalide ou indisponible."
}

/** Note du récapitulatif quand le serveur n'applique pas le code saisi. */
export function codeNotAppliedMessage(code: string, status: string): string {
  if (status === "rejected_not_combinable") return `Le code ${code} n'est pas appliqué : une offre plus avantageuse est déjà appliquée et ne se cumule pas avec lui.`
  if (status === "invalid") return `Le code ${code} est invalide ou indisponible.`
  if (status === "unverified") return `Le code ${code} n'a pas pu être vérifié, réessayez dans un instant.`
  return `Le code ${code} ne s'applique pas à votre sélection.`
}

/** Durée affichée : celle du serveur dès qu'elle est connue (après retrait des doublons). */
export function displayedDurationMin(serverDurationMin: number | null | undefined, estimateMin: number): number {
  return serverDurationMin ?? estimateMin
}

/** Le véhicule porte-t-il plusieurs prestations (seul cas où l'immatriculation est demandée) ? */
export function needsPlate(v: V2Vehicle, mainServiceId: number | null): boolean {
  return (v.extraServiceIds ?? []).some((id) => id !== mainServiceId)
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
    extraServiceIds: [],
  }
}

/** Ajoute une prestation à un véhicule ; refuse la prestation principale et les doublons. */
export function addExtraService(v: V2Vehicle, serviceId: number, mainServiceId: number | null): V2Vehicle {
  const extras = v.extraServiceIds ?? []
  if (!Number.isInteger(serviceId) || serviceId === mainServiceId || extras.includes(serviceId)) return v
  return { ...v, extraServiceIds: [...extras, serviceId] }
}

export function removeExtraService(v: V2Vehicle, serviceId: number): V2Vehicle {
  return { ...v, extraServiceIds: (v.extraServiceIds ?? []).filter((id) => id !== serviceId) }
}

/** Changement de prestation principale : elle est retirée des prestations ajoutées (jamais de doublon). */
export function withMainService(vehicles: V2Vehicle[], mainServiceId: number): V2Vehicle[] {
  return vehicles.map((v) => removeExtraService(v, mainServiceId))
}

/** Prestations pouvant encore être ajoutées à ce véhicule. */
export function extraServiceCandidates<T extends { id: number }>(services: T[], v: V2Vehicle, mainServiceId: number | null): T[] {
  return services.filter((s) => s.id !== mainServiceId && !(v.extraServiceIds ?? []).includes(s.id))
}

/**
 * Lignes envoyées au serveur : une par prestation, `uid véhicule:ligne`. Toutes les
 * lignes d'un véhicule portent la même identité (type, marque, modèle) : c'est ce
 * que le serveur exige pour les traiter comme un même véhicule (L22).
 */
export function toSelectionsPayload(vehicles: V2Vehicle[], serviceId: number | null) {
  if (serviceId == null) return []
  return vehicles.flatMap((v) => {
    const plate = needsPlate(v, serviceId) ? normalizePlate(v.plate) : ""
    const common = { vehicleTypeId: v.vehicleTypeId as number, brand: v.brand.trim(), model: v.model.trim(), ...(plate ? { plate } : {}) }
    return [
      { uid: `${v.uid}:main`, serviceId, optionIds: v.optionIds, ...common },
      ...(v.extraServiceIds ?? []).filter((id) => id !== serviceId).map((id) => ({ uid: `${v.uid}:x${id}`, serviceId: id, optionIds: [] as number[], ...common })),
    ]
  })
}

export function isV2VehicleComplete(v: V2Vehicle, mainServiceId: number | null = null): boolean {
  const base = v.vehicleTypeId != null && v.brand.trim().length > 0 && v.model.trim().length > 0
  // Réservation classique (une prestation) : inchangée, aucune immatriculation demandée.
  return base && (!needsPlate(v, mainServiceId) || isPlateValid(v.plate))
}

/** Conversion vers le format partagé du moteur (brouillon + payload serveur). */
export function toVehicleSelections(vehicles: V2Vehicle[], serviceId: number | null): VehicleSelection[] {
  return vehicles.map((v) => ({
    uid: v.uid,
    vehicleTypeId: v.vehicleTypeId,
    brand: v.brand,
    model: v.model,
    ...(v.plate ? { plate: v.plate } : {}),
    services: [
      { ...newServiceLine(serviceId), lid: `${v.uid}-l`, optionIds: v.optionIds },
      ...(v.extraServiceIds ?? []).map((id) => ({ ...newServiceLine(id), lid: `${v.uid}-x${id}`, optionIds: [] as number[] })),
    ],
  }))
}

/** Reprise depuis le format partagé (brouillon) : 1re prestation = principale, les suivantes = ajoutées (brouillons antérieurs compatibles). */
export function fromVehicleSelections(selections: VehicleSelection[]): {
  serviceId: number | null
  vehicles: V2Vehicle[]
} {
  const vehicles: V2Vehicle[] = selections.map((s) => ({
    uid: s.uid || uid(),
    vehicleTypeId: s.vehicleTypeId ?? null,
    brand: s.brand ?? "",
    model: s.model ?? "",
    optionIds: Array.isArray(s.services?.[0]?.optionIds) ? s.services[0].optionIds : [],
    extraServiceIds: [] as number[],
    ...(s.plate ? { plate: s.plate } : {}),
  }))
  const serviceId = selections.flatMap((s) => s.services ?? []).find((l) => l.serviceId != null)?.serviceId ?? null
  selections.forEach((s, i) => {
    for (const l of (s.services ?? []).slice(1)) {
      if (l.serviceId != null) vehicles[i] = addExtraService(vehicles[i], l.serviceId, serviceId)
    }
  })
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
  const extras = (v.extraServiceIds ?? [])
    .filter((id) => id !== serviceId)
    .map((id) => {
      const x = services.find((s) => s.id === id)
      return v.vehicleTypeId != null ? resolvePrice(services, priceMap, id, v.vehicleTypeId) : { priceCents: x?.basePriceCents ?? 0, durationMin: x?.durationMin ?? 0 }
    })
  return {
    priceCents: base.priceCents + chosen.reduce((s, o) => s + o.priceCents, 0) + extras.reduce((s, e) => s + e.priceCents, 0),
    durationMin: base.durationMin + chosen.reduce((s, o) => s + o.durationMin, 0) + extras.reduce((s, e) => s + e.durationMin, 0),
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
