"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { requireCompanyMember } from "@/lib/admin"
import {
  BUILTIN_KEYS,
  resolveCustomRequestsConfig,
  type CustomRequestsConfig,
  type CustomRequestType,
} from "@/lib/custom-requests"
import { normalizeSlug } from "@/lib/tenant-shared"

export type ActionResult = { ok: boolean; error?: string }

/**
 * Enregistre la configuration « Demandes personnalisées » de l'entreprise
 * courante dans `companies.siteContent.customRequests`.
 *
 * ISOLATION : toujours scopé à l'entreprise de l'admin connecté
 * (`requireCompanyMember().tenant`). L'id d'entreprise ne vient jamais du
 * client. Les autres clés de `siteContent` sont préservées.
 */
export async function saveCustomRequestsConfig(input: CustomRequestsConfig): Promise<ActionResult> {
  const { tenant } = await requireCompanyMember()

  const str = (v: unknown, max: number): string | undefined => {
    if (typeof v !== "string") return undefined
    const t = v.trim()
    return t ? t.slice(0, max) : undefined
  }

  // Types intégrés : on ne conserve QUE leur clé + état d'activation.
  const builtins: CustomRequestType[] = []
  for (const key of BUILTIN_KEYS) {
    const found = input.types?.find((t) => t.key === key)
    builtins.push({ key, label: "", enabled: found ? found.enabled !== false : true, builtin: true })
  }

  // Types personnalisés : nom requis, clé slugifiée unique, description courte.
  const customs: CustomRequestType[] = []
  const seen = new Set<string>(BUILTIN_KEYS)
  for (const t of input.types ?? []) {
    if (!t || t.builtin || BUILTIN_KEYS.has(t.key)) continue
    const label = (t.label || "").trim().slice(0, 60)
    if (!label) continue
    let key = normalizeSlug(t.key || label) || `type-${customs.length + 1}`
    // Garantit l'unicité et évite les collisions avec les clés intégrées.
    let candidate = key
    let n = 2
    while (seen.has(candidate)) candidate = `${key}-${n++}`
    key = candidate
    seen.add(key)
    customs.push({
      key,
      label,
      description: str(t.description, 200),
      enabled: t.enabled !== false,
      builtin: false,
    })
  }

  const config = {
    enabled: input.enabled === true,
    title: str(input.title, 120),
    description: str(input.description, 400),
    ctaLabel: str(input.ctaLabel, 40),
    types: [...builtins, ...customs],
  }

  const existing = (tenant.siteContent as Record<string, unknown> | null) ?? {}
  await db
    .update(companies)
    .set({
      siteContent: { ...existing, customRequests: config },
      updatedAt: new Date(),
    })
    .where(eq(companies.id, tenant.id))

  revalidatePath("/admin/parametres")
  revalidatePath("/prestations")
  revalidatePath("/demande")
  revalidatePath("/", "layout")
  // Renvoie la config résolue pour rafraîchir l'UI de façon déterministe.
  return { ok: true }
}

/** Lecture de la config résolue de l'entreprise courante (pour la page admin). */
export async function getCustomRequestsConfig() {
  const { tenant } = await requireCompanyMember()
  const raw = (tenant.siteContent as { customRequests?: unknown } | null)?.customRequests
  return resolveCustomRequestsConfig(raw)
}
