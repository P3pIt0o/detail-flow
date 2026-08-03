"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { settings, businessHours, timeOff } from "@/lib/db/schema"
import { requireCompanyMember } from "@/lib/admin"
import { geocodeAddress } from "@/lib/booking/travel"
import { DEPOSIT_METHODS, type DepositMethod } from "@/lib/booking/types"

export type ActionResult = { ok: boolean; error?: string }

function revalidate() {
  revalidatePath("/admin/parametres")
  revalidatePath("/reservation")
  revalidatePath("/contact")
  revalidatePath("/")
}

/**
 * Assure l'existence de la ligne settings de l'entreprise courante.
 * Chaque entreprise possède exactement une ligne (contrainte UNIQUE companyId).
 */
async function ensureSettingsRow(companyId: number) {
  const rows = await db
    .select({ id: settings.id })
    .from(settings)
    .where(eq(settings.companyId, companyId))
    .limit(1)
  if (!rows.length) await db.insert(settings).values({ companyId })
}

/* ---------------------------- Facturation ---------------------------- */

export async function saveInvoicingSettings(input: {
  invoiceCompanyAddress: string
  invoiceSiret: string
  invoiceIban: string
  invoiceBic: string
  vatEnabled: boolean
  vatRate: string
  vatExemptNote: string
  invoicePrefix: string
  invoiceDueDays: number
  invoiceFooterNote: string
  invoiceLegalMentions: string
  invoiceEmailSubject: string
  invoiceEmailBody: string
  invoiceLogoPathname: string | null
}): Promise<ActionResult> {
  const { tenant } = await requireCompanyMember()
  await ensureSettingsRow(tenant.id)

  const rate = Number.parseFloat(input.vatRate.replace(",", "."))
  if (input.vatEnabled && (!Number.isFinite(rate) || rate < 0 || rate > 100)) {
    return { ok: false, error: "Taux de TVA invalide (0 à 100)." }
  }
  const dueDays = Math.max(0, Math.round(input.invoiceDueDays || 0))

  await db
    .update(settings)
    .set({
      invoiceCompanyAddress: input.invoiceCompanyAddress.trim() || null,
      invoiceSiret: input.invoiceSiret.trim() || null,
      invoiceIban: input.invoiceIban.replace(/\s+/g, "").trim() || null,
      invoiceBic: input.invoiceBic.trim() || null,
      vatEnabled: input.vatEnabled,
      vatRate: input.vatEnabled ? String(rate) : "0",
      vatExemptNote: input.vatExemptNote.trim() || null,
      invoicePrefix: input.invoicePrefix.trim().toUpperCase() || "FAC",
      invoiceDueDays: dueDays,
      invoiceFooterNote: input.invoiceFooterNote.trim() || null,
      invoiceLegalMentions: input.invoiceLegalMentions.trim() || null,
      invoiceEmailSubject: input.invoiceEmailSubject.trim() || null,
      invoiceEmailBody: input.invoiceEmailBody.trim() || null,
      invoiceLogoPathname: input.invoiceLogoPathname || null,
      updatedAt: new Date(),
    })
    .where(eq(settings.companyId, tenant.id))

  revalidate()
  return { ok: true }
}

/* --------------------- Coordonnées de l'entreprise --------------------- */

export async function saveBusinessContact(input: {
  businessName: string
  businessEmail: string
  businessPhone: string
}): Promise<ActionResult> {
  const { tenant } = await requireCompanyMember()
  await ensureSettingsRow(tenant.id)

  const email = input.businessEmail.trim()
  // Validation email simple : requis pour l'expéditeur / les notifications.
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Adresse email invalide." }
  }

  await db
    .update(settings)
    .set({
      businessName: input.businessName.trim() || null,
      businessEmail: email || null,
      businessPhone: input.businessPhone.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(settings.companyId, tenant.id))

  revalidate()
  return { ok: true }
}

/* ----------------------- Coordonnées & déplacement ----------------------- */

export async function saveBusinessAndTravel(input: {
  businessAddress: string
  freeDistanceKm: number
  pricePerKmCents: number
  maxDistanceKm: number
  roundTrip: boolean
}): Promise<ActionResult> {
  const { tenant } = await requireCompanyMember()
  await ensureSettingsRow(tenant.id)

  const address = input.businessAddress.trim()

  // Géocode l'adresse pro et met en cache les coordonnées pour éviter un
  // géocodage à chaque calcul de frais côté réservation.
  let lat: string | null = null
  let lng: string | null = null
  if (address) {
    const coords = await geocodeAddress(address)
    if (!coords) {
      return {
        ok: false,
        error: "Adresse de départ introuvable. Vérifiez l'orthographe et le code postal.",
      }
    }
    lat = coords.lat.toString()
    lng = coords.lng.toString()
  }

  await db
    .update(settings)
    .set({
      businessAddress: address || null,
      businessLat: lat,
      businessLng: lng,
      freeDistanceKm: Math.max(0, input.freeDistanceKm).toString(),
      pricePerKmCents: Math.max(0, Math.round(input.pricePerKmCents)),
      maxDistanceKm: Math.max(0, input.maxDistanceKm).toString(),
      roundTrip: input.roundTrip,
      updatedAt: new Date(),
    })
    .where(eq(settings.companyId, tenant.id))

  revalidate()
  return { ok: true }
}

