import "server-only"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { bookings, bookingItems, companies, settings as settingsTable } from "@/lib/db/schema"
import { sendEmail } from "./send"
import { tenantPathUrl } from "@/lib/tenant-shared"
import {
  clientConfirmationEmail,
  proNotificationEmail,
  proCancellationEmail,
  statusConfirmedEmail,
  statusCompletedEmail,
  statusCancelledEmail,
  bookingUpdatedEmail,
  reminderEmail,
  proReminderEmail,
  reviewRequestEmail,
  paymentReceivedClientEmail,
  paymentReceivedProEmail,
  refundConfirmationClientEmail,
  type BookingEmailData,
} from "./templates"
import { claimPaymentEmail, markPaymentEmail, type PaymentEmailRecipient } from "@/lib/payments/queries"
import { claimRefundEmail, markRefundEmail } from "@/lib/payments/refunds"

/** Validation minimale d'une adresse email (avant tout appel au fournisseur). */
function isValidEmail(value: string | null | undefined): value is string {
  return typeof value === "string" && /\S+@\S+\.\S+/.test(value.trim())
}

/**
 * Journal structuré NON SENSIBLE des notifications de paiement. Sert d'historique
 * minimal (envoyé / échoué / ignoré / déjà traité) sans table dédiée. On ne
 * journalise JAMAIS d'adresse email, de nom client, de téléphone ni de contenu :
 * uniquement le rôle du destinataire, l'étape et un message technique borné.
 */
function logPayEmail(
  level: "info" | "error",
  step: string,
  data: { bookingId: number; recipient?: "client" | "pro"; message?: string },
) {
  const payload = {
    scope: "payments/email",
    step,
    bookingId: data.bookingId,
    ...(data.recipient ? { recipient: data.recipient } : {}),
    ...(data.message ? { message: data.message } : {}),
  }
  if (level === "error") console.error("[payments-email]", JSON.stringify(payload))
  else console.log("[payments-email]", JSON.stringify(payload))
}

/** Charge une réservation + ses lignes + les réglages, prêts pour un email. */
async function loadBookingEmailData(
  bookingId: number,
): Promise<{ data: BookingEmailData; customerEmail: string; proEmail: string | null } | null> {
  const rows = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1)
  const booking = rows[0]
  if (!booking) return null

  const items = await db
    .select()
    .from(bookingItems)
    .where(eq(bookingItems.bookingId, bookingId))

  // Réglages de l'ENTREPRISE de la réservation (pas de singleton) : garantit
  // que l'email porte bien l'identité du bon tenant.
  const settingsRows = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.companyId, booking.companyId))
    .limit(1)
  const s = settingsRows[0]

  // Nom de l'entreprise du tenant : priorité au nom commercial des réglages,
  // sinon au nom légal de la société (point 19 — jamais un nom générique si
  // une identité tenant existe).
  const companyRows = await db
    .select({ name: companies.name, slug: companies.slug })
    .from(companies)
    .where(eq(companies.id, booking.companyId))
    .limit(1)
  const businessName =
    s?.businessName?.trim() || companyRows[0]?.name?.trim() || "Votre professionnel"

  // Liens transactionnels ABSOLUS, rattachés au tenant de la réservation
  // (jamais un autre). Le lien de gestion n'existe que si un jeton est présent
  // (réservations historiques sans jeton = pas de bouton).
  const slug = companyRows[0]?.slug ?? null
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN
  const manageUrl =
    slug && booking.manageToken
      ? tenantPathUrl(`/reservation/gerer/${booking.manageToken}`, slug, rootDomain)
      : null
  const newBookingUrl = slug ? tenantPathUrl("/reservation", slug, rootDomain) : null

  const data: BookingEmailData = {
    reference: booking.reference,
    customerName: booking.customerName,
    customerPhone: booking.customerPhone,
    date: typeof booking.date === "string" ? booking.date : String(booking.date),
    startTime: booking.startTime,
    endTime: booking.endTime,
    totalDurationMin: booking.totalDurationMin,
    address: booking.address,
    items: items.map((it) => ({
      serviceName: it.serviceName,
      vehicleTypeName: it.vehicleTypeName,
      priceCents: it.priceCents,
    })),
    servicesCents: booking.servicesCents,
    optionsCents: booking.optionsCents,
    travelFeeCents: booking.travelFeeCents,
    totalCents: booking.totalCents,
    depositCents: booking.depositCents,
    depositMethods: s?.depositMethods ?? null,
    depositInstructions: s?.depositInstructions ?? null,
    businessName,
    businessEmail: s?.businessEmail ?? null,
    businessPhone: s?.businessPhone ?? null,
    manageUrl,
    newBookingUrl,
  }

  return { data, customerEmail: booking.customerEmail, proEmail: s?.businessEmail ?? null }
}

