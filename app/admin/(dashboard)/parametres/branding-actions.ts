"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { put, del } from "@vercel/blob"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { requireCompanyMember } from "@/lib/admin"
import { SOCIAL_KEYS } from "./social-config"
import { resolveSectionOrder, type SiteContent } from "@/lib/site-content"

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
/** Valide un code couleur hexadécimal (#rgb ou #rrggbb). Renvoie null sinon. */
function normalizeHex(value: string | null): string | null {
  const v = (value ?? "").trim()
  if (!v) return null
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v) ? v.toLowerCase() : null
}

/** Normalise une URL de réseau social : ajoute https:// si absent, valide le format. */
function normalizeSocialUrl(value: string | null): string | null {
  const v = (value ?? "").trim()
  if (!v) return null
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`
  try {
    const u = new URL(withScheme)
    if (u.protocol !== "http:" && u.protocol !== "https:") return null
    return u.toString()
  } catch {
    return null
  }
}

/**
 * Enregistre les liens réseaux sociaux de l'entreprise (point 16).
 * ISOLATION : toujours scopé à l'entreprise de l'admin connecté.
 * Persisté dans `companies.socialLinks` (jsonb) et utilisé sur la vitrine du tenant.
 */
export async function saveSocialLinks(
  input: Record<string, string>,
): Promise<ActionResult> {
  const { tenant } = await requireCompanyMember()

  const links: Record<string, string> = {}
  for (const key of SOCIAL_KEYS) {
    const normalized = normalizeSocialUrl(input[key] ?? null)
    if (normalized) links[key] = normalized
    else if ((input[key] ?? "").trim()) {
      return { ok: false, error: `Lien ${key} invalide. Exemple : https://instagram.com/mon-compte` }
    }
  }

  await db
    .update(companies)
    .set({
      socialLinks: Object.keys(links).length ? links : null,
      updatedAt: new Date(),
    })
    .where(eq(companies.id, tenant.id))

  revalidatePath("/admin/parametres")
  revalidatePath("/", "layout")
  return { ok: true }
}

/**
 * Enregistre le contenu éditable du Hero de la vitrine (titre, portion colorée,
 * texte de présentation, libellés des boutons).
 * ISOLATION : toujours scopé à l'entreprise de l'admin connecté. Un champ vide
 * est stocké `null` → le composant Hero applique alors son fallback neutre.
 */
export async function saveHeroContent(input: {
  heroTitle: string
  heroHighlight: string
  heroSubtitle: string
  heroCtaPrimary: string
  heroCtaSecondary: string
}): Promise<ActionResult> {
  const { tenant } = await requireCompanyMember()

  const clean = (v: string, max: number): string | null => {
    const t = (v ?? "").trim()
    return t ? t.slice(0, max) : null
  }

  await db
    .update(companies)
    .set({
      heroTitle: clean(input.heroTitle, 120),
      heroHighlight: clean(input.heroHighlight, 60),
      heroSubtitle: clean(input.heroSubtitle, 400),
      heroCtaPrimary: clean(input.heroCtaPrimary, 40),
      heroCtaSecondary: clean(input.heroCtaSecondary, 40),
      updatedAt: new Date(),
    })
    .where(eq(companies.id, tenant.id))

  revalidatePath("/admin/parametres")
  revalidatePath("/", "layout")
  return { ok: true }
}

/**
 * Enregistre le contenu éditable des sections statiques du site public
 * (Présentation, Pourquoi nous choisir, intro Prestations, intro Galerie,
 * intro Avis, Contact/CTA, Pied de page). Structure générique jsonb, voir
 * lib/site-content.ts. Les modules Avis/Prestations/Galerie eux-mêmes ne
 * sont pas touchés — uniquement leurs titres/textes d'intro et leur switch
 * d'activation.
 *
 * ISOLATION : toujours scopé à l'entreprise de l'admin connecté. Le contenu
 * est stocké tel quel (fusionné avec les défauts uniquement à la lecture),
 * ce qui préserve la rétrocompatibilité : un tenant qui n'a jamais rien
 * configuré garde `siteContent = null` et affiche les textes par défaut.
 */
