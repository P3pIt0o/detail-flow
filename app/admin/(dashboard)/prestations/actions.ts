"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { services, vehicleTypes, options, servicePrices } from "@/lib/db/schema"
import { requireCompanyMember } from "@/lib/admin"

export type ActionResult = { ok: boolean; error?: string }

/** Génère un slug URL-safe unique-ish à partir d'un nom. */
function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 50) || `item-${Date.now()}`
  )
}

function revalidate() {
  revalidatePath("/admin/prestations")
  revalidatePath("/prestations")
  revalidatePath("/reservation")
}

/**
 * Vérifie qu'une prestation appartient bien à l'entreprise.
 * Sécurise les écritures sur `servicePrices` (table enfant sans companyId).
 */
async function serviceBelongsToCompany(serviceId: number, companyId: number) {
  const [row] = await db
    .select({ id: services.id })
    .from(services)
    .where(and(eq(services.id, serviceId), eq(services.companyId, companyId)))
    .limit(1)
  return !!row
}

/** Vérifie qu'un type de véhicule appartient bien à l'entreprise. */
async function vehicleTypeBelongsToCompany(vehicleTypeId: number, companyId: number) {
  const [row] = await db
    .select({ id: vehicleTypes.id })
    .from(vehicleTypes)
    .where(and(eq(vehicleTypes.id, vehicleTypeId), eq(vehicleTypes.companyId, companyId)))
    .limit(1)
  return !!row
}

/* ------------------------------ Prestations ------------------------------ */

export async function saveService(input: {
  id?: number
  name: string
  description: string
  categoryId: number | null
  basePriceCents: number
  durationMin: number
  visible: boolean
  image?: string | null
}): Promise<ActionResult> {
  const { tenant } = await requireCompanyMember()
  if (!input.name.trim()) return { ok: false, error: "Le nom est requis." }

  // Image : accepte uniquement un chemin public local (/...) ou une URL http(s).
  // Sinon on stocke null (jamais de valeur invalide qui casserait l'affichage).
  const rawImage = input.image?.trim()
  const image =
    rawImage && (rawImage.startsWith("/") || /^https?:\/\//i.test(rawImage)) ? rawImage : null

  const values = {
    name: input.name.trim(),
    description: input.description.trim() || null,
    categoryId: input.categoryId,
    basePriceCents: Math.max(0, Math.round(input.basePriceCents)),
    durationMin: Math.max(0, Math.round(input.durationMin)),
    visible: input.visible,
    image,
  }

  if (input.id) {
    // Update scopé entreprise : impossible de modifier la prestation d'un autre tenant.
    await db
      .update(services)
      .set(values)
      .where(and(eq(services.id, input.id), eq(services.companyId, tenant.id)))
  } else {
    await db.insert(services).values({ ...values, companyId: tenant.id, slug: slugify(input.name) })
  }
  revalidate()
  return { ok: true }
}

export async function deleteService(id: number): Promise<ActionResult> {
  const { tenant } = await requireCompanyMember()
  // Vérifie l'appartenance avant de toucher aux tarifs enfants.
  if (!(await serviceBelongsToCompany(id, tenant.id))) return { ok: false, error: "Prestation introuvable." }
  await db.delete(servicePrices).where(eq(servicePrices.serviceId, id))
  await db.delete(services).where(and(eq(services.id, id), eq(services.companyId, tenant.id)))
  revalidate()
  return { ok: true }
}

/* --------------------------- Types de véhicules --------------------------- */

export async function saveVehicleType(input: {
  id?: number
  name: string
  description: string
  active: boolean
}): Promise<ActionResult> {
  const { tenant } = await requireCompanyMember()
  if (!input.name.trim()) return { ok: false, error: "Le nom est requis." }
  const values = {
    name: input.name.trim(),
    description: input.description.trim() || null,
    active: input.active,
  }
  if (input.id) {
    await db
      .update(vehicleTypes)
      .set(values)
      .where(and(eq(vehicleTypes.id, input.id), eq(vehicleTypes.companyId, tenant.id)))
  } else {
    await db.insert(vehicleTypes).values({ ...values, companyId: tenant.id, slug: slugify(input.name) })
  }
  revalidate()
  return { ok: true }
}

export async function deleteVehicleType(id: number): Promise<ActionResult> {
  const { tenant } = await requireCompanyMember()
  if (!(await vehicleTypeBelongsToCompany(id, tenant.id))) return { ok: false, error: "Type introuvable." }
  await db.delete(servicePrices).where(eq(servicePrices.vehicleTypeId, id))
  await db.delete(vehicleTypes).where(and(eq(vehicleTypes.id, id), eq(vehicleTypes.companyId, tenant.id)))
  revalidate()
  return { ok: true }
}

/* -------------------------------- Options -------------------------------- */

export async function saveOption(input: {
  id?: number
  name: string
  description: string
  priceCents: number
  durationMin: number
  visible: boolean
}): Promise<ActionResult> {
  const { tenant } = await requireCompanyMember()
  if (!input.name.trim()) return { ok: false, error: "Le nom est requis." }
  const values = {
    name: input.name.trim(),
    description: input.description.trim() || null,
    priceCents: Math.max(0, Math.round(input.priceCents)),
    durationMin: Math.max(0, Math.round(input.durationMin)),
    visible: input.visible,
  }
  if (input.id) {
    await db
      .update(options)
      .set(values)
      .where(and(eq(options.id, input.id), eq(options.companyId, tenant.id)))
  } else {
    await db.insert(options).values({ ...values, companyId: tenant.id, slug: slugify(input.name) })
  }
  revalidate()
  return { ok: true }
}

export async function deleteOption(id: number): Promise<ActionResult> {
  const { tenant } = await requireCompanyMember()
  await db.delete(options).where(and(eq(options.id, id), eq(options.companyId, tenant.id)))
  revalidate()
  return { ok: true }
}

/* --------------------------- Matrice de tarifs --------------------------- */

/** Définit (ou efface) le tarif d'une prestation pour un type de véhicule. */
export async function setServicePrice(input: {
  serviceId: number
  vehicleTypeId: number
  priceCents: number | null
  durationMin: number | null
}): Promise<ActionResult> {
  const { tenant } = await requireCompanyMember()

  // La prestation ET le type de véhicule doivent appartenir à l'entreprise.
  const [okService, okVehicle] = await Promise.all([
    serviceBelongsToCompany(input.serviceId, tenant.id),
    vehicleTypeBelongsToCompany(input.vehicleTypeId, tenant.id),
  ])
  if (!okService || !okVehicle) return { ok: false, error: "Prestation ou type de véhicule introuvable." }

  const rows = await db
    .select()
    .from(servicePrices)
    .where(eq(servicePrices.serviceId, input.serviceId))
  const match = rows.find((r) => r.vehicleTypeId === input.vehicleTypeId)

  // Prix null => on supprime la ligne (retour au prix de base).
  if (input.priceCents === null) {
    if (match) await db.delete(servicePrices).where(eq(servicePrices.id, match.id))
    revalidate()
    return { ok: true }
  }

  const values = {
    priceCents: Math.max(0, Math.round(input.priceCents)),
    durationMin: Math.max(0, Math.round(input.durationMin ?? 60)),
  }

  if (match) {
    await db.update(servicePrices).set(values).where(eq(servicePrices.id, match.id))
  } else {
    await db.insert(servicePrices).values({
      serviceId: input.serviceId,
      vehicleTypeId: input.vehicleTypeId,
      ...values,
    })
  }
  revalidate()
  return { ok: true }
}
