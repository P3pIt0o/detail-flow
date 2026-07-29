import "server-only"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { bookings, bookingItems, settings as settingsTable } from "@/lib/db/schema"
import { sendEmail } from "./send"
import {
  clientConfirmationEmail,
  proNotificationEmail,
  statusConfirmedEmail,
  statusCompletedEmail,
  statusCancelledEmail,
  reminderEmail,
  type BookingEmailData,
} from "./templates"

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
    businessName: s?.businessName?.trim() || "Votre professionnel",
    businessEmail: s?.businessEmail ?? null,
    businessPhone: s?.businessPhone ?? null,
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
