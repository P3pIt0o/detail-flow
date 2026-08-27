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
  paymentReceivedClientEmail,
  paymentReceivedProEmail,
  type BookingEmailData,
} from "./templates"

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
 * Emails envoyés APRÈS un paiement encaissé (déclenchés UNIQUEMENT depuis le
 * webhook Stripe signé, jamais depuis la page de retour navigateur) :
 *  - confirmation de paiement au client (montant, acompte/intégral, solde) ;
 *  - notification d'encaissement au professionnel (si un email pro existe).
 *
 * Idempotence : l'appelant (webhook) ne déclenche cette fonction que lorsque le
 * paiement vient réellement de passer à "paid" (`justPaid`). Un webhook rejoué
 * n'appelle donc jamais cette fonction → aucun email en double.
 *
 * NON BLOQUANT : ne lève jamais. Un échec d'envoi est journalisé mais n'annule
 * jamais le paiement (déjà persisté avant l'appel).
 */
export async function sendPaymentReceivedEmails(
  bookingId: number,
  payment: { amountCents: number; type: "deposit" | "full_payment" },
): Promise<void> {
  try {
    const loaded = await loadBookingEmailData(bookingId)
    if (!loaded) {
      logPayEmail("error", "booking_not_found", { bookingId })
      return
    }
    const { data, customerEmail, proEmail } = loaded

    const isDeposit = payment.type === "deposit"
    const remainingCents = isDeposit ? Math.max(0, data.totalCents - payment.amountCents) : 0

    // --- Client ---
    if (isValidEmail(customerEmail)) {
      const mail = paymentReceivedClientEmail(data, {
        amountCents: payment.amountCents,
        isDeposit,
        remainingCents,
      })
      const res = await sendEmail({
        to: customerEmail,
        subject: mail.subject,
        html: mail.html,
        fromName: data.businessName,
        replyTo: proEmail ?? undefined,
      })
      logPayEmail(res.ok ? "info" : "error", res.ok ? "client_sent" : res.skipped ? "client_skipped" : "client_failed", {
        bookingId,
        recipient: "client",
        message: res.ok ? undefined : res.error,
      })
    } else {
      // Adresse absente/invalide : on ne marque jamais "envoyé", on journalise.
      logPayEmail("error", "client_email_invalid", { bookingId, recipient: "client" })
    }

    // --- Professionnel ---
    if (isValidEmail(proEmail)) {
      const mail = paymentReceivedProEmail(data, { amountCents: payment.amountCents, isDeposit })
      const res = await sendEmail({
        to: proEmail,
        subject: mail.subject,
        html: mail.html,
        fromName: data.businessName,
        replyTo: customerEmail,
      })
      logPayEmail(res.ok ? "info" : "error", res.ok ? "pro_sent" : res.skipped ? "pro_skipped" : "pro_failed", {
        bookingId,
        recipient: "pro",
        message: res.ok ? undefined : res.error,
      })
    }
  } catch (e) {
    logPayEmail("error", "unexpected", { bookingId, message: e instanceof Error ? e.message : "unknown" })
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
