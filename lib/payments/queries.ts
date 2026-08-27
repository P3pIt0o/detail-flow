import "server-only"
import { db } from "@/lib/db"
import { payments, paymentEvents, companies, bookings } from "@/lib/db/schema"
import { and, desc, eq } from "drizzle-orm"
import { getPaymentProvider } from "./providers"
import { getDefaultPlatformFeeBps, resolvePlatformFeeBps } from "./config"
import { computePlatformFeeCents, type PaymentType } from "./types"

/* -------------------------------------------------------------------------- */
/*  Configuration paiement d'un tenant                                        */
/* -------------------------------------------------------------------------- */

export type CompanyPaymentConfig = {
  companyId: number
  provider: string | null
  stripeAccountId: string | null
  stripeChargesEnabled: boolean
  stripeDetailsSubmitted: boolean
  paymentsEnabled: boolean
  paymentMode: "none" | "deposit" | "full"
  platformFeeBps: number
  /** Vrai si tout est prêt pour encaisser un client en ligne. */
  canCollect: boolean
}

/**
 * Charge la config paiement d'une entreprise + le taux de commission résolu.
 * `companyId` DOIT provenir du tenant résolu côté serveur (jamais du client).
 */
export async function getCompanyPaymentConfig(companyId: number): Promise<CompanyPaymentConfig | null> {
  const [c] = await db
    .select({
      id: companies.id,
      provider: companies.paymentProvider,
      stripeAccountId: companies.stripeAccountId,
      stripeChargesEnabled: companies.stripeChargesEnabled,
      stripeDetailsSubmitted: companies.stripeDetailsSubmitted,
      paymentsEnabled: companies.paymentsEnabled,
      paymentMode: companies.paymentMode,
      platformFeeBps: companies.platformFeeBps,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1)
  if (!c) return null

  const defaultBps = await getDefaultPlatformFeeBps()
  const feeBps = resolvePlatformFeeBps({ platformFeeBps: c.platformFeeBps }, defaultBps)
  const mode = (c.paymentMode as CompanyPaymentConfig["paymentMode"]) ?? "none"
  const canCollect =
    c.paymentsEnabled &&
    mode !== "none" &&
    c.provider === "stripe" &&
    Boolean(c.stripeAccountId) &&
    c.stripeChargesEnabled

  return {
    companyId: c.id,
    provider: c.provider,
    stripeAccountId: c.stripeAccountId,
    stripeChargesEnabled: c.stripeChargesEnabled,
    stripeDetailsSubmitted: c.stripeDetailsSubmitted,
    paymentsEnabled: c.paymentsEnabled,
    paymentMode: mode,
    platformFeeBps: feeBps,
    canCollect,
  }
}

/* -------------------------------------------------------------------------- */
/*  Lecture des paiements (toujours borné par companyId — isolation tenant)   */
/* -------------------------------------------------------------------------- */

export async function listPaymentsForBooking(bookingId: number, companyId: number) {
  return db
    .select()
    .from(payments)
    .where(and(eq(payments.bookingId, bookingId), eq(payments.companyId, companyId)))
    .orderBy(desc(payments.createdAt))
}

/** Vrai si la réservation possède déjà un paiement encaissé. */
export async function bookingHasPaidPayment(bookingId: number, companyId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: payments.id })
    .from(payments)
    .where(and(eq(payments.bookingId, bookingId), eq(payments.companyId, companyId), eq(payments.status, "paid")))
    .limit(1)
  return Boolean(row)
}

export type BookingPaymentReturnInfo = {
  paid: boolean
  reference: string
  date: string
  startTime: string
  totalCents: number
  /** Montant encaissé (0 tant qu'aucun paiement "paid"). */
  paidCents: number
  type: PaymentType | null
  /** Solde restant à régler sur place (acompte). */
  remainingCents: number
}

/**
 * Informations d'affichage de la page de retour, STRICTEMENT bornées au tenant
 * (companyId issu du contexte serveur) + au bookingId : une réservation d'un
 * autre tenant renvoie `null` (aucune fuite inter-tenant). Le statut payé fait
 * foi via la table `payments` (alimentée par le webhook signé), jamais via
 * `session_id` de l'URL.
 */
