"use server"

import { revalidatePath } from "next/cache"
import { requireCompanyMember } from "@/lib/admin"
import {
  upsertPublicPageConfig,
  publishPublicPageConfig,
  type PublicPageConfigInput,
} from "@/lib/public-page/config"

export type ActionResult = { ok: true } | { ok: false; error: string }

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

/** Nettoie une chaîne : trim, `null` si vide. */
function str(fd: FormData, key: string): string | null {
  const v = fd.get(key)
  if (typeof v !== "string") return null
  const t = v.trim()
  return t ? t : null
}

/** Booléen depuis une case à cocher (présence = true). */
function bool(fd: FormData, key: string): boolean {
  return fd.get(key) === "on" || fd.get(key) === "true"
}

/** Valide une couleur hex optionnelle. Renvoie `undefined` si absente. */
function hexOrNull(value: string | null, label: string): string | null {
  if (value === null) return null
  if (!HEX_RE.test(value)) throw new Error(`${label} : format hexadécimal attendu (ex. #2563eb).`)
  return value
}

/**
 * URL d'image du hero : accepte une URL absolue https OU un chemin relatif
 * commençant par `/`. Rejette tout le reste (prévention d'injection d'URL).
 */
function imageUrlOrNull(value: string | null): string | null {
  if (value === null) return null
  if (value.startsWith("/")) return value
  try {
    const u = new URL(value)
    if (u.protocol === "https:") return value
  } catch {
    /* invalide */
  }
  throw new Error("Image du hero : URL https ou chemin interne (commençant par /) attendu.")
}

/**
 * Enregistre (UPSERT) la configuration de la page publique du tenant courant.
 *
 * ISOLATION : `requireCompanyMember()` résout le tenant côté serveur et vérifie
 * l'appartenance ; la config est écrite pour CE `companyId` uniquement. Les
 * sites personnalisés (customSiteKey) ne sont pas éditables ici : l'action
 * refuse pour préserver strictement leur rendu dédié.
 */
export async function savePublicPageConfig(fd: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireCompanyMember()
    if (ctx.tenant.customSiteKey) {
      return { ok: false, error: "Ce site utilise un rendu personnalisé : configurateur indisponible." }
    }

    const themeRaw = str(fd, "theme")
    const theme = themeRaw === "light" || themeRaw === "dark" || themeRaw === "auto" ? themeRaw : "auto"

    let heroOverlay: number | null = null
    const overlayRaw = str(fd, "heroOverlay")
    if (overlayRaw !== null) {
      const n = Number.parseInt(overlayRaw, 10)
      if (Number.isNaN(n) || n < 0 || n > 100) {
        return { ok: false, error: "Voile du hero : valeur entre 0 et 100 attendue." }
      }
      heroOverlay = n
    }

    const input: PublicPageConfigInput = {
      layoutVariant: str(fd, "layoutVariant"),
      heroImageUrl: imageUrlOrNull(str(fd, "heroImageUrl")),
      heroImagePosition: str(fd, "heroImagePosition"),
      heroOverlay,
      accentPrimary: hexOrNull(str(fd, "accentPrimary"), "Couleur principale"),
      accentSecondary: hexOrNull(str(fd, "accentSecondary"), "Couleur secondaire"),
      theme,
      showGallery: bool(fd, "showGallery"),
      showReviews: bool(fd, "showReviews"),
      showAbout: bool(fd, "showAbout"),
      interventionZone: str(fd, "interventionZone"),
      depositRuleText: str(fd, "depositRuleText"),
      cancellationPolicy: str(fd, "cancellationPolicy"),
      seoIndexable: bool(fd, "seoIndexable"),
    }

    await upsertPublicPageConfig(ctx.tenant.id, input)

    // Rafraîchit le rendu public (chemin joli + racine tenant) et l'éditeur.
    revalidatePath(`/p/${ctx.tenant.slug}`)
    revalidatePath("/")
    revalidatePath("/admin/page-publique")
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur lors de l'enregistrement."
    return { ok: false, error: message }
  }
}

/** Publie la page publique (pose `publishedAt`). Idempotent, scoping tenant. */
export async function publishPublicPage(): Promise<ActionResult> {
  try {
    const ctx = await requireCompanyMember()
    if (ctx.tenant.customSiteKey) {
      return { ok: false, error: "Ce site utilise un rendu personnalisé : publication gérée séparément." }
    }
    await publishPublicPageConfig(ctx.tenant.id)
    revalidatePath(`/p/${ctx.tenant.slug}`)
    revalidatePath("/")
    revalidatePath("/admin/page-publique")
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur lors de la publication."
    return { ok: false, error: message }
  }
}
