"use server"

import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { getSession } from "@/lib/admin"
import { provisionCompanyForUser } from "@/lib/company/provision"
import { isValidSlug, isReservedSlug, normalizeSlug } from "@/lib/tenant-shared"

/* -------------------------------------------------------------------------- */
/*  Actions du parcours « Créer mon espace » (inscription self-service)        */
/* -------------------------------------------------------------------------- */

export type SlugCheck = {
  slug: string
  available: boolean
  /** "ok" | "invalid" | "reserved" | "taken" */
  reason: "ok" | "invalid" | "reserved" | "taken"
}

/**
 * Vérifie la disponibilité d'un slug d'entreprise (lecture seule, non
 * bloquante). Utilisée pour un retour en direct dans le formulaire.
 */
export async function checkSlugAvailability(raw: string): Promise<SlugCheck> {
  const slug = normalizeSlug(raw)
  if (isReservedSlug(slug)) return { slug, available: false, reason: "reserved" }
  if (!isValidSlug(slug)) return { slug, available: false, reason: "invalid" }

  const [taken] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.slug, slug))
    .limit(1)

  return taken ? { slug, available: false, reason: "taken" } : { slug, available: true, reason: "ok" }
}

export type CreateWorkspaceState = { error?: string }

/**
 * Provisionne l'entreprise de l'utilisateur connecté puis le redirige vers son
 * espace. Idempotent et transactionnel côté `provisionCompanyForUser` : un
 * double envoi ne crée jamais deux entreprises.
 */
export async function createWorkspace(
  _prev: CreateWorkspaceState,
  formData: FormData,
): Promise<CreateWorkspaceState> {
  const session = await getSession()
  if (!session?.user) redirect("/admin/login")

  const name = String(formData.get("name") ?? "").trim()
  const slugRaw = String(formData.get("slug") ?? "").trim()

  if (!name) return { error: "Le nom de votre entreprise est requis." }

  const slug = normalizeSlug(slugRaw || name)
  if (isReservedSlug(slug)) {
    return { error: `L'adresse « ${slug} » est réservée. Choisissez-en une autre.` }
  }
  if (!isValidSlug(slug)) {
    return {
      error: "Adresse invalide : 3 à 63 caractères (lettres, chiffres et tirets).",
    }
  }

  let createdSlug: string
  try {
    const res = await provisionCompanyForUser({
      userId: session.user.id,
      userName: session.user.name ?? name,
      userEmail: session.user.email,
      companyName: name,
      slug,
    })
    createdSlug = res.slug
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "La création de votre espace a échoué.",
    }
  }

  // Hors du try/catch : `redirect` lève volontairement une exception de contrôle.
  // `?tenant=` garantit le contexte tenant en aperçu (production : résolu aussi
  // par l'appartenance de l'utilisateur).
  redirect(`/admin?tenant=${encodeURIComponent(createdSlug)}`)
}