/* ------------------------------ Planning ------------------------------ */

export async function savePlanning(input: {
  maxVehiclesPerDay: number
  slotIntervalMin: number
  bufferMin: number
  minNoticeHours: number
}): Promise<ActionResult> {
  const { tenant } = await requireCompanyMember()
  await ensureSettingsRow(tenant.id)
  await db
    .update(settings)
    .set({
      maxVehiclesPerDay: Math.max(1, Math.round(input.maxVehiclesPerDay)),
      slotIntervalMin: Math.max(5, Math.round(input.slotIntervalMin)),
      bufferMin: Math.max(0, Math.round(input.bufferMin)),
      minNoticeHours: Math.max(0, Math.round(input.minNoticeHours)),
      updatedAt: new Date(),
    })
    .where(eq(settings.companyId, tenant.id))
  revalidate()
  return { ok: true }
}

/* ------------------------------- Acompte ------------------------------- */

export async function saveDeposit(input: {
  depositType: "none" | "fixed" | "percent"
  depositValue: number
  /** Slugs des moyens de paiement acceptés (ex. ["transfer","wero"]). */
  depositMethods?: string[]
  /** Instructions de paiement affichées au client (IBAN, n° Wero, lien…). */
  depositInstructions?: string
}): Promise<ActionResult> {
  const { tenant } = await requireCompanyMember()
  await ensureSettingsRow(tenant.id)
  if (input.depositType === "percent" && (input.depositValue < 0 || input.depositValue > 100)) {
    return { ok: false, error: "Le pourcentage doit être entre 0 et 100." }
  }
  // Ne conserve que des slugs connus, dédupliqués, en CSV.
  const methods = Array.from(
    new Set((input.depositMethods ?? []).filter((m) => DEPOSIT_METHODS.includes(m as DepositMethod))),
  ).join(",")
  await db
    .update(settings)
    .set({
      depositType: input.depositType,
      // Pour "fixed" la valeur est en centimes, pour "percent" c'est un %.
      depositValue: Math.max(0, Math.round(input.depositValue)),
      depositMethods: input.depositType === "none" ? null : methods || null,
      depositInstructions:
        input.depositType === "none" ? null : input.depositInstructions?.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(settings.companyId, tenant.id))
  revalidate()
  return { ok: true }
}

/* ---------------------------- Mode vacances ---------------------------- */

export async function saveVacationMode(input: {
  vacationMode: boolean
  vacationMessage: string
}): Promise<ActionResult> {
  const { tenant } = await requireCompanyMember()
  await ensureSettingsRow(tenant.id)
  await db
    .update(settings)
    .set({
      vacationMode: input.vacationMode,
      vacationMessage: input.vacationMessage.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(settings.companyId, tenant.id))
  revalidate()
  return { ok: true }
}

/* --------------------------- Horaires (semaine) --------------------------- */

export async function saveBusinessHours(
  days: Array<{ dayOfWeek: number; isOpen: boolean; openTime: string; closeTime: string }>,
): Promise<ActionResult> {
  const { tenant } = await requireCompanyMember()
  for (const d of days) {
    const existing = await db
      .select({ id: businessHours.id })
      .from(businessHours)
      .where(and(eq(businessHours.companyId, tenant.id), eq(businessHours.dayOfWeek, d.dayOfWeek)))
      .limit(1)
    const values = {
      companyId: tenant.id,
      dayOfWeek: d.dayOfWeek,
      isOpen: d.isOpen,
      openTime: d.openTime,
      closeTime: d.closeTime,
    }
    if (existing.length) {
      await db.update(businessHours).set(values).where(eq(businessHours.id, existing[0].id))
    } else {
      await db.insert(businessHours).values(values)
    }
  }
  revalidate()
  return { ok: true }
}

/* ------------------------ Congés / indisponibilités ------------------------ */

export async function addTimeOff(input: {
  startDate: string
  endDate: string
  reason: string
}): Promise<ActionResult> {
  const { tenant } = await requireCompanyMember()
  if (!input.startDate || !input.endDate) return { ok: false, error: "Dates requises." }
  if (input.endDate < input.startDate) {
    return { ok: false, error: "La date de fin doit suivre la date de début." }
  }
  await db.insert(timeOff).values({
    companyId: tenant.id,
    startDate: input.startDate,
    endDate: input.endDate,
    reason: input.reason.trim() || null,
  })
  revalidate()
  return { ok: true }
}

export async function deleteTimeOff(id: number): Promise<ActionResult> {
  const { tenant } = await requireCompanyMember()
  // Scopé entreprise : impossible de supprimer le congé d'une autre entreprise.
  await db.delete(timeOff).where(and(eq(timeOff.id, id), eq(timeOff.companyId, tenant.id)))
  revalidate()
  return { ok: true }
}
