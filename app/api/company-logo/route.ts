import { type NextRequest, NextResponse } from "next/server"
import { get } from "@vercel/blob"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Sert PUBLIQUEMENT le logo d'une entreprise sur son site vitrine.
 *
 * ISOLATION : on ne sert QUE le logo réellement enregistré sur l'entreprise
 * identifiée par son `slug` (le site public passe son propre slug). Le pathname
 * n'est jamais accepté depuis le client — impossible donc d'exfiltrer un autre
 * blob privé (ex. logo de facture) via cette route.
 *
 * Renvoie 404 si l'entreprise est introuvable, archivée, ou sans logo : le
 * composant Logo bascule alors sur son repli (nom de la marque).
 */
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("company")?.trim()
  if (!slug) {
    return NextResponse.json({ error: "Paramètre manquant." }, { status: 400 })
  }

  const [company] = await db
    .select({ logoUrl: companies.logoUrl, status: companies.status })
    .from(companies)
    .where(eq(companies.slug, slug))
    .limit(1)

  if (!company || company.status === "ARCHIVED" || !company.logoUrl) {
    return new NextResponse("Not found", { status: 404 })
  }

  const result = await get(company.logoUrl, {
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
