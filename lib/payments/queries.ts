import "server-only"
import { db } from "@/lib/db"
import { payments, paymentEvents, companies, bookings } from "@/lib/db/schema"
import { and, desc, eq, sql } from "drizzle-orm"
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

  // Réservation bornée au tenant (isolation stricte).
  const [booking] = await db
    .select({
      id: bookings.id,
      reference: bookings.reference,
      totalCents: bookings.totalCents,
      depositCents: bookings.depositCents,
      currency: sql<string>`'EUR'`,
    })
    .from(bookings)
    .where(and(eq(bookings.id, bookingId), eq(bookings.companyId, companyId)))
    .limit(1)
  if (!booking) return { ok: false, error: "Réservation introuvable." }

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
    currency: booking.currency,
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
    currency: booking.currency,
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
 * Enregistre un événement provider et indique s'il faut le traiter.
 * Renvoie `true` si l'événement est nouveau (à traiter), `false` s'il a déjà
 * été traité (appel répété → ignoré : pas de double paiement/commission).
 */
export async function claimEvent(eventId: string, provider: string, type?: string): Promise<boolean> {
  const res = await db
    .insert(paymentEvents)
    .values({ eventId, provider, type: type ?? null })
    .onConflictDoNothing({ target: paymentEvents.eventId })
    .returning({ eventId: paymentEvents.eventId })
  return res.length > 0
}

/**
 * Marque un paiement encaissé et confirme la réservation associée.
 * Borné par companyId + bookingId (issus des métadonnées vérifiées).
 */
export async function settlePaymentPaid(input: {
  externalId: string
  companyId: number
  bookingId: number
  paymentIntentId?: string | null
}): Promise<void> {
  const { externalId, companyId, bookingId, paymentIntentId } = input
  await db.transaction(async (tx) => {
    const [pay] = await tx
      .select({ id: payments.id, status: payments.status })
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
    if (!pay) return
    if (pay.status === "paid") return // déjà réglé (idempotence défensive)

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
  })
}

/** Marque une session expirée/abandonnée comme annulée (aucune réservation touchée). */
export async function settlePaymentCancelled(externalId: string): Promise<void> {
  await db
    .update(payments)
    .set({ status: "cancelled" })
    .where(and(eq(payments.provider, "stripe"), eq(payments.externalPaymentId, externalId), eq(payments.status, "pending")))
}
