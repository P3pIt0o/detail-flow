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
import { buildQuote, computeDeposit } from "@/lib/booking/pricing"
import { computeTravel } from "@/lib/booking/travel"
import { validatePromoCode, consumePromoCode, type PromoInvalidReason } from "@/lib/promo/service"
import type { AppliedPromo } from "@/lib/booking/types"
import { getAvailability, timeToMinutes, minutesToTime } from "@/lib/booking/availability"
import type { BookingSelection } from "@/lib/booking/types"
import { resolveRequestTenant, tenantAcceptsBookings } from "@/lib/tenant"
import { recordBookingCompleted } from "@/lib/analytics/queries"
import { getCompanyPaymentConfig } from "@/lib/payments/queries"
import { willRequireOnlinePayment } from "@/lib/payments/mode"
import { canUseFeature } from "@/lib/licensing/enforce"
import { notFound } from "next/navigation"
import { eq, sql } from "drizzle-orm"
import { randomBytes } from "crypto"

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
/*  Aperçu d'un code promo (validation serveur, SANS consommation)            */
/* -------------------------------------------------------------------------- */

export type PromoPreviewResult =
  | { ok: true; code: string; discountType: "percent" | "fixed"; discountValue: number; discountCents: number }
  | { ok: false; reason: PromoInvalidReason }

/**
 * Valide un code promo pour la sélection courante et renvoie la remise calculée.
 * Le montant est TOUJOURS recalculé côté serveur ; le navigateur ne décide rien.
 * Aucune consommation ici (le compteur n'augmente qu'à la création du booking).
 */
export async function validatePromoCodeAction(input: {
  selections: BookingSelection[]
  code: string
}): Promise<PromoPreviewResult> {
  const tenant = await resolveRequestTenant()
  if (!tenant) notFound()

  const settings = await getSettings(tenant.id)
  const quote = await buildQuote(input.selections, settings, null)
  const res = await validatePromoCode({
    companyId: tenant.id,
    code: input.code,
    eligibleSubtotalCents: quote.eligibleSubtotalCents,
  })
  if (!res.valid) return { ok: false, reason: res.reason }
  return {
    ok: true,
    code: res.normalizedCode,
    discountType: res.discountType,
    discountValue: res.discountValue,
    discountCents: res.discountCents,
  }
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
  /** Code promo saisi par le client (revalidé côté serveur, jamais de confiance). */
  promoCode?: string
}

export type CreateBookingResult =
  | { ok: true; reference: string; payUrl?: string }
  | { ok: false; error: string; code?: "slot_taken" | "invalid" | "out_of_range" | "closed" }

/** Génère une référence lisible du type "DF-20260115-4821". */
function generateReference(dateStr: string): string {
  const compact = dateStr.replace(/-/g, "")
  const rand = Math.floor(1000 + Math.random() * 9000)
  return `DF-${compact}-${rand}`
}

/**
 * Jeton public de gestion du RDV : 24 octets aléatoires (192 bits) encodés en
 * base64url (URL-safe). Impossible à deviner ; ne contient aucune donnée
 * tenant/client. Permet au client non authentifié d'annuler son rendez-vous.
 */
