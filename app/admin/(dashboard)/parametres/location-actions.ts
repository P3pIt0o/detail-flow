"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { settings } from "@/lib/db/schema"
import { requireCompanyMember } from "@/lib/admin"
import { saveLocationConfig } from "@/lib/booking/location"
import { isWorkshopAddressComplete, type LocationConfig } from "@/lib/booking/location-shared"

export type LocationActionResult = { ok: true } | { ok: false; error: string }

/** Enregistre les modes d'intervention + l'adresse atelier du tenant courant. */
export async function saveLocationSettings(input: LocationConfig): Promise<LocationActionResult> {
  const { tenant } = await requireCompanyMember()

  const config: LocationConfig = {
    mobileEnabled: Boolean(input.mobileEnabled),
    workshopEnabled: Boolean(input.workshopEnabled),
    workshopAddress: String(input.workshopAddress ?? ""),
    workshopPostalCode: String(input.workshopPostalCode ?? ""),
    workshopCity: String(input.workshopCity ?? ""),
  }

  if (!config.mobileEnabled && !config.workshopEnabled) {
    return { ok: false, error: "Choisissez au moins un lieu d'intervention." }
  }
  if (config.workshopEnabled && config.workshopPostalCode.trim() && !/^[A-Za-z0-9 -]{3,12}$/.test(config.workshopPostalCode.trim())) {
    return { ok: false, error: "Code postal invalide." }
  }
  if (!config.mobileEnabled && !isWorkshopAddressComplete(config)) {
    return { ok: false, error: "Renseignez l'adresse complète de votre atelier." }
  }

  const existing = await db
    .select({ id: settings.id })
    .from(settings)
    .where(eq(settings.companyId, tenant.id))
    .limit(1)
  if (!existing.length) await db.insert(settings).values({ companyId: tenant.id })

  const res = await saveLocationConfig(tenant.id, config)
  if (!res.ok) return res

  revalidatePath("/admin/parametres")
  revalidatePath("/admin/ma-reservation")
  revalidatePath("/admin")
  revalidatePath("/reservation")
  return { ok: true }
}
