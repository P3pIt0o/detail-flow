"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { productPurchases } from "@/lib/db/schema"
import { requireCompanyMember } from "@/lib/admin"
import { canUseFeature, FEATURE_LOCKED_MESSAGE } from "@/lib/licensing/enforce"

export type ActionResult = { ok: boolean; error?: string }

function revalidate() {
  revalidatePath("/admin/produits")
  revalidatePath("/admin")
}

export async function saveProductPurchase(input: {
  id?: number
  name: string
  priceCents: number
  purchaseDate: string
  quantity: number
  note?: string | null
}): Promise<ActionResult> {
  const { tenant } = await requireCompanyMember()

  // Contrôle de licence (feature expense_management) — AVANT toute écriture.
  // Licence explicite sans la feature => aucune création ni modification de
  // dépense. LEGACY (licensePlan = NULL) => autorisé (comportement inchangé).
  // Les dépenses existantes ne sont jamais touchées par ce refus.
  if (!(await canUseFeature(tenant.id, "expense_management"))) {
    return { ok: false, error: FEATURE_LOCKED_MESSAGE }
  }

  const name = input.name.trim()
  if (!name) return { ok: false, error: "Le nom du produit est requis." }
  if (!input.purchaseDate) return { ok: false, error: "La date d'achat est requise." }

  const values = {
    name,
    priceCents: Math.max(0, Math.round(input.priceCents)),
    purchaseDate: input.purchaseDate,
    quantity: Math.max(1, Math.round(input.quantity || 1)),
    note: input.note?.trim() || null,
  }

  if (input.id) {
    await db
      .update(productPurchases)
      .set(values)
      .where(and(eq(productPurchases.id, input.id), eq(productPurchases.companyId, tenant.id)))
  } else {
    await db.insert(productPurchases).values({ ...values, companyId: tenant.id })
  }

  revalidate()
  return { ok: true }
}

export async function deleteProductPurchase(id: number): Promise<ActionResult> {
  const { tenant } = await requireCompanyMember()

  // Contrôle de licence (feature expense_management) — AVANT toute suppression.
  // Un downgrade ne doit JAMAIS entraîner la suppression de dépenses : si la
  // feature n'est plus incluse, la suppression manuelle est simplement refusée.
  // LEGACY => autorisé. Condition tenant conservée dans le WHERE ci-dessous.
  if (!(await canUseFeature(tenant.id, "expense_management"))) {
    return { ok: false, error: FEATURE_LOCKED_MESSAGE }
  }

  await db
    .delete(productPurchases)
    .where(and(eq(productPurchases.id, id), eq(productPurchases.companyId, tenant.id)))

  revalidate()
  return { ok: true }
}