function generateManageToken(): string {
  return randomBytes(24).toString("base64url")
}

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function createBookingAction(input: CreateBookingInput): Promise<CreateBookingResult> {
  const { selections, date, startTime, customer, address, notes, promoCode } = input

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
  const tenant = await resolveRequestTenant()
  if (!tenant) notFound()

  // Contrôle serveur : une entreprise suspendue/archivée ou n'acceptant pas les
  // réservations (bookingMode = DISABLED) ne peut jamais créer de réservation,
  // même via un appel direct à la Server Action. Réutilise tenantAcceptsBookings().
  if (!tenantAcceptsBookings(tenant)) {
    return {
      ok: false,
      error: "Les réservations en ligne ne sont pas disponibles pour cette entreprise.",
      code: "closed",
    }
  }

  // Contrôle de licence (feature online_booking) — moteur central, tenant
  // résolu côté serveur. LEGACY (licensePlan = NULL) => autorisé (comportement
  // actuel strictement inchangé). Un tenant avec licence explicite SANS
  // online_booking ne peut pas créer de NOUVELLE réservation en ligne ; aucune
  // réservation existante n'est touchée et bookingMode n'est jamais modifié.
  if (!(await canUseFeature(tenant.id, "online_booking"))) {
    return {
      ok: false,
      error: "Les réservations en ligne ne sont pas disponibles pour cette entreprise.",
      code: "closed",
    }
  }

  const companyId = tenant.id

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

  // 3b. Revalidation serveur du code promo (le navigateur n'est jamais cru).
  //     La remise et le total sont recalculés ici depuis la base.
  let appliedPromo: AppliedPromo | null = null
  let discountCents = 0
  if (promoCode?.trim()) {
    const promoRes = await validatePromoCode({
      companyId,
      code: promoCode,
      eligibleSubtotalCents: quote.eligibleSubtotalCents,
    })
    if (!promoRes.valid) {
      return { ok: false, error: "Code promo invalide ou indisponible.", code: "invalid" }
    }
    discountCents = Math.max(0, Math.min(promoRes.discountCents, quote.eligibleSubtotalCents))
    appliedPromo = {
      promoCodeId: promoRes.promoCodeId,
      code: promoRes.normalizedCode,
      discountType: promoRes.discountType,
      discountValue: promoRes.discountValue,
      discountCents,
    }
  }
  // Totaux finaux (jamais négatifs) recalculés avec la remise validée.
  const finalTotalCents = quote.subtotalCents + quote.travelFeeCents - discountCents
  const finalDepositCents = computeDeposit(finalTotalCents, settings)

  const startMin = timeToMinutes(startTime)
  const endMin = startMin + quote.totalDurationMin
  const endTime = minutesToTime(endMin)
  const vehicleCount = quote.lines.length

  // 4. Transaction atomique + verrou par date pour empêcher les doublons.
  try {
    const result = await db.transaction(async (tx) => {
      // Sérialise les réservations concurrentes sur la même journée POUR UNE
      // MÊME entreprise. La clé combine companyId + date (variante à deux
      // entiers de pg_advisory_xact_lock) : deux entreprises différentes ne se
      // bloquent donc jamais mutuellement pour la même date.
      const dateKey = Number.parseInt(date.replace(/-/g, "").slice(2), 10) // ex: 260115
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${companyId}, ${dateKey})`)

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

      // Consommation ATOMIQUE du code promo (compteur +1 avec re-vérification
      // tenant/actif/limite dans la même requête). Si le code n'est plus
      // disponible (limite atteinte entre-temps), on refuse proprement.
      if (appliedPromo) {
        const consumed = await consumePromoCode(tx, companyId, appliedPromo.promoCodeId)
        if (!consumed) return { conflict: "promo_unavailable" as const }
      }

      // Insertion de la réservation (statut selon acompte).
      const status = finalDepositCents > 0 ? "pending_deposit" : "confirmed"
      const [inserted] = await tx
        .insert(bookings)
        .values({
          companyId,
          reference,
          manageToken: generateManageToken(),
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
          promoCodeId: appliedPromo?.promoCodeId ?? null,
          promoCodeSnapshot: appliedPromo
            ? {
                code: appliedPromo.code,
                discountType: appliedPromo.discountType,
                discountValue: appliedPromo.discountValue,
                discountCents: appliedPromo.discountCents,
              }
            : null,
          discountCents,
          totalCents: finalTotalCents,
          depositCents: finalDepositCents,
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
      if (result.conflict === "promo_unavailable") {
        return { ok: false, error: "Code promo invalide ou indisponible.", code: "invalid" }
      }
      return { ok: false, error: "Ce créneau vient d'être réserv��. Merci d'en choisir un autre.", code: "slot_taken" }
    }

    // Analytics (V1) : réservation terminée. companyId résolu côté serveur.
    // Non bloquant : un échec de compteur n'invalide jamais la réservation.
    void recordBookingCompleted(companyId).catch(() => {})

    // Paiement en ligne (OPTIONNEL). Si le tenant a activé les paiements, on
    // dirige le client vers la page de paiement DetailFlow. Sinon, comportement
    // actuel inchangé (aucune dépendance à un provider).
    const paymentConfig = await getCompanyPaymentConfig(companyId)
    const canUsePayments = await canUseFeature(companyId, "online_payments")
    const mode = paymentConfig?.paymentMode ?? "none"
    const paymentsReady =
      canUsePayments && Boolean(paymentConfig?.paymentsEnabled) && Boolean(paymentConfig?.canCollect) && mode !== "none"

    // Un paiement en ligne EFFECTIF sera-t-il demandé ? (mode actif + montant ≥
    // minimum Stripe). Si OUI, la SEULE confirmation client/pro proviendra du
    // webhook signé après encaissement : on N'ENVOIE PAS l'email de création
    // (fin du double email). Si NON (tenant hors-ligne, ou montant sous le
    // minimum Stripe non encaissable en ligne), on envoie la confirmation de
    // création classique — comportement historique strictement préservé.
    // Non bloquant : un échec d'email n'invalide jamais la réservation.
    const requiresOnlinePayment = willRequireOnlinePayment({
      paymentsReady,
      mode,
      depositCents: finalDepositCents,
      totalCents: finalTotalCents,
    })
    if (!requiresOnlinePayment) {
      await sendBookingCreatedEmails(result.id)
    }

    if (paymentsReady) {
      return { ok: true, reference: result.reference, payUrl: `/reservation/paiement/${result.id}` }
    }

    return { ok: true, reference: result.reference }
  } catch (e) {
    console.log("[v0] createBooking error:", e instanceof Error ? e.message : e)
    return { ok: false, error: "Une erreur est survenue. Merci de réessayer.", code: "invalid" }
  }
}
