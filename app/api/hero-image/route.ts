import { type NextRequest, NextResponse } from "next/server"
import { get } from "@vercel/blob"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies, publicPageConfig } from "@/lib/db/schema"
import { heroImagePrefix } from "@/lib/public-page/hero-image"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const CACHE = "public, max-age=300, must-revalidate"

/**
 * Sert PUBLIQUEMENT la photo de bannière stockée dans le Blob PRIVÉ.
 *
 * ISOLATION : le pathname `p` doit être sous le préfixe de l'entreprise `company`
 * ET égal à SA valeur enregistrée `public_page_config.heroImageUrl`. Aucun autre
 * blob privé (autre tenant, logo, facture…) ne peut être servi. Pas de contrôle
 * « page publiée » : l'aperçu admin d'un brouillon doit afficher l'image.
 */
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("company")?.trim()
  const pathname = request.nextUrl.searchParams.get("p")?.trim()
  if (!slug || !pathname) {
    return NextResponse.json({ error: "Paramètre manquant." }, { status: 400 })
  }

  const [company] = await db
    .select({ id: companies.id, status: companies.status })
    .from(companies)
    .where(eq(companies.slug, slug))
    .limit(1)
  if (!company || company.status === "ARCHIVED" || !pathname.startsWith(heroImagePrefix(company.id))) {
    return new NextResponse("Not found", { status: 404 })
  }

  const [config] = await db
    .select({ heroImageUrl: publicPageConfig.heroImageUrl })
    .from(publicPageConfig)
    .where(eq(publicPageConfig.companyId, company.id))
    .limit(1)
  if (config?.heroImageUrl !== pathname) {
    return new NextResponse("Not found", { status: 404 })
  }

  const result = await get(pathname, {
    access: "private",
    ifNoneMatch: request.headers.get("if-none-match") ?? undefined,
  })
  if (!result) {
    return new NextResponse("Not found", { status: 404 })
  }
  if (result.statusCode === 304) {
    return new NextResponse(null, { status: 304, headers: { ETag: result.blob.etag, "Cache-Control": CACHE } })
  }
  return new NextResponse(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType,
      ETag: result.blob.etag,
      "Cache-Control": CACHE,
      "X-Content-Type-Options": "nosniff",
    },
  })
}
