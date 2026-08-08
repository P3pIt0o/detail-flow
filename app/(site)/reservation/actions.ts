"use server"

/**
 * ============================================================================
 *  ACTIONS SERVEUR — RÉSERVATION
 * ============================================================================
 *  Toute la logique sensible (prix, déplacement, créneaux, anti-doublon) est
 *  recalculée ici. Les montants et distances envoyés par le client ne sont
 *  JAMAIS utilisés pour la facturation : ils sont recalculés depuis la base.
 * ============================================================================
 */

import { db } from "@/lib/db"
import { bookings, bookingItems, bookingItemOptions } from "@/lib/db/schema"
import { sendBookingCreatedEmails } from "@/lib/email/notifications"
import { getSettings, getActiveBookingsForDate, countVehiclesForDate } from "@/lib/booking/queries"
import { buildQuote } from "@/lib/booking/pricing"
import { computeTravel } from "@/lib/booking/travel"
import { getAvailability, timeToMinutes, minutesToTime } from "@/lib/booking/availability"
import type { BookingSelection } from "@/lib/booking/types"
import { requireCompanyId } from "@/lib/tenant"
import { eq, sql } from "drizzle-orm"

/* -------------------------------------------------------------------------- */
/*  Devis en direct (appelé quand le client modifie ses choix)               */
/* -------------------------------------------------------------------------- */

export async function getQuoteAction(selections: BookingSelection[], address?: string) {
  const settings = await getSettings()
  const travel = address && address.trim().length >= 5 ? await computeTravel(address, settings) : null
  const quote = await buildQuote(selections, settings, travel)
  return { quote, depositType: settings.depositType, depositValue: settings.depositValue }
}

/* -------------------------------------------------------------------------- */
/*  Créneaux disponibles pour une date                                        */
/* -------------------------------------------------------------------------- */

export async function getAvailabilityAction(dateStr: string, durationMin: number, vehicleCount: number) {
  return getAvailability(dateStr, durationMin, vehicleCount)
}

/* -------------------------------------------------------------------------- */
/*  Calcul du déplacement seul (retour d'adresse)                             */
/* -------------------------------------------------------------------------- */

export async function computeTravelAction(address: string) {
  const settings = await getSettings()
  return computeTravel(address, settings)
}

/* -------------------------------------------------------------------------- */
/*  Création de la réservation                                                */
/* -------------------------------------------------------------------------- */

export type CreateBookingInput = {
  selections: BookingSelection[]
  date: string
  startTime: string
  customer: { name: string; email: string; phone: string }
  address: string
  notes?: string
}

export type CreateBookingResult =
  | { ok: true; reference: string }
  | { ok: false; error: string; code?: "slot_taken" | "invalid" | "out_of_range" | "closed" }