/**
 * Emails envoyés à la création d'une réservation :
 *  - confirmation au client
 *  - notification au professionnel (si un email pro est configuré)
 * N'échoue jamais (les erreurs sont loguées mais n'interrompent pas la résa).
 */
export async function sendBookingCreatedEmails(bookingId: number): Promise<void> {
  try {
    const loaded = await loadBookingEmailData(bookingId)
    if (!loaded) return
    const { data, customerEmail, proEmail } = loaded

    const clientMail = clientConfirmationEmail(data)
    await sendEmail({
      to: customerEmail,
      subject: clientMail.subject,
      html: clientMail.html,
      fromName: data.businessName,
      replyTo: proEmail ?? undefined,
    })

    if (proEmail) {
      const proMail = proNotificationEmail(data)
      await sendEmail({
        to: proEmail,
        subject: proMail.subject,
        html: proMail.html,
        fromName: data.businessName,
        replyTo: customerEmail,
      })
    }
  } catch (e) {
    console.log("[v0] sendBookingCreatedEmails a échoué:", e instanceof Error ? e.message : e)
  }
}

/**
 * Envoi (ou reprise) d'UN email de paiement pour UN destinataire, avec
 * idempotence DURABLE persistée dans `payments.meta.emails.<recipient>` :
 *
 *  1. `claimPaymentEmail` pose atomiquement l'état "sending" seulement si l'état
 *     est réclamable (absent ou "failed"). Deux webhooks concurrents ne peuvent
 *     pas réclamer le même destinataire → jamais de doublon. "sent"/"invalid"
 *     ne sont jamais re-réclamés.
 *  2. On envoie via le service existant.
 *  3. `markPaymentEmail` fige l'état final :
 *       - "sent"   si le fournisseur accepte ;
 *       - "invalid" si l'adresse est absente/invalide (jamais "sent") ;
 *       - "failed" si le fournisseur refuse → réessayable à un prochain rejeu.
 *
 * NON BLOQUANT : ne lève jamais. Un échec n'annule jamais le paiement.
 * Les états CLIENT et PRO sont indépendants (deux clés distinctes).
 */
