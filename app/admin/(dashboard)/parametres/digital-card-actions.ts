"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { requireCompanyMember } from "@/lib/admin"
import { sanitizeDigitalCard } from "@/lib/digital-card"

export type DigitalCardActionResult = { ok: true } | { ok: false; error: string }

/**
 * Réglages de la carte digitale (L45), stockés dans `companies.siteContent.digitalCard`.
 * Les autres clés de `siteContent` sont relues sous verrou et préservées. Écriture limitée
 * au tenant du membre connecté (tout membre, comme L39).
 */
export async function saveDigitalCard(input: unknown): Promise<DigitalCardActionResult> {
  const { tenant } = await requireCompanyMember()
  const clean = sanitizeDigitalCard(input)
  if (!clean.ok) return clean

  const scope = eq(companies.id, tenant.id)
  const saved = await db.transaction(async (tx) => {
    const [row] = await tx.select({ siteContent: companies.siteContent }).from(companies).where(scope).limit(1).for("update")
    if (!row) return false
    const current = row.siteContent
    const next: Record<string, unknown> =
      typeof current === "object" && current !== null && !Array.isArray(current) ? { ...current } : {}
    next.digitalCard = clean.value
    await tx.update(companies).set({ siteContent: next, updatedAt: new Date() }).where(scope)
    return true
  })
  if (!saved) return { ok: false, error: "Enregistrement impossible. Réessayez." }

  revalidatePath("/admin/parametres")
  revalidatePath("/carte")
  return { ok: true }
}