export async function saveSiteContent(content: SiteContent): Promise<ActionResult> {
  const { tenant } = await requireCompanyMember()

  const str = (v: unknown, max: number): string | undefined => {
    if (typeof v !== "string") return undefined
    const t = v.trim()
    return t ? t.slice(0, max) : ""
  }
  const bool = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback)

  const clean: SiteContent = {
    about: {
      title: str(content.about?.title, 100),
      text: str(content.about?.text, 800),
      buttonLabel: str(content.about?.buttonLabel, 40),
      buttonHref: str(content.about?.buttonHref, 200),
    },
    whyUs: {
      enabled: bool(content.whyUs?.enabled, true),
      title: str(content.whyUs?.title, 100),
      subtitle: str(content.whyUs?.subtitle, 150),
      points: Array.isArray(content.whyUs?.points)
        ? content.whyUs!.points!.map((p) => (typeof p === "string" ? p.trim().slice(0, 200) : "")).filter(Boolean)
        : undefined,
    },
    services: {
      // Sur-titre optionnel piloté par un switch : désactivé = masqué,
      // activé + vide = texte par défaut (voir getPublicServicesEyebrow).
      eyebrowEnabled: bool(content.services?.eyebrowEnabled, true),
      eyebrow: str(content.services?.eyebrow, 60),
      title: str(content.services?.title, 100),
      intro: str(content.services?.intro, 400),
    },
    gallery: {
      enabled: bool(content.gallery?.enabled, true),
      title: str(content.gallery?.title, 100),
      intro: str(content.gallery?.intro, 400),
    },
    reviews: {
      enabled: bool(content.reviews?.enabled, true),
      title: str(content.reviews?.title, 100),
      intro: str(content.reviews?.intro, 400),
    },
    contact: {
      enabled: bool(content.contact?.enabled, true),
      title: str(content.contact?.title, 150),
      text: str(content.contact?.text, 400),
      buttonLabel: str(content.contact?.buttonLabel, 40),
    },
    footer: {
      text: str(content.footer?.text, 300),
      tagline: str(content.footer?.tagline, 100),
    },
  }

  // Préserve les autres clés stockées dans la même colonne jsonb que cet onglet
  // ne gère pas : « Demandes personnalisées » (customRequests) et l'ordre des
  // sections (sectionOrder). Elles ne doivent jamais être effacées ici.
  const existing = (tenant.siteContent as Record<string, unknown> | null) ?? null
  const preserved: Record<string, unknown> = {}
  if (existing?.customRequests !== undefined) preserved.customRequests = existing.customRequests
  if (existing?.sectionOrder !== undefined) preserved.sectionOrder = existing.sectionOrder

  await db
    .update(companies)
    .set({
      siteContent: { ...clean, ...preserved },
      updatedAt: new Date(),
    })
    .where(eq(companies.id, tenant.id))

  revalidatePath("/admin/parametres")
  revalidatePath("/", "layout")
  return { ok: true }
}

/**
 * Enregistre l'ordre d'affichage des sections de la homepage dans
 * `companies.siteContent.sectionOrder`.
 *
 * ISOLATION : toujours scopé à l'entreprise de l'admin connecté
 * (`requireCompanyMember().tenant.id`) — l'ordre d'un autre tenant est
 * inaccessible. L'entrée est normalisée (clés connues uniquement, complétée
 * par les sections manquantes) et les autres clés jsonb sont préservées.
 */
export async function saveSectionOrder(order: string[]): Promise<ActionResult> {
  const { tenant } = await requireCompanyMember()

  const normalized = resolveSectionOrder({ sectionOrder: order })
  const existing = (tenant.siteContent as Record<string, unknown> | null) ?? {}

  await db
    .update(companies)
    .set({
      siteContent: { ...existing, sectionOrder: normalized },
      updatedAt: new Date(),
    })
    .where(eq(companies.id, tenant.id))

  revalidatePath("/admin/parametres")
  revalidatePath("/", "layout")
  return { ok: true }
}

export async function saveCompanySite(formData: FormData): Promise<ActionResult> {
  const { tenant } = await requireCompanyMember()

  // Chaque champ n'est mis à jour QUE s'il est présent dans le formulaire. Ainsi
  // l'onglet "Apparence" (couleurs seules) ne peut pas effacer les CGV/logo, et
  // l'onglet "Site public" ne peut pas effacer les couleurs.
  const hasCgv = formData.has("cgv")
  const cgvRaw = (formData.get("cgv") as string | null) ?? ""
  const removeLogo = formData.get("removeLogo") === "1"
  const file = formData.get("logo") as File | null

  // Couleurs de marque : hex valides uniquement, sinon null (repli sur le thème
  // par défaut). Champ absent (undefined) → on conserve la valeur existante.
  const hasPrimary = formData.has("brandPrimary")
  const hasSecondary = formData.has("brandSecondary")
  const brandPrimary = hasPrimary ? normalizeHex(formData.get("brandPrimary") as string) : tenant.brandPrimary ?? null
  const brandSecondary = hasSecondary
    ? normalizeHex(formData.get("brandSecondary") as string)
    : tenant.brandSecondary ?? null
  if (hasPrimary && (formData.get("brandPrimary") as string)?.trim() && !brandPrimary) {
    return { ok: false, error: "Couleur principale invalide (format attendu : #2563eb)." }
  }
  if (hasSecondary && (formData.get("brandSecondary") as string)?.trim() && !brandSecondary) {
    return { ok: false, error: "Couleur secondaire invalide (format attendu : #1e293b)." }
  }

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
      ...(hasCgv ? { cgv: cgvRaw.trim() || null } : {}),
      brandPrimary,
      brandSecondary,
      updatedAt: new Date(),
    })
    .where(eq(companies.id, tenant.id))

  // Rafraîchit l'admin et les surfaces publiques concernées.
  revalidatePath("/admin/parametres")
  revalidatePath("/cgv")
  revalidatePath("/", "layout")

  return { ok: true, logoPathname }
}