async function dispatchPaymentEmail(
  bookingId: number,
  companyId: number,
  recipient: PaymentEmailRecipient,
): Promise<void> {
  // Réservation d'un doublon impossible : claim atomique en amont de tout envoi.
  const claim = await claimPaymentEmail({ bookingId, companyId, recipient })
  if (!claim.claimed || claim.paymentId == null) {
    // Déjà envoyé / déjà en cours / invalide, ou aucun paiement "paid" : on
    // n'envoie rien (comportement idempotent attendu lors d'un rejeu).
    logPayEmail("info", "email_skipped", { bookingId, recipient })
    return
  }
  const paymentId = claim.paymentId
  try {
    const loaded = await loadBookingEmailData(bookingId)
    if (!loaded) {
      // Impossible d'envoyer : on libère l'état en "failed" pour permettre une
      // reprise ultérieure (ne reste jamais bloqué en "sending").
      await markPaymentEmail({ paymentId, recipient, state: "failed" })
      logPayEmail("error", "booking_not_found", { bookingId, recipient })
      return
    }
    const { data, customerEmail, proEmail } = loaded
    const address = recipient === "client" ? customerEmail : proEmail

    if (!isValidEmail(address)) {
      // Adresse absente/invalide : état terminal "invalid" (jamais "sent").
      await markPaymentEmail({ paymentId, recipient, state: "invalid" })
      logPayEmail("error", "email_invalid", { bookingId, recipient })
      return
    }

    const isDeposit = claim.type === "deposit"
    const amountCents = claim.amountCents ?? 0
    const remainingCents = isDeposit ? Math.max(0, data.totalCents - amountCents) : 0

    const mail =
      recipient === "client"
        ? paymentReceivedClientEmail(data, { amountCents, isDeposit, remainingCents })
        : paymentReceivedProEmail(data, { amountCents, isDeposit })

    const res = await sendEmail({
      to: address,
      subject: mail.subject,
      html: mail.html,
      fromName: data.businessName,
      replyTo: recipient === "client" ? proEmail ?? undefined : customerEmail,
    })

    // On ne marque "sent" QUE si le fournisseur a accepté. skip (clé Resend
    // absente) et erreur → "failed" pour permettre un renvoi ultérieur.
    await markPaymentEmail({ paymentId, recipient, state: res.ok ? "sent" : "failed" })
    logPayEmail(res.ok ? "info" : "error", res.ok ? "email_sent" : "email_failed", {
      bookingId,
      recipient,
      message: res.ok ? undefined : res.error,
    })
  } catch (e) {
    // Exception inattendue : on repasse l'état en "failed" (réessayable) sans
    // jamais propager l'erreur au webhook.
    await markPaymentEmail({ paymentId, recipient, state: "failed" }).catch(() => {})
    logPayEmail("error", "email_unexpected", {
      bookingId,
      recipient,
      message: e instanceof Error ? e.message : "unknown",
    })
  }
}

/**
 * Emails envoyés APRÈS un paiement encaissé — déclenchés UNIQUEMENT depuis le
 * webhook Stripe signé (jamais depuis la page de retour navigateur) :
 *  - confirmation de paiement au client ;
 *  - notification d'encaissement au professionnel.
 *
 * L'idempotence NE dépend plus de `justPaid` (fragile : un échec Resend suivi
 * d'un rejeu ne serait jamais retenté). Elle repose désormais sur un état
 * DURABLE par destinataire dans `payments.meta`. Conséquences :
 *  - un email "sent" n'est jamais renvoyé ;
 *  - un email "failed" est retenté au prochain rejeu Stripe (reprise sur erreur) ;
 *  - deux webhooks concurrents ne créent pas de doublon (claim atomique) ;
 *  - un échec d'email n'annule jamais le paiement.
 *
 * `payment` est conservé pour compat d'appel mais les montants/type font foi
 * depuis la base (via le claim), jamais depuis l'appelant.
 */
export async function sendPaymentReceivedEmails(
  bookingId: number,
  companyId: number,
): Promise<void> {
  await dispatchPaymentEmail(bookingId, companyId, "client")
  await dispatchPaymentEmail(bookingId, companyId, "pro")
}

/**
 * Email CLIENT de confirmation d'un remboursement — déclenché UNIQUEMENT depuis
 * le webhook Stripe signé (jamais au simple clic). Idempotence DURABLE via
 * `refunds.meta.emailClient` (claim atomique) : un seul email par remboursement,
 * même en cas de rejeu ou d'événements concurrents. NON BLOQUANT : un échec
 * d'email n'annule jamais le remboursement.
 */
