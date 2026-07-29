"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { put, del } from "@vercel/blob"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { requireCompanyMember } from "@/lib/admin"

export type ActionResult = { ok: boolean; error?: string; logoPathname?: string | null }

const MAX_LOGO_BYTES = 2 * 1024 * 1024 // 2 Mo

/**
 * Personnalisation du site public de l'entreprise : logo + CGV.
 *
 * ISOLATION : l'écriture est TOUJOURS scopée à l'entreprise de l'admin connecté
 * (`requireCompanyMember().tenant.id`). L'id d'entreprise ne vient jamais du
 * client — un admin ne peut donc modifier que SA propre entreprise.
 *
 * Le logo est stocké dans le Blob privé ; on conserve son `pathname` dans
 * `companies.logoUrl`. Il est servi publiquement (site vitrine) via la route
 * /api/company-logo?company={slug}.
 */
export async function saveCompanySite(formData: FormData): Promise<ActionResult> {
  const { tenant } = await requireCompanyMember()

  const cgvRaw = (formData.get("cgv") as string | null) ?? ""
  const removeLogo = formData.get("removeLogo") === "1"
  const file = formData.get("logo") as File | null

  // Pathname actuel (peut être null) ; sert de base et pour le nettoyage Blob.
  let logoPathname: string | null = tenant.logoUrl ?? null

  // 1) Nouveau logo fourni → validation + upload + suppression de l'ancien.
  if (file && file.size > 0) {
    if (!file.type.startsWith("image/")) {
      return { ok: false, error: "Le logo doit être une image (PNG, JPG, SVG...)." }
    }
    if (file.size > MAX_LOGO_BYTES) {
      return { ok: false, error: "Logo trop lourd (max 2 Mo)." }
    }
    const ext = file.name.split(".").pop()?.toLowerCase() || "png"
    const blob = await put(`company-logo/company-${tenant.id}-${Date.now()}.${ext}`, file, {
      access: "private",
      addRandomSuffix: true,
    })
    // Supprime l'ancien logo du store (best-effort, ne bloque pas la sauvegarde).
    if (tenant.logoUrl && tenant.logoUrl !== blob.pathname) {
      await del(tenant.logoUrl).catch(() => {})
    }
    logoPathname = blob.pathname
  } else if (removeLogo) {
    // 2) Retrait explicite du logo.
    if (tenant.logoUrl) await del(tenant.logoUrl).catch(() => {})
    logoPathname = null
  }

  await db
    .update(companies)
    .set({
      logoUrl: logoPathname,
      cgv: cgvRaw.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(companies.id, tenant.id))

  // Rafraîchit l'admin et les surfaces publiques concernées.
  revalidatePath("/admin/parametres")
  revalidatePath("/cgv")
  revalidatePath("/", "layout")

  return { ok: true, logoPathname }
}
