import { type NextRequest, NextResponse } from "next/server"
import { get } from "@vercel/blob"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { SPIRIT_SITE_TEXTS_KEY } from "@/components/custom-sites/spirit-acs/site-texts"
import {
  isSpiritOptimizedPhotoPath,
  isSpiritPhotoKey,
  readSpiritServicePhotos,
} from "@/components/custom-sites/spirit-acs/service-photos"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// L'URL change à chaque nouvelle photo (`v`) : la réponse peut être figée.
const CACHE = "public, max-age=31536000, immutable"

/**
 * Sert la photo de prestation `k` choisie par Spirit ACS (L32).
 *
 * ISOLATION : le Blob servi est celui enregistré EN BASE pour cette entreprise
 * (Spirit uniquement) et cette clé ; aucun pathname n'est accepté du navigateur.
 * Seul le WebP optimisé (préfixe de l'entreprise + `.webp`) est servi : jamais
 * le fichier brut envoyé, ni un autre Blob privé. Sinon → 404.
 */
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("company")?.trim()
  const key = request.nextUrl.searchParams.get("k")?.trim()
  if (!slug || !isSpiritPhotoKey(key)) return new NextResponse("Not found", { status: 404 })

  const [company] = await db
    .select({ id: companies.id, status: companies.status, customSiteKey: companies.customSiteKey, siteContent: companies.siteContent })
    .from(companies)
    .where(eq(companies.slug, slug))
    .limit(1)
  if (!company || company.status === "ARCHIVED" || company.customSiteKey !== SPIRIT_SITE_TEXTS_KEY) {
    return new NextResponse("Not found", { status: 404 })
  }

  const pathname = readSpiritServicePhotos((company.siteContent as { spiritAcs?: unknown } | null)?.spiritAcs)[key]
  if (!isSpiritOptimizedPhotoPath(pathname, key, company.id)) return new NextResponse("Not found", { status: 404 })

  const result = await get(pathname, { access: "private", ifNoneMatch: request.headers.get("if-none-match") ?? undefined })
  if (!result) return new NextResponse("Not found", { status: 404 })
  if (result.statusCode === 304) {
    return new NextResponse(null, { status: 304, headers: { ETag: result.blob.etag, "Cache-Control": CACHE } })
  }
  return new NextResponse(result.stream, {
    headers: { "Content-Type": "image/webp", ETag: result.blob.etag, "Cache-Control": CACHE },
  })
}