export async function sendRefundConfirmationEmail(refundId: number, companyId: number): Promise<void> {
  const claim = await claimRefundEmail(refundId, companyId)
  if (!claim) {
    // Déjà envoyé / en cours / non "succeeded" : rien à faire (idempotent).
    return
  }
  try {
    const loaded = await loadBookingEmailData(claim.bookingId)
    if (!loaded) {
      await markRefundEmail(refundId, "failed")
      return
    }
    const { data, customerEmail, proEmail } = loaded
    if (!isValidEmail(customerEmail)) {
      await markRefundEmail(refundId, "invalid")
      return
    }
    const remainingPaidCents = Math.max(0, claim.grossAmountCents - claim.amountCents)
    const mail = refundConfirmationClientEmail(data, {
      amountCents: claim.amountCents,
      fullyRefunded: claim.fullyRefunded,
      remainingPaidCents,
    })
    const res = await sendEmail({
      to: customerEmail,
      subject: mail.subject,
      html: mail.html,
      fromName: data.businessName,
      replyTo: proEmail ?? undefined,
    })
    await markRefundEmail(refundId, res.ok ? "sent" : "failed")
  } catch (e) {
    await markRefundEmail(refundId, "failed").catch(() => {})
    console.log("[v0] sendRefundConfirmationEmail a échoué:", e instanceof Error ? e.message : e)
  }
}

/** Email envoyé au client lors d'un changement de statut par l'admin. */
export async function sendStatusChangeEmail(
  bookingId: number,
  status: "confirmed" | "completed" | "cancelled",
): Promise<void> {
  try {
    const loaded = await loadBookingEmailData(bookingId)
    if (!loaded) return
    const { data, customerEmail, proEmail } = loaded

    const mail =
      status === "confirmed"
        ? statusConfirmedEmail(data)
        : status === "completed"
          ? statusCompletedEmail(data)
          : statusCancelledEmail(data)

    await sendEmail({
      to: customerEmail,
      subject: mail.subject,
      html: mail.html,
      fromName: data.businessName,
      replyTo: proEmail ?? undefined,
    })
  } catch (e) {
    console.log("[v0] sendStatusChangeEmail a échoué:", e instanceof Error ? e.message : e)
  }
}

/**
 * Emails envoyés après une annulation par LE CLIENT lui-même (page publique
 * de gestion) : confirmation au client (avec lien de nouvelle réservation) +
 * notification au professionnel. Non bloquant : un échec d'email n'annule
 * jamais l'annulation (déjà persistée en base avant l'appel).
 */
export async function sendCustomerCancellationEmails(bookingId: number): Promise<void> {
  try {
    const loaded = await loadBookingEmailData(bookingId)
    if (!loaded) return
    const { data, customerEmail, proEmail } = loaded

    const clientMail = statusCancelledEmail(data)
    await sendEmail({
      to: customerEmail,
      subject: clientMail.subject,
      html: clientMail.html,
      fromName: data.businessName,
      replyTo: proEmail ?? undefined,
    })

    if (proEmail) {
      const proMail = proCancellationEmail(data)
      await sendEmail({
        to: proEmail,
        subject: proMail.subject,
        html: proMail.html,
        fromName: data.businessName,
        replyTo: customerEmail,
      })
    }
  } catch (e) {
    console.log("[v0] sendCustomerCancellationEmails a échoué:", e instanceof Error ? e.message : e)
  }
}

/**
 * Email envoyé au client lorsqu'un admin modifie un RDV (date/heure/prestation/
 * adresse). Non bloquant : un échec d'email n'annule jamais la modification.
 */
export async function sendBookingUpdatedEmail(bookingId: number): Promise<void> {
  try {
    const loaded = await loadBookingEmailData(bookingId)
    if (!loaded) return
    const { data, customerEmail, proEmail } = loaded

    const mail = bookingUpdatedEmail(data)
    await sendEmail({
      to: customerEmail,
      subject: mail.subject,
      html: mail.html,
      fromName: data.businessName,
      replyTo: proEmail ?? undefined,
    })
  } catch (e) {
    console.log("[v0] sendBookingUpdatedEmail a échoué:", e instanceof Error ? e.message : e)
  }
}

/* ----------------------------- LOT D — envois ----------------------------- */

/**
 * Garde d'ENVOI RÉEL des notifications LOT D (rappel pro + demande d'avis).
 *
 * Par défaut DÉSACTIVÉ : aucun email réel n'est émis (ni pro, ni client). Le
 * fournisseur est alors SIMULÉ (journalisé, jamais appelé). L'envoi réel n'est
 * possible qu'en positionnant explicitement `NOTIFICATIONS_ENABLED=true` en
 * production — hors périmètre de ce lot (non activé). Cela garantit qu'en
 * Preview et tant que l'activation n'est pas décidée, rien n'est envoyé.
 */
