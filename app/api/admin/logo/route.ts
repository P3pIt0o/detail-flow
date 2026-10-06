import { type NextRequest, NextResponse } from "next/server"
import { put, get } from "@vercel/blob"
import { eq } from "drizzle-orm"
import { getCompanyMemberContext } from "@/lib/admin"
import { db } from "@/lib/db"
import { settings } from "@/lib/db/schema"
import { isAllowedTenantLogoPathname, safeLogoExtension, tenantLogoPrefix } from "@/lib/admin/logo-policy"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function getStoredLogoPathname(companyId: number): Promise<string | null> {
  const [row] = await db
    .select({ invoiceLogoPathname: settings.invoiceLogoPathname })
    .from(settings)
    .where(eq(settings.companyId, companyId))
    .limit(1)
  return row?.invoiceLogoPathname ?? null
}

/** Upload du logo (Blob privé) dans le namespace du tenant. Renvoie le pathname à enregistrer. */
export async function POST(request: NextRequest) {
  const member = await getCompanyMemberContext()
  if (!member) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get("file") as File | null
  if (!file) {
    return NextResponse.json({ error: "Aucun fichier fourni." }, { status: 400 })
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Le fichier doit être une image." }, { status: 400 })
  }
  if (file.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: "Image trop lourde (max 2 Mo)." }, { status: 400 })
  }

  const ext = safeLogoExtension(file.name)
  const blob = await put(`${tenantLogoPrefix(member.tenant.id)}logo-${Date.now()}.${ext}`, file, {
    access: "private",
    addRandomSuffix: true,
  })

  return NextResponse.json({ pathname: blob.pathname })
}

/** Sert le logo du tenant courant (Blob privé) pour l'aperçu dans les paramètres. */
export async function GET(request: NextRequest) {
  const member = await getCompanyMemberContext()
  if (!member) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  }

  const pathname = request.nextUrl.searchParams.get("pathname")
  if (!pathname) {
    return NextResponse.json({ error: "Paramètre manquant." }, { status: 400 })
  }

  // Appartenance vérifiée AVANT tout accès Blob : réponse neutre sinon.
  const stored = await getStoredLogoPathname(member.tenant.id)
  if (!isAllowedTenantLogoPathname(pathname, member.tenant.id, stored)) {
    return new NextResponse("Not found", { status: 404 })
  }

  const result = await get(pathname, { access: "private" })
  if (!result || !("stream" in result)) {
    return new NextResponse("Not found", { status: 404 })
  }
  return new NextResponse(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType ?? "application/octet-stream",
      ETag: result.blob.etag,
      "Cache-Control": "private, no-cache",
    },
  })
}
