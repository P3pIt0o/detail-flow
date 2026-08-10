"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { bookings } from "@/lib/db/schema"
import { requireCompanyMember } from "@/lib/admin"
import { sendStatusChangeEmail } from "@/lib/email/notifications"
import type { BookingStatus } from "@/lib/booking/status"

/** Transitions de statut autorisées depuis le dashboard. */
const ALLOWED: Record<BookingStatus, BookingStatus[]> = {
  pending_deposit: ["confirmed", "cancelled"],
  confirmed: ["completed", "cancelled"],
  completed: [],
  cancelled: ["pending_deposit"],
}

export type ActionResult = { ok: boolean; error?: string }

/** Change le statut d'une réservation en respectant les transitions permises. */
export async function updateBookingStatus(
  bookingId: number,
  next: BookingStatus,
): Promise<ActionResult> {
  const { tenant } = await requireCompanyMember()

  // Lecture scopée entreprise : une réservation d'un autre tenant est invisible.
  const rows = await db
    .select({ status: bookings.status })
    .from(bookings)
    .where(and(eq(bookings.id, bookingId), eq(bookings.companyId, tenant.id)))
    .limit(1)

  const current = rows[0]?.status as BookingStatus | undefined
  if (!current) return { ok: false, error: "Réservation introuvable." }

  if (!ALLOWED[current]?.includes(next)) {
    return { ok: false, error: `Transition ${current} → ${next} non autorisée.` }
  }

  await db
    .update(bookings)
    .set({ status: next, updatedAt: new Date() })
    .where(and(eq(bookings.id, bookingId), eq(bookings.companyId, tenant.id)))

  // Email au client pour les transitions qui le concernent (non bloquant).
  if (next === "confirmed" || next === "completed" || next === "cancelled") {
    await sendStatusChangeEmail(bookingId, next)
  }

  revalidatePath("/admin", "layout")
  return { ok: true }
}

/** Met à jour les notes internes d'une réservation. */
export async function updateBookingNotes(
  bookingId: number,
  notes: string,
): Promise<ActionResult> {
  const { tenant } = await requireCompanyMember()
  await db
    .update(bookings)
    .set({ notes: notes.trim() || null, updatedAt: new Date() })
    .where(and(eq(bookings.id, bookingId), eq(bookings.companyId, tenant.id)))
  revalidatePath("/admin", "layout")
  return { ok: true }
}
