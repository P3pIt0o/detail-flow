import { type NextRequest, NextResponse } from "next/server"
import { get } from "@vercel/blob"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies, photoGallery } from "@/lib/db/schema"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Sert PUBLIQUEMENT une image de la galerie de PHOTOS SIMPLES d'une entreprise.
 *
 * ISOLATION : le pathname (`p`) demandé doit RÉELLEMENT correspondre à une photo
 * de l'entreprise identifiée par son `slug`. On vérifie ce lien en base avant de
 * streamer le blob privé — impossible donc de servir la photo d'un autre tenant,
 * ni un autre blob privé (logo, facture, comparateur Avant/Après...).
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

  if (!company || company.status === "ARCHIVED") {
    return new NextResponse("Not found", { status: 404 })
  }

  // Le pathname doit correspondre à une photo de CETTE entreprise.
  const [owned] = await db
    .select({ id: photoGallery.id })
    .from(photoGallery)
    .where(and(eq(photoGallery.companyId, company.id), eq(photoGallery.imageUrl, pathname)))
    .limit(1)

  if (!owned) {
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
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: result.blob.etag,
        "Cache-Control": "public, max-age=300, must-revalidate",
      },
    })
  }

  return new NextResponse(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType,
      ETag: result.blob.etag,
      "Cache-Control": "public, max-age=300, must-revalidate",
    },
  })
}