export function notificationsRealSendEnabled(): boolean {
  return process.env.NOTIFICATIONS_ENABLED === "true"
}

export type NotificationOutcome = {
  state: "sent" | "simulated" | "failed" | "invalid"
  providerMessageId?: string
  reason?: string
}

/**
 * Envoie (ou simule) le RAPPEL AU PROFESSIONNEL pour une réservation.
 * Destinataire = email pro du tenant. Ne lève jamais.
 */
export async function sendProReminderEmail(bookingId: number): Promise<NotificationOutcome> {
  try {
    const loaded = await loadBookingEmailData(bookingId)
    if (!loaded) return { state: "failed", reason: "booking_not_found" }
    const { data, customerEmail, proEmail } = loaded
    void customerEmail
    if (!isValidEmail(proEmail)) return { state: "invalid", reason: "no_pro_email" }

    const mail = proReminderEmail(data)
    if (!notificationsRealSendEnabled()) {
      console.log("[notifications] pro_reminder SIMULÉ (envoi réel désactivé) booking", bookingId)
      return { state: "simulated", providerMessageId: `simulated:${Date.now()}` }
    }
    const res = await sendEmail({
      to: proEmail,
      subject: mail.subject,
      html: mail.html,
      fromName: data.businessName,
      replyTo: customerEmail,
    })
    return res.ok
      ? { state: "sent", providerMessageId: res.id }
      : { state: "failed", reason: res.error }
  } catch (e) {
    console.log("[v0] sendProReminderEmail a échoué:", e instanceof Error ? e.message : e)
    return { state: "failed", reason: "exception" }
  }
}

/**
 * Envoie (ou simule) la DEMANDE D'AVIS AU CLIENT pour une réservation réalisée.
 * `reviewUrl` est résolu/validé côté serveur par l'appelant (jamais fabriqué
 * ici). `optOutUrl` porte le lien de désinscription signé. Ne lève jamais.
 */
export async function sendReviewRequestEmail(
  bookingId: number,
  opts: { reviewUrl: string; optOutUrl?: string | null },
): Promise<NotificationOutcome> {
  try {
    if (!opts.reviewUrl) return { state: "invalid", reason: "no_review_link" }
    const loaded = await loadBookingEmailData(bookingId)
    if (!loaded) return { state: "failed", reason: "booking_not_found" }
    const { data, customerEmail, proEmail } = loaded
    if (!isValidEmail(customerEmail)) return { state: "invalid", reason: "no_customer_email" }

    const mail = reviewRequestEmail(data, opts)
    if (!notificationsRealSendEnabled()) {
      console.log("[notifications] review_request SIMULÉ (envoi réel désactivé) booking", bookingId)
      return { state: "simulated", providerMessageId: `simulated:${Date.now()}` }
    }
    const res = await sendEmail({
      to: customerEmail,
      subject: mail.subject,
      html: mail.html,
      fromName: data.businessName,
      replyTo: proEmail ?? undefined,
    })
    return res.ok
      ? { state: "sent", providerMessageId: res.id }
      : { state: "failed", reason: res.error }
  } catch (e) {
    console.log("[v0] sendReviewRequestEmail a échoué:", e instanceof Error ? e.message : e)
    return { state: "failed", reason: "exception" }
  }
}

/** Email de rappel (envoyé par la tâche planifiée la veille du RDV). */
export async function sendReminderEmail(bookingId: number): Promise<boolean> {
  try {
    const loaded = await loadBookingEmailData(bookingId)
    if (!loaded) return false
    const { data, customerEmail, proEmail } = loaded

    const mail = reminderEmail(data)
    const res = await sendEmail({
      to: customerEmail,
      subject: mail.subject,
      html: mail.html,
      fromName: data.businessName,
      replyTo: proEmail ?? undefined,
    })
    return res.ok
  } catch (e) {
    console.log("[v0] sendReminderEmail a échoué:", e instanceof Error ? e.message : e)
    return false
  }
}
