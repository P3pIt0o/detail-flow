import "server-only"
import { and, asc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { services, vehicleTypes, options, servicePrices } from "@/lib/db/schema"
import { requireCompanyId } from "@/lib/tenant"

/**
 * Lectures catalogue de l'admin — ISOLÉES PAR ENTREPRISE (`companyId`).
 */

/** Prestations pour l'admin (toutes, visibles ou non), triées. */
export async function getAdminServices(companyId?: number) {
  const cid = companyId ?? (await requireCompanyId())
  const rows = await db
    .select()
    .from(services)
    .where(eq(services.companyId, cid))
    .orderBy(asc(services.sortOrder), asc(services.id))
  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description ?? "",
    categoryId: s.categoryId,
    image: s.image,
    basePriceCents: s.basePriceCents,
    // Deux alias pour la même valeur : `durationMin` (formulaire prestation)
    // et `baseDurationMin` (grille tarifaire).
    durationMin: s.durationMin,
    baseDurationMin: s.durationMin,
    visible: s.visible,
  }))
}

/** Types de véhicules pour l'admin. */
export async function getAdminVehicleTypes(companyId?: number) {
  const cid = companyId ?? (await requireCompanyId())
  const rows = await db
    .select()
    .from(vehicleTypes)
    .where(eq(vehicleTypes.companyId, cid))
    .orderBy(asc(vehicleTypes.sortOrder), asc(vehicleTypes.id))
  return rows.map((v) => ({
    id: v.id,
    name: v.name,
    description: v.description ?? "",
    examples: v.examples ?? null,
    active: v.active,
  }))
}

/** Options complémentaires pour l'admin. */
export async function getAdminOptions(companyId?: number) {
  const cid = companyId ?? (await requireCompanyId())
  const rows = await db
    .select()
    .from(options)
    .where(eq(options.companyId, cid))
    .orderBy(asc(options.sortOrder), asc(options.id))
  return rows.map((o) => ({
    id: o.id,
    name: o.name,
    description: o.description ?? "",
    priceCents: o.priceCents,
    durationMin: o.durationMin,
    visible: o.visible,
  }))
}

/**
 * Cellules de la grille tarifaire existantes (prestation × véhicule).
 * Jointure sur services pour garantir l'isolation par entreprise.
 */
export async function getPriceMatrix(companyId?: number) {
  const cid = companyId ?? (await requireCompanyId())
  const rows = await db
    .select({
      serviceId: servicePrices.serviceId,
      vehicleTypeId: servicePrices.vehicleTypeId,
      priceCents: servicePrices.priceCents,
      durationMin: servicePrices.durationMin,
    })
    .from(servicePrices)
    .innerJoin(services, eq(servicePrices.serviceId, services.id))
    .where(eq(services.companyId, cid))
  return rows.map((p) => ({
    serviceId: p.serviceId,
    vehicleTypeId: p.vehicleTypeId,
    priceCents: p.priceCents as number | null,
    durationMin: p.durationMin as number | null,
  }))
}
