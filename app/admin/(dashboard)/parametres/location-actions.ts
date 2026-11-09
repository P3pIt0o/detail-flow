"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies, settings } from "@/lib/db/schema"
import { requireCompanyMember } from "@/lib/admin"
import { saveLocationConfig } from "@/lib/booking/location"
import { isWorkshopAddressComplete, sanitizeLocationLabels, type LocationConfig } from "@/lib/booking/location-shared"

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

/**
 * Libellés des cartes « Chez vous » / « À l'atelier » (L39), stockés dans
 * `companies.siteContent.locationLabels`. Les autres clés de `siteContent` sont
 * relues sous verrou et préservées. Écriture limitée au tenant du membre connecté.
 */
export async function saveLocationLabels(input: unknown): Promise<LocationActionResult> {
  const { tenant } = await requireCompanyMember()
  const clean = sanitizeLocationLabels(input)
  if (!clean.ok) return clean

  const scope = eq(companies.id, tenant.id)
  const saved = await db.transaction(async (tx) => {
    const [row] = await tx.select({ siteContent: companies.siteContent }).from(companies).where(scope).limit(1).for("update")
    if (!row) return false
    const current = row.siteContent
    const next: Record<string, unknown> =
      typeof current === "object" && current !== null && !Array.isArray(current) ? { ...current } : {}
    if (Object.keys(clean.value).length) next.locationLabels = clean.value
    else delete next.locationLabels
    await tx.update(companies).set({ siteContent: next, updatedAt: new Date() }).where(scope)
    return true
  })
  if (!saved) return { ok: false, error: "Enregistrement impossible. Réessayez." }

  revalidatePath("/admin/parametres")
  revalidatePath("/reservation")
  return { ok: true }
}