export async function getBookingPaymentReturnInfo(
  bookingId: number,
  companyId: number,
): Promise<BookingPaymentReturnInfo | null> {
  const [booking] = await db
    .select({
      reference: bookings.reference,
      date: bookings.date,
      startTime: bookings.startTime,
      totalCents: bookings.totalCents,
    })
    .from(bookings)
    .where(and(eq(bookings.id, bookingId), eq(bookings.companyId, companyId)))
    .limit(1)
  if (!booking) return null

  const [pay] = await db
    .select({ grossAmountCents: payments.grossAmountCents, type: payments.type })
    .from(payments)
    .where(and(eq(payments.bookingId, bookingId), eq(payments.companyId, companyId), eq(payments.status, "paid")))
    .orderBy(desc(payments.createdAt))
    .limit(1)

  const paid = Boolean(pay)
  const paidCents = pay?.grossAmountCents ?? 0
  const type = (pay?.type as PaymentType | undefined) ?? null
  const remainingCents = type === "deposit" ? Math.max(0, booking.totalCents - paidCents) : 0

  return {
    paid,
    reference: booking.reference,
    date: typeof booking.date === "string" ? booking.date : String(booking.date),
    startTime: booking.startTime,
    totalCents: booking.totalCents,
    paidCents,
    type,
    remainingCents,
  }
}

/* -------------------------------------------------------------------------- */
/*  Création d'un checkout pour une réservation                               */
/* -------------------------------------------------------------------------- */

export type CreateCheckoutResult =
  | { ok: true; clientSecret: string; amountCents: number; type: PaymentType }
  | { ok: true; alreadyPaid: true }
  | { ok: false; error: string }

/**
 * Crée une session de paiement pour une réservation.
 * SÉCURITÉ : le montant est TOUJOURS relu depuis la réservation en base
 * (jamais fourni par le client), et le compte Stripe est celui du tenant.
 */
export async function createBookingCheckout(input: {
  bookingId: number
  companyId: number
  returnUrl: string
}): Promise<CreateCheckoutResult> {
  const { bookingId, companyId, returnUrl } = input

  const cfg = await getCompanyPaymentConfig(companyId)
  if (!cfg || !cfg.canCollect || !cfg.stripeAccountId) {
    return { ok: false, error: "Les paiements en ligne ne sont pas disponibles." }
  }

  // Réservation bornée au tenant (isolation stricte). Devise = celle du tenant.
  const [booking] = await db
    .select({
      id: bookings.id,
      reference: bookings.reference,
      totalCents: bookings.totalCents,
      depositCents: bookings.depositCents,
      currency: companies.currency,
    })
    .from(bookings)
    .innerJoin(companies, eq(companies.id, bookings.companyId))
    .where(and(eq(bookings.id, bookingId), eq(bookings.companyId, companyId)))
    .limit(1)
  if (!booking) return { ok: false, error: "Réservation introuvable." }
  const currency = booking.currency || "EUR"

  if (await bookingHasPaidPayment(bookingId, companyId)) return { ok: true, alreadyPaid: true }

  const type: PaymentType = cfg.paymentMode === "deposit" ? "deposit" : "full_payment"
  const amountCents = type === "deposit" ? booking.depositCents : booking.totalCents
  if (!amountCents || amountCents <= 0) {
    return { ok: false, error: "Montant à payer invalide." }
  }

  const provider = getPaymentProvider("stripe")
  if (!provider) return { ok: false, error: "Fournisseur de paiement indisponible." }

  const feeBps = cfg.platformFeeBps
  const feeAmountCents = computePlatformFeeCents(amountCents, feeBps)

  // Nettoie les tentatives non payées précédentes (aucun argent déplacé) pour
  // n'avoir qu'une seule ligne "pending" par réservation.
  await db
    .delete(payments)
    .where(and(eq(payments.bookingId, bookingId), eq(payments.companyId, companyId), eq(payments.status, "pending")))

  const created = await provider.createPayment({
    connectedAccountId: cfg.stripeAccountId,
    amountCents,
    currency,
    applicationFeeCents: feeAmountCents,
    description: `Réservation ${booking.reference}`,
    metadata: {
      bookingId: String(bookingId),
      companyId: String(companyId),
      type,
    },
    returnUrl,
  })

  await db.insert(payments).values({
    companyId,
    bookingId,
    provider: "stripe",
    externalPaymentId: created.externalId,
    type,
    status: "pending",
    currency,
    grossAmountCents: amountCents,
    platformFeeBps: feeBps,
    platformFeeAmountCents: feeAmountCents,
  })

  return { ok: true, clientSecret: created.clientSecret, amountCents, type }
}

/* -------------------------------------------------------------------------- */
/*  Traitement webhook — IDEMPOTENT                                           */
/* -------------------------------------------------------------------------- */

/**
 * Vrai si l'événement a DÉJÀ été traité avec succès (à ignorer).
 * Contrairement à un "claim" en amont, on n'enregistre l'événement qu'APRÈS
 * succès (voir `markEventProcessed`) : un retry Stripe consécutif à une erreur
 * de traitement pourra donc bien retraiter l'événement.
 */