/** Génère une référence lisible du type "DF-20260115-4821". */
function generateReference(dateStr: string): string {
  const compact = dateStr.replace(/-/g, "")
  const rand = Math.floor(1000 + Math.random() * 9000)
  return `DF-${compact}-${rand}`
}

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function createBookingAction(input: CreateBookingInput): Promise<CreateBookingResult> {
  const { selections, date, startTime, customer, address, notes } = input

  // 1. Validation de base des entrées.
  if (!selections?.length) return { ok: false, error: "Aucune prestation sélectionnée.", code: "invalid" }
  // Marque et modèle du véhicule obligatoires (contrôle serveur indépendant de l'UI).
  for (const s of selections) {
    if (!s.brand?.trim() || !s.model?.trim()) {
      return { ok: false, error: "Champ obligatoire", code: "invalid" }
    }
  }
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Date invalide.", code: "invalid" }
  if (!startTime || !/^\d{2}:\d{2}$/.test(startTime)) return { ok: false, error: "Créneau invalide.", code: "invalid" }
  if (!customer?.name?.trim()) return { ok: false, error: "Nom requis.", code: "invalid" }
  if (!emailRe.test(customer?.email ?? "")) return { ok: false, error: "Email invalide.", code: "invalid" }
  if (!customer?.phone?.trim()) return { ok: false, error: "Téléphone requis.", code: "invalid" }
  if (!address?.trim() || address.trim().length < 5) return { ok: false, error: "Adresse invalide.", code: "invalid" }

  // Entreprise (tenant) courante : toutes les lectures/écritures y sont rattachées.
  const companyId = await requireCompanyId()

  const settings = await getSettings(companyId)

  // Mode vacances : prise de réservation suspendue. Contrôle serveur
  // indépendant de l'UI pour empêcher tout contournement.
  if (settings.vacationMode) {
    return {
      ok: false,
      error: "Les réservations en ligne sont momentanément fermées.",
      code: "closed",
    }
  }

  // 2. Recalcul du déplacement (autorité serveur).
  const travel = await computeTravel(address, settings)
  if (!travel.ok) {
    if (travel.error === "out_of_range")
      return { ok: false, error: "Adresse hors de la zone d'intervention.", code: "out_of_range" }
    return { ok: false, error: "Adresse introuvable ou itinéraire impossible.", code: "invalid" }
  }

  // 3. Recalcul du devis (autorité serveur).
  const quote = await buildQuote(selections, settings, travel)
  if (!quote.lines.length) return { ok: false, error: "Prestations invalides.", code: "invalid" }

  const startMin = timeToMinutes(startTime)
  const endMin = startMin + quote.totalDurationMin
  const endTime = minutesToTime(endMin)
  const vehicleCount = quote.lines.length

  // 4. Transaction atomique + verrou par date pour empêcher les doublons.
  try {
    const result = await db.transaction(async (tx) => {
      // Sérialise les réservations concurrentes sur la même journée.
      const lockKey = Number.parseInt(date.replace(/-/g, "").slice(2), 10) // ex: 260115
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`)

      // Re-vérifie la disponibilité DANS la transaction (anti-doublon fiable).
      const buffer = settings.bufferMin
      const active = await getActiveBookingsForDate(date, companyId)
      const overlaps = active.some((b) => {
        const bs = timeToMinutes(b.startTime)
        const be = timeToMinutes(b.endTime)
        return startMin < be + buffer && endMin + buffer > bs
      })
      if (overlaps) return { conflict: "slot_taken" as const }

      const booked = await countVehiclesForDate(date, companyId)
      if (booked + vehicleCount > settings.maxVehiclesPerDay) return { conflict: "slot_taken" as const }

      // Référence unique.
      let reference = generateReference(date)
      for (let i = 0; i < 5; i++) {
        const exists = await tx
          .select({ id: bookings.id })
          .from(bookings)
          .where(eq(bookings.reference, reference))
          .limit(1)
        if (!exists.length) break
        reference = generateReference(date)
      }

      // Insertion de la réservation (statut selon acompte).
      const status = quote.depositCents > 0 ? "pending_deposit" : "confirmed"
      const [inserted] = await tx
        .insert(bookings)
        .values({
          companyId,
          reference,
          customerName: customer.name.trim(),
          customerEmail: customer.email.trim().toLowerCase(),
          customerPhone: customer.phone.trim(),
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
          date,
          startTime,
          endTime,
          totalDurationMin: quote.totalDurationMin,
          status,
          notes: notes?.trim() || null,
        })
        .returning({ id: bookings.id, reference: bookings.reference })

      // Index des détails véhicule saisis par le client (par uid de ligne).
      const detailsByUid = new Map(
        selections.map((s) => [s.uid, { brand: s.brand, model: s.model, plate: s.plate }]),
      )

      // Lignes (véhicules) + options.
      for (const line of quote.lines) {
        const details = detailsByUid.get(line.uid)
        const [item] = await tx
          .insert(bookingItems)
          .values({
            bookingId: inserted.id,
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

      return { id: inserted.id, reference: inserted.reference }
    })

    if ("conflict" in result) {
      return { ok: false, error: "Ce créneau vient d'être réservé. Merci d'en choisir un autre.", code: "slot_taken" }
    }

    // Emails transactionnels : confirmation au client + notification au pro.
    // Non bloquant : un échec d'email n'invalide pas la réservation.
    await sendBookingCreatedEmails(result.id)

    return { ok: true, reference: result.reference }
  } catch (e) {
    console.log("[v0] createBooking error:", e instanceof Error ? e.message : e)
    return { ok: false, error: "Une erreur est survenue. Merci de réessayer.", code: "invalid" }
  }
}
