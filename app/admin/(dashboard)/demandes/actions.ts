"use server"

import { revalidatePath } from "next/cache"
import { and, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { bookings, bookingItems, customRequests } from "@/lib/db/schema"
import { requireCompanyMember } from "@/lib/admin"
import { sendCustomRequestProposal } from "@/lib/email/custom-requests"

export type ActionResult = { ok: boolean; error?: string; bookingId?: number }

/** Référence lisible "DF-20260115-4821" (même format que les réservations). */
function generateReference(dateStr: string): string {
  const compact = dateStr.replace(/-/g, "")
  const rand = Math.floor(1000 + Math.random() * 9000)
  return `DF-${compact}-${rand}`
}

function minutesToTime(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

function parsePriceToCents(v: FormDataEntryValue | null): number {
  if (typeof v !== "string") return NaN
  const n = Number.parseFloat(v.replace(",", ".").trim())
  if (!Number.isFinite(n) || n < 0) return NaN
  return Math.round(n * 100)
}

function parseIntSafe(v: FormDataEntryValue | null): number {
  if (typeof v !== "string") return NaN
  const n = Number.parseInt(v.trim(), 10)
  return Number.isFinite(n) ? n : NaN
}

/**
 * Enregistre + envoie une proposition au client.
 * Isolation : la demande est mise à jour avec un filtre companyId (aucune autre
 * entreprise ne peut être touchée).
 */
export async function sendProposalAction(formData: FormData): Promise<ActionResult> {
  const { tenant } = await requireCompanyMember()
  const id = parseIntSafe(formData.get("id"))
  if (!Number.isFinite(id)) return { ok: false, error: "Demande introuvable." }

  const title = (formData.get("proposalTitle") as string)?.trim() ?? ""
  const description = (formData.get("proposalDescription") as string)?.trim() ?? ""
  const message = (formData.get("proposalMessage") as string)?.trim() ?? ""
  const priceCents = parsePriceToCents(formData.get("proposalPrice"))
  const durationMin = parseIntSafe(formData.get("proposalDuration"))

  if (!title) return { ok: false, error: "Le titre de la proposition est requis." }
  if (!Number.isFinite(priceCents)) return { ok: false, error: "Prix invalide." }
  const duration = Number.isFinite(durationMin) ? Math.max(0, durationMin) : 0

  // Charge la demande (scopée entreprise).
  const [reqRow] = await db
    .select()
    .from(customRequests)
    .where(and(eq(customRequests.id, id), eq(customRequests.companyId, tenant.id)))
    .limit(1)
  if (!reqRow) return { ok: false, error: "Demande introuvable." }
  if (reqRow.status === "converted") return { ok: false, error: "Cette demande a déjà été convertie." }

  await db
    .update(customRequests)
    .set({
      proposalTitle: title,
      proposalDescription: description || null,
      proposalPriceCents: priceCents,
      proposalDurationMin: duration,
      proposalMessage: message || null,
      status: "proposal_sent",
      proposalSentAt: new Date(),
      // Réinitialise une éventuelle décision précédente si le pro renvoie une offre.
      respondedAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(customRequests.id, id), eq(customRequests.companyId, tenant.id)))

  await sendCustomRequestProposal({
    companyId: tenant.id,
    token: reqRow.token,
    customerEmail: reqRow.customerEmail,
    customerName: reqRow.customerName,
    proposalTitle: title,
    proposalDescription: description || null,
    proposalPriceCents: priceCents,
    proposalDurationMin: duration,
    proposalMessage: message || null,
  })

  revalidatePath(`/admin/demandes/${id}`)
  revalidatePath("/admin/demandes")
  return { ok: true }
}

/**
 * Convertit une demande ACCEPTÉE en VRAIE réservation DetailFlow.
 *
 * - Réutilise les tables existantes bookings/booking_items (aucun 2e modèle).
 * - Prestation ponctuelle : serviceId null, libellé/prix/durée figés depuis la
 *   proposition acceptée.
 * - Anti-doublon : transaction + verrou par demande ; si bookingId existe déjà,
 *   renvoie la réservation existante sans en créer une seconde.
 * - Isolation stricte par companyId.
 */
export async function convertToBookingAction(formData: FormData): Promise<ActionResult> {
  const { tenant } = await requireCompanyMember()
  const id = parseIntSafe(formData.get("id"))
  if (!Number.isFinite(id)) return { ok: false, error: "Demande introuvable." }

  const date = (formData.get("date") as string)?.trim() ?? ""
  const startTime = (formData.get("startTime") as string)?.trim() ?? ""
  const address = (formData.get("address") as string)?.trim() ?? ""

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Date invalide." }
  if (!/^\d{2}:\d{2}$/.test(startTime)) return { ok: false, error: "Heure invalide." }

  try {
    const result = await db.transaction(async (tx) => {
      // Verrou logique sur la demande pour sérialiser les conversions concurrentes.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${tenant.id}, ${id})`)

      const [reqRow] = await tx
        .select()
        .from(customRequests)
        .where(and(eq(customRequests.id, id), eq(customRequests.companyId, tenant.id)))
        .limit(1)
      if (!reqRow) return { error: "Demande introuvable." as const }

      // Déjà convertie : ne pas recréer, renvoyer l'existante.
      if (reqRow.status === "converted" && reqRow.bookingId) {
        return { bookingId: reqRow.bookingId }
      }
      if (reqRow.status !== "accepted") {
        return { error: "La demande doit être acceptée par le client avant conversion." as const }
      }

      const priceCents = reqRow.proposalPriceCents ?? 0
      const durationMin = reqRow.proposalDurationMin ?? 0
      const serviceName = reqRow.proposalTitle?.trim() || reqRow.typeLabel
      const vehicleTypeName =
        [reqRow.vehicleType, reqRow.vehicleBrand, reqRow.vehicleModel].filter(Boolean).join(" ") ||
        reqRow.fleetCompanyName ||
        "Prestation sur mesure"

      const [start] = startTime.split(":").map((x) => Number.parseInt(x, 10))
      const startMin = start * 60 + Number.parseInt(startTime.split(":")[1], 10)
      const endTime = minutesToTime(startMin + durationMin)

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

      const [inserted] = await tx
        .insert(bookings)
        .values({
          companyId: tenant.id,
          reference,
          customerName: reqRow.customerName,
          customerEmail: reqRow.customerEmail,
          customerPhone: reqRow.customerPhone,
          address: address || "Adresse à confirmer",
          servicesCents: priceCents,
          subtotalCents: priceCents,
          totalCents: priceCents,
          date,
          startTime,
          endTime,
          totalDurationMin: durationMin,
          status: "confirmed",
          notes: `Demande personnalisée « ${reqRow.typeLabel} ».\n${reqRow.description}`,
        })
        .returning({ id: bookings.id })

      await tx.insert(bookingItems).values({
        bookingId: inserted.id,
        serviceId: null,
        serviceName,
        vehicleTypeId: null,
        vehicleTypeName,
        vehicleBrand: reqRow.vehicleBrand ?? null,
        vehicleModel: reqRow.vehicleModel ?? null,
        priceCents,
        durationMin,
      })

      await tx
        .update(customRequests)
        .set({ status: "converted", bookingId: inserted.id, updatedAt: new Date() })
        .where(and(eq(customRequests.id, id), eq(customRequests.companyId, tenant.id)))

      return { bookingId: inserted.id }
    })

    if ("error" in result) return { ok: false, error: result.error }

    revalidatePath(`/admin/demandes/${id}`)
    revalidatePath("/admin/demandes")
    revalidatePath("/admin/reservations")
    revalidatePath("/admin/calendrier")
    return { ok: true, bookingId: result.bookingId }
  } catch (e) {
    console.log("[v0] convertToBooking error:", e instanceof Error ? e.message : e)
    return { ok: false, error: "Une erreur est survenue lors de la conversion." }
  }
}
