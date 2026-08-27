"use server"

/**
 * ============================================================================
 *  ACTION SERVEUR — MODIFICATION D'UNE RÉSERVATION (admin)
 * ============================================================================
 *  Réutilise intégralement le moteur existant (lib/booking) : aucune formule
 *  de prix, de durée ou de disponibilité n'est dupliquée ici.
 *    - prix/durée   : buildQuote() (lib/booking/pricing.ts)
 *    - déplacement  : computeTravel() (lib/booking/travel.ts)
 *    - créneaux     : getActiveBookingsForDate()/countVehiclesForDate()
 *                      (lib/booking/queries.ts), avec exclusion de la
 *                      réservation en cours d'édition.
 *
 *  Sécurité multi-tenant : la réservation n'est chargée et modifiée QUE si
 *  `booking.id = bookingId` ET `booking.companyId = tenant.id`, où le
 *  `companyId` provient exclusivement du contexte serveur (requireCompanyMember).
 *
 *  Atomicité : booking + bookingItems + bookingItemOptions sont modifiés dans
 *  une seule transaction. Toute erreur annule l'ensemble (pas d'état partiel).
 * ============================================================================
 */

import { revalidatePath } from "next/cache"
import { eq, inArray, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { bookings, bookingItems, bookingItemOptions } from "@/lib/db/schema"
import { requireCompanyMember, requireCompanyRole } from "@/lib/admin"
import { requestRefund } from "@/lib/payments/refunds"
import { getSettings, getActiveBookingsForDate, countVehiclesForDate } from "@/lib/booking/queries"
import { buildQuote } from "@/lib/booking/pricing"
import { computeTravel } from "@/lib/booking/travel"
import { timeToMinutes, minutesToTime } from "@/lib/booking/availability"
import { sendBookingUpdatedEmail } from "@/lib/email/notifications"
import type { BookingSelection } from "@/lib/booking/types"

export type UpdateBookingVehicle = {
  uid: string
  serviceId: number
  vehicleTypeId: number
  optionIds: number[]
  brand: string
  model: string
  plate: string
}

export type UpdateBookingInput = {
  bookingId: number
  date: string
  startTime: string
  customer: { name: string; email: string; phone: string }
  address: string
  notes: string
  vehicles: UpdateBookingVehicle[]
}

export type UpdateBookingResult =
  | { ok: true }
  | { ok: false; error: string; code?: "slot_taken" | "invalid" | "out_of_range" | "not_found" }

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function updateBookingAction(input: UpdateBookingInput): Promise<UpdateBookingResult> {
  const { tenant } = await requireCompanyMember()
  const companyId = tenant.id

  // 1. Validation de base (identique à la création).
  if (!input.vehicles?.length) return { ok: false, error: "Ajoutez au moins un véhicule.", code: "invalid" }
  for (const v of input.vehicles) {
    if (!v.brand?.trim() || !v.model?.trim()) {
      return { ok: false, error: "Marque et modèle obligatoires pour chaque véhicule.", code: "invalid" }
    }
  }
  if (!input.date || !/^\d{4}-\d{2}-\d{2}$/.test(input.date))
    return { ok: false, error: "Date invalide.", code: "invalid" }
  if (!input.startTime || !/^\d{2}:\d{2}$/.test(input.startTime))
    return { ok: false, error: "Créneau invalide.", code: "invalid" }
  if (!input.customer?.name?.trim()) return { ok: false, error: "Nom requis.", code: "invalid" }
  if (!emailRe.test(input.customer?.email ?? "")) return { ok: false, error: "Email invalide.", code: "invalid" }
  if (!input.customer?.phone?.trim()) return { ok: false, error: "Téléphone requis.", code: "invalid" }
  if (!input.address?.trim() || input.address.trim().length < 5)
    return { ok: false, error: "Adresse invalide.", code: "invalid" }

  // 2. Réservation EXISTANTE, strictement scopée à l'entreprise courante.
  //    booking.id = bookingId ET booking.companyId = tenant.id — jamais l'inverse.
  const [existing] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, input.bookingId))
    .limit(1)
  if (!existing || existing.companyId !== companyId) {
    return { ok: false, error: "Réservation introuvable.", code: "not_found" }
  }

  const settings = await getSettings(companyId)

  // 3. Recalcul du déplacement (autorité serveur — jamais la valeur du navigateur).
  const travel = await computeTravel(input.address, settings)
  if (!travel.ok) {
    if (travel.error === "out_of_range")
      return { ok: false, error: "Adresse hors de la zone d'intervention.", code: "out_of_range" }
    return { ok: false, error: "Adresse introuvable ou itinéraire impossible.", code: "invalid" }
  }

  // 4. Recalcul du devis (prix, durée, options) — moteur existant, non dupliqué.
  const selections: BookingSelection[] = input.vehicles.map((v) => ({
    uid: v.uid,
    serviceId: v.serviceId,
    vehicleTypeId: v.vehicleTypeId,
    optionIds: v.optionIds,
    brand: v.brand,
    model: v.model,
    plate: v.plate,
  }))
  const quote = await buildQuote(selections, settings, travel)
  if (!quote.lines.length) return { ok: false, error: "Prestations invalides.", code: "invalid" }

  const startMin = timeToMinutes(input.startTime)
  const endMin = startMin + quote.totalDurationMin
  const endTime = minutesToTime(endMin)
  const vehicleCount = quote.lines.length

  // Composition actuelle (avant remplacement) des prestations/options, pour
  // détecter un changement de prestation/options même si la durée totale ne
  // change pas (ex. remplacement d'une prestation par une autre de même durée).
  const previousItems = await db
    .select({ id: bookingItems.id, serviceId: bookingItems.serviceId })
    .from(bookingItems)
    .where(eq(bookingItems.bookingId, input.bookingId))
  const previousItemIds = previousItems.map((i) => i.id)
  const previousOptions = previousItemIds.length
    ? await db
        .select({ bookingItemId: bookingItemOptions.bookingItemId, optionId: bookingItemOptions.optionId })
        .from(bookingItemOptions)
        .where(inArray(bookingItemOptions.bookingItemId, previousItemIds))
    : []
  const previousComposition = previousItems
    .map((i) => {
      const optionIds = previousOptions
        .filter((o) => o.bookingItemId === i.id)
        .map((o) => o.optionId)
        .sort((a, b) => a - b)
      return `${i.serviceId}:${optionIds.join(",")}`
    })
    .sort()
    .join("|")
  const nextComposition = quote.lines
    .map((line) => `${line.serviceId}:${line.options.map((o) => o.optionId).sort((a, b) => a - b).join(",")}`)
    .sort()
    .join("|")

  // Détection d'un changement significatif (déclenche l'email au client).
  const significantChange =
    existing.date !== input.date ||
    existing.startTime !== input.startTime ||
    existing.address !== travel.address ||
    previousComposition !== nextComposition

  try {
    const result = await db.transaction(async (tx) => {
      // Verrou par entreprise + date CIBLE : sérialise les modifications/
      // créations concurrentes sur la même journée (même logique que la
      // création de réservation).
      const dateKey = Number.parseInt(input.date.replace(/-/g, "").slice(2), 10)
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${companyId}, ${dateKey})`)

      // Re-vérifie la disponibilité DANS la transaction, en excluant CETTE
      // réservation (elle ne doit jamais se bloquer elle-même).
      const buffer = settings.bufferMin
      const active = await getActiveBookingsForDate(input.date, companyId, input.bookingId)
      const overlaps = active.some((b) => {
        const bs = timeToMinutes(b.startTime)
        const be = timeToMinutes(b.endTime)
        return startMin < be + buffer && endMin + buffer > bs
      })
      if (overlaps) return { conflict: "slot_taken" as const }

      const booked = await countVehiclesForDate(input.date, companyId, input.bookingId)
      if (booked + vehicleCount > settings.maxVehiclesPerDay) return { conflict: "slot_taken" as const }

      // Mise à jour de la réservation.
      await tx
        .update(bookings)
        .set({
          customerName: input.customer.name.trim(),
          customerEmail: input.customer.email.trim().toLowerCase(),
          customerPhone: input.customer.phone.trim(),
          address: travel.address,
          addressLat: travel.lat ? String(travel.lat) : null,
          addressLng: travel.lng ? String(travel.lng) : null,
          distanceKm: String(travel.distanceKm),
          billedDistanceKm: String(travel.billedDistanceKm),
          travelFeeCents: travel.feeCents,
          servicesCents: quote.servicesCents,
          optionsCents: quote.optionsCents,
          subtotalCents: quote.subtotalCents,
          totalCents: quote.totalCents,
          depositCents: quote.depositCents,
          date: input.date,
          startTime: input.startTime,
          endTime,
          totalDurationMin: quote.totalDurationMin,
          notes: input.notes?.trim() || null,
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, input.bookingId))

      // Remplacement des lignes véhicules + options (approche simple et fiable,
      // identique au principe déjà utilisé pour les factures brouillon).
      const oldItems = await tx
        .select({ id: bookingItems.id })
        .from(bookingItems)
        .where(eq(bookingItems.bookingId, input.bookingId))
      const oldItemIds = oldItems.map((i) => i.id)
      if (oldItemIds.length) {
        for (const itemId of oldItemIds) {
          await tx.delete(bookingItemOptions).where(eq(bookingItemOptions.bookingItemId, itemId))
        }
      }
      await tx.delete(bookingItems).where(eq(bookingItems.bookingId, input.bookingId))

      const detailsByUid = new Map(
        input.vehicles.map((v) => [v.uid, { brand: v.brand, model: v.model, plate: v.plate }]),
      )

      for (const line of quote.lines) {
        const details = detailsByUid.get(line.uid)
        const [item] = await tx
          .insert(bookingItems)
          .values({
            bookingId: input.bookingId,
            serviceId: line.serviceId,
            serviceName: line.serviceName,
            vehicleTypeId: line.vehicleTypeId,
            vehicleTypeName: line.vehicleTypeName,
            vehicleBrand: details?.brand?.trim() || null,
            vehicleModel: details?.model?.trim() || null,
            vehiclePlate: details?.plate?.trim() || null,
            priceCents: line.priceCents,
            durationMin: line.durationMin,
          })
          .returning({ id: bookingItems.id })

        if (line.options.length) {
          await tx.insert(bookingItemOptions).values(
            line.options.map((o) => ({
              bookingItemId: item.id,
              optionId: o.optionId,
              optionName: o.optionName,
              priceCents: o.priceCents,
              durationMin: o.durationMin,
            })),
          )
        }
      }

      return { ok: true as const }
    })

    if ("conflict" in result) {
      return { ok: false, error: "Ce créneau n'est plus disponible. Merci d'en choisir un autre.", code: "slot_taken" }
    }
  } catch (e) {
    console.log("[v0] updateBookingAction error:", e instanceof Error ? e.message : e)
    return { ok: false, error: "Une erreur est survenue. Merci de réessayer.", code: "invalid" }
  }

  // Email de modification : non bloquant, jamais de rollback en cas d'échec.
  if (significantChange) {
    await sendBookingUpdatedEmail(input.bookingId)
  }

  revalidatePath("/admin/reservations")
  revalidatePath(`/admin/reservations/${input.bookingId}`)
  revalidatePath("/admin/calendrier")
  return { ok: true }
}

/* ============================================================================
 *  ACTION SERVEUR — SUPPRESSION D'UNE RÉSERVATION (admin)
 * ============================================================================
 *  Sécurité multi-tenant : la réservation n'est supprimée QUE si
 *  `booking.companyId = tenant.id`, le `companyId` provenant exclusivement du
 *  contexte serveur (requireCompanyMember) — jamais du client. Une entreprise
 *  ne peut donc pas supprimer le rendez-vous d'une autre.
 *
 *  Les tables enfants (booking_items, booking_item_options) n'ont pas de
 *  cascade en base : on les supprime explicitement dans la même transaction,
 *  exactement comme le fait déjà updateBookingAction. Les factures ne sont pas
 *  touchées (aucune contrainte FK sur invoices.bookingId).
 * ========================================================================== */

export type DeleteBookingResult = { ok: true } | { ok: false; error: string }

export async function deleteBookingAction(bookingId: number): Promise<DeleteBookingResult> {
  const { tenant } = await requireCompanyMember()
  const companyId = tenant.id

  if (!Number.isInteger(bookingId)) return { ok: false, error: "Réservation invalide." }

  // Vérification d'appartenance stricte au tenant courant.
  const [existing] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1)
  if (!existing || existing.companyId !== companyId) {
    return { ok: false, error: "Réservation introuvable." }
  }

  try {
    await db.transaction(async (tx) => {
      const childItems = await tx
        .select({ id: bookingItems.id })
        .from(bookingItems)
        .where(eq(bookingItems.bookingId, bookingId))
      const childItemIds = childItems.map((i) => i.id)
      if (childItemIds.length) {
        await tx.delete(bookingItemOptions).where(inArray(bookingItemOptions.bookingItemId, childItemIds))
      }
      await tx.delete(bookingItems).where(eq(bookingItems.bookingId, bookingId))
      // Re-scopé par companyId par sécurité (double garde).
      await tx.delete(bookings).where(eq(bookings.id, bookingId))
    })
  } catch (e) {
    console.log("[v0] deleteBookingAction error:", e instanceof Error ? e.message : e)
    return { ok: false, error: "La suppression a échoué. Merci de réessayer." }
  }

  revalidatePath("/admin/reservations")
  revalidatePath("/admin/calendrier")
  return { ok: true }
}

/* ============================================================================
 *  ACTION SERVEUR — REMBOURSEMENT STRIPE (admin tenant)
 * ============================================================================
 *  Autorisation : OWNER/ADMIN uniquement (droit financier `payments.refund`) —
 *  un EMPLOYEE ne peut pas rembourser. Le `companyId` et l'identité viennent
 *  EXCLUSIVEMENT du contexte serveur (requireCompanyRole), jamais du navigateur.
 *
 *  Toute la logique financière (montant ≤ remboursable, verrou anti-concurrence,
 *  idempotence, appel Stripe sur le compte connecté du tenant, statut final via
 *  webhook) est déléguée à `requestRefund` (lib/payments/refunds.ts). Le
 *  paiement d'origine et la réservation ne sont jamais supprimés.
 * ========================================================================== */

export type RefundActionInput = {
  bookingId: number
  paymentId: number
  amountCents: number
  reason: string
  /** Clé d'idempotence STABLE générée par le client à l'ouverture du dialog. */
  idempotencyKey: string
}

export type RefundActionResult =
  | { ok: true; status: string; duplicate?: boolean }
  | { ok: false; error: string }

/** Messages FR simples (professionnels du detailing, pas des juristes). */
const REFUND_ERROR_FR: Record<string, string> = {
  reason_required: "Le motif du remboursement est obligatoire.",
  invalid_amount: "Le montant à rembourser est invalide.",
  payment_not_refundable: "Ce paiement ne peut pas être remboursé.",
  already_refunded: "Ce paiement est déjà intégralement remboursé.",
  exceeds_refundable: "Le montant dépasse le montant encore remboursable.",
  payment_not_found: "Paiement introuvable.",
  missing_stripe_context: "Configuration Stripe indisponible pour ce paiement.",
  invalid_idempotency_key: "Requête invalide. Rechargez la page et réessayez.",
  internal_error: "Une erreur est survenue. Merci de réessayer.",
  // Messages basés sur le CODE réellement renvoyé par Stripe (jamais un message
  // de solde par défaut).
  insufficient_funds:
    "Solde Stripe insuffisant sur le compte connecté pour effectuer ce remboursement. Réessayez une fois le solde suffisant.",
  already_refunded_stripe: "Ce paiement a déjà été remboursé côté Stripe.",
  amount_too_large: "Le montant dépasse ce qui peut être remboursé pour ce paiement.",
  no_application_fee: "Aucune commission à rembourser sur ce paiement.",
  idempotency_conflict: "Une demande identique est déjà en cours. Rechargez la page.",
  temporary: "Erreur temporaire chez Stripe. Merci de réessayer dans un instant.",
  stripe_error: "Le remboursement a échoué. Si le problème persiste, contactez le support.",
}

export async function refundPaymentAction(input: RefundActionInput): Promise<RefundActionResult> {
  // Droit financier requis (OWNER/ADMIN). Un EMPLOYEE est refusé (notFound).
  const { tenant, user } = await requireCompanyRole(["OWNER", "ADMIN"])
  const companyId = tenant.id

  if (!Number.isInteger(input.bookingId) || !Number.isInteger(input.paymentId)) {
    return { ok: false, error: "Réservation ou paiement invalide." }
  }
  if (!input.reason || input.reason.trim().length === 0) {
    return { ok: false, error: REFUND_ERROR_FR.reason_required }
  }

  const res = await requestRefund({
    bookingId: input.bookingId,
    paymentId: input.paymentId,
    companyId,
    amountCents: input.amountCents,
    reason: input.reason,
    initiatedByUserId: user.id,
    idempotencyKey: input.idempotencyKey,
  })

  if (!res.ok) {
    return { ok: false, error: REFUND_ERROR_FR[res.error] ?? REFUND_ERROR_FR.internal_error }
  }

  revalidatePath(`/admin/reservations/${input.bookingId}`)
  return { ok: true, status: res.status, duplicate: res.duplicate }
}