export async function hasProcessedEvent(eventId: string): Promise<boolean> {
  const [row] = await db
    .select({ eventId: paymentEvents.eventId })
    .from(paymentEvents)
    .where(eq(paymentEvents.eventId, eventId))
    .limit(1)
  return Boolean(row)
}

/** Marque un événement comme définitivement traité (appelé après succès). */
export async function markEventProcessed(eventId: string, provider: string, type?: string): Promise<void> {
  await db
    .insert(paymentEvents)
    .values({ eventId, provider, type: type ?? null })
    .onConflictDoNothing({ target: paymentEvents.eventId })
}

/**
 * Synchronise les drapeaux d'état d'un compte connecté (account.updated).
 * Borné par `stripeAccountId` : l'appelant a vérifié que ce compte appartient
 * bien au tenant. Renvoie le nombre de lignes mises à jour (0 = compte inconnu).
 */
export async function syncConnectAccountFlagsByAccountId(input: {
  stripeAccountId: string
  chargesEnabled: boolean
  detailsSubmitted: boolean
  payoutsEnabled: boolean
}): Promise<number> {
  const res = await db
    .update(companies)
    .set({
      stripeChargesEnabled: input.chargesEnabled,
      stripeDetailsSubmitted: input.detailsSubmitted,
      stripePayoutsEnabled: input.payoutsEnabled,
      updatedAt: new Date(),
    })
    .where(eq(companies.stripeAccountId, input.stripeAccountId))
    .returning({ id: companies.id })
  return res.length
}

/**
 * Renvoie le `stripeAccountId` enregistré pour un tenant (ou null).
 * Sert à vérifier que `event.account` correspond bien au compte du tenant
 * mentionné dans les métadonnées (défense anti-usurpation de compte).
 */
export async function getStripeAccountIdForCompany(companyId: number): Promise<string | null> {
  const [row] = await db
    .select({ stripeAccountId: companies.stripeAccountId })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1)
  return row?.stripeAccountId ?? null
}

/**
 * Résultat de `settlePaymentPaid`.
 * - `justPaid` : true UNIQUEMENT lorsque CE traitement a fait passer le paiement
 *   de "pending" à "paid". C'est la clé d'idempotence des effets de bord (email)
 *   basée sur le vrai changement d'état — un webhook rejoué (ou un second
 *   événement pour une réservation déjà payée) renvoie `false` → aucun doublon.
 * - `amountCents` / `type` : montant encaissé et nature du paiement, exposés pour
 *   les notifications (jamais recalculés côté navigateur).
 */
export type SettlePaidResult = {
  justPaid: boolean
  amountCents: number | null
  type: PaymentType | null
}

/**
 * Marque un paiement encaissé et confirme la réservation associée.
 * Borné par companyId + bookingId (issus des métadonnées vérifiées).
 * Idempotent : ne repasse jamais un paiement déjà "paid" et le signale via
 * `justPaid=false`.
 */
export async function settlePaymentPaid(input: {
  externalId: string
  companyId: number
  bookingId: number
  paymentIntentId?: string | null
}): Promise<SettlePaidResult> {
  const { externalId, companyId, bookingId, paymentIntentId } = input
  return db.transaction(async (tx) => {
    const [pay] = await tx
      .select({
        id: payments.id,
        status: payments.status,
        grossAmountCents: payments.grossAmountCents,
        type: payments.type,
      })
      .from(payments)
      .where(
        and(
          eq(payments.provider, "stripe"),
          eq(payments.externalPaymentId, externalId),
          eq(payments.companyId, companyId),
          eq(payments.bookingId, bookingId),
        ),
      )
      .limit(1)
    if (!pay) return { justPaid: false, amountCents: null, type: null }
    // Déjà réglé (idempotence défensive) : aucun effet de bord à redéclencher.
    if (pay.status === "paid") {
      return { justPaid: false, amountCents: pay.grossAmountCents, type: pay.type as PaymentType }
    }

    await tx
      .update(payments)
      .set({
        status: "paid",
        paidAt: new Date(),
        meta: paymentIntentId ? { paymentIntentId } : undefined,
      })
      .where(eq(payments.id, pay.id))

    // La réservation passe à "confirmed" (réutilise le workflow de statuts).
    await tx
      .update(bookings)
      .set({ status: "confirmed" })
      .where(and(eq(bookings.id, bookingId), eq(bookings.companyId, companyId)))

    return { justPaid: true, amountCents: pay.grossAmountCents, type: pay.type as PaymentType }
  })
}

/** Marque une session expirée/abandonnée comme annulée (aucune réservation touchée). */
export async function settlePaymentCancelled(externalId: string): Promise<void> {
  await db
    .update(payments)
    .set({ status: "cancelled" })
    .where(and(eq(payments.provider, "stripe"), eq(payments.externalPaymentId, externalId), eq(payments.status, "pending")))
}
