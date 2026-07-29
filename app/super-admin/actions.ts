"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { requireSuperAdmin } from "@/lib/admin"
import { provisionCompany, removeDemoData, type ProvisionResult } from "@/lib/company/provision"

/* -------------------------------------------------------------------------- */
/*  Actions de super-administration. TOUTES commencent par requireSuperAdmin().*/
/* -------------------------------------------------------------------------- */

type ActionState =
  | { ok: true; result?: ProvisionResult; message?: string }
  | { ok: false; error: string }

/** Crée une entreprise (+ owner, réglages, horaires, démo optionnelle). */
export async function createCompanyAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  await requireSuperAdmin()

  const name = String(formData.get("name") ?? "").trim()
  const slug = String(formData.get("slug") ?? "").trim()
  const ownerName = String(formData.get("ownerName") ?? "").trim()
  const ownerEmail = String(formData.get("ownerEmail") ?? "").trim()
  const city = String(formData.get("city") ?? "").trim()
  const brandPrimary = String(formData.get("brandPrimary") ?? "").trim()
  const withDemo = formData.get("withDemo") === "on"
  const betaDaysRaw = Number(formData.get("betaDays") ?? 30)
  const betaDays = Number.isFinite(betaDaysRaw) && betaDaysRaw > 0 ? Math.floor(betaDaysRaw) : 30

  if (!name || !ownerName || !ownerEmail) {
    return { ok: false, error: "Nom d'entreprise, nom et email du propriétaire sont requis." }
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail)) {
    return { ok: false, error: "Email du propriétaire invalide." }
  }

  try {
    const result = await provisionCompany({
      name,
      slug,
      ownerName,
      ownerEmail,
      city: city || undefined,
      brandPrimary: brandPrimary || undefined,
      betaDays,
      withDemo,
    })
    revalidatePath("/super-admin")
    revalidatePath("/super-admin/companies")
    return { ok: true, result }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inconnue." }
  }
}

/** Convertit une entreprise BETA en ACTIVE (aucune migration : simple statut). */
export async function convertToActiveAction(companyId: number): Promise<ActionState> {
  await requireSuperAdmin()
  try {
    await db
      .update(companies)
      .set({ status: "ACTIVE", bookingMode: "LIVE", noindex: false, updatedAt: new Date() })
      .where(eq(companies.id, companyId))
    revalidatePath("/super-admin")
    revalidatePath("/super-admin/companies")
    return { ok: true, message: "Entreprise convertie en cliente active." }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inconnue." }
  }
}

/** Prolonge le programme beta de `days` jours à partir de maintenant. */
export async function extendBetaAction(companyId: number, days: number): Promise<ActionState> {
  await requireSuperAdmin()
  const d = Number.isFinite(days) && days > 0 ? Math.floor(days) : 30
  try {
    const betaEndsAt = new Date(Date.now() + d * 24 * 60 * 60 * 1000)
    await db
      .update(companies)
      .set({ status: "BETA", betaEndsAt, updatedAt: new Date() })
      .where(eq(companies.id, companyId))
    revalidatePath("/super-admin")
    revalidatePath("/super-admin/companies")
    return { ok: true, message: `Programme beta prolongé de ${d} jours.` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inconnue." }
  }
}

/** Change le statut (SUSPENDED / ARCHIVED / BETA / ACTIVE). */
export async function setStatusAction(companyId: number, status: string): Promise<ActionState> {
  await requireSuperAdmin()
  const allowed = ["BETA", "ACTIVE", "SUSPENDED", "ARCHIVED"]
  if (!allowed.includes(status)) return { ok: false, error: "Statut invalide." }
  try {
    await db.update(companies).set({ status, updatedAt: new Date() }).where(eq(companies.id, companyId))
    revalidatePath("/super-admin")
    revalidatePath("/super-admin/companies")
    return { ok: true, message: `Statut mis à jour : ${status}.` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inconnue." }
  }
}

/** Supprime uniquement les données de démonstration (avant passage en prod). */
export async function removeDemoDataAction(companyId: number): Promise<ActionState> {
  await requireSuperAdmin()
  try {
    const removed = await removeDemoData(companyId)
    revalidatePath("/super-admin")
    revalidatePath("/super-admin/companies")
    return { ok: true, message: `${removed} réservation(s) de démonstration supprimée(s).` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inconnue." }
  }
}
