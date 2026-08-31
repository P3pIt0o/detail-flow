import "server-only"

import { and, asc, eq } from "drizzle-orm"
import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { services, reviews } from "@/lib/db/schema"
import { resolveRequestTenant } from "@/lib/tenant"
import { resolveServiceImageSrc } from "@/lib/service-image"
import { attachServiceHighlights } from "@/lib/services/highlight-store"
import type { Review } from "@/config/content"

const defaultServiceImages: Record<string, string> = {
  "lavage-premium": "/services/lavage-premium.png",
  "renovation-carrosserie": "/services/renovation-carrosserie.png",
  "protection-ceramique": "/services/protection-ceramique.png",
  "interieur-complet": "/services/interieur-complet.png",
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

function getDefaultServiceImage(service: {
  slug: string
  name: string
}): string {
  const normalizedSlug = normalize(service.slug)
  const normalizedName = normalize(service.name)

  if (
    normalizedSlug.includes("lavage") ||
    normalizedName.includes("lavage")
  ) {
    return "/services/lavage-premium.png"
  }

  if (
    normalizedSlug.includes("renovation") ||
    normalizedSlug.includes("carrosserie") ||
    normalizedName.includes("renovation") ||
    normalizedName.includes("carrosserie")
  ) {
    return "/services/renovation-carrosserie.png"
  }

  if (
    normalizedSlug.includes("ceramique") ||
    normalizedSlug.includes("protection") ||
    normalizedName.includes("ceramique") ||
    normalizedName.includes("protection")
  ) {
    return "/services/protection-ceramique.png"
  }

  if (
    normalizedSlug.includes("interieur") ||
    normalizedName.includes("interieur")
  ) {
    return "/services/interieur-complet.png"
  }

  return (
    defaultServiceImages[normalizedSlug] ||
    defaultServiceImages[normalizedName] ||
    "/services/default.png"
  )
}

/**
 * Prestations publiques.
 * Retourne uniquement les prestations visibles de l'entreprise courante.
 */
export async function getPublicServices() {
  // Même résolution que requireCompanyId (hôte, sinon appartenance), mais on
  // garde le tenant complet pour disposer du `slug` (URL de la route image).
  const tenant = await resolveRequestTenant()
  if (!tenant) notFound()

  const rows = await db
    .select()
    .from(services)
    .where(
      and(
        eq(services.companyId, tenant.id),
        eq(services.visible, true),
      ),
    )
    .orderBy(asc(services.sortOrder), asc(services.id))

  const mapped = rows.map((service) => {
    const savedImage = service.image?.trim()

    const hasRealImage =
      savedImage &&
      savedImage !== "/placeholder.svg" &&
      savedImage !== "placeholder.svg"

    // Image réelle : un pathname Blob privé est servi via /api/service-image
    // (isolé tenant) ; une URL http(s) ou un chemin `/…` reste inchangé.
    const image = hasRealImage
      ? (resolveServiceImageSrc(savedImage, tenant.slug) ?? getDefaultServiceImage(service))
      : getDefaultServiceImage(service)

    return { ...service, image }
  })

  // Badge « Mise en avant » (LOT C) : fusionné à part, tolérant au schéma absent
  // (null = aucun badge tant que la migration n'est pas appliquée).
  return attachServiceHighlights(tenant.id, mapped)
}

/**
 * Avis clients publics.
 * Retourne uniquement les avis VISIBLES de l'entreprise courante, mappés au
 * type `Review` attendu par le composant d'affichage (ReviewCard). Le site
 * public n'affiche donc jamais les avis d'un autre tenant ni les avis masqués.
 */
export async function getPublicReviews(): Promise<Review[]> {
  const tenant = await resolveRequestTenant()
  if (!tenant) notFound()

  const rows = await db
    .select()
    .from(reviews)
    .where(and(eq(reviews.companyId, tenant.id), eq(reviews.visible, true)))
    .orderBy(asc(reviews.sortOrder), asc(reviews.id))

  return rows.map((r) => ({
    id: String(r.id),
    author: r.authorName,
    vehicle: r.vehicle ?? "",
    rating: r.rating,
    text: r.text,
    date: r.createdAt.toISOString(),
  }))
}
