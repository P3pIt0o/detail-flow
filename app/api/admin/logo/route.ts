import { type NextRequest, NextResponse } from "next/server"
import { put, get } from "@vercel/blob"
import { getCompanyMemberContext } from "@/lib/admin"
import { canUseFeature } from "@/lib/licensing/enforce"
import { db } from "@/lib/db"
import { settings } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { canReadInvoiceLogo } from "@/lib/invoice/logo-access"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  const ctx = await getCompanyMemberContext()
  if (!ctx) {
    return NextResponse.json(
      { error: "Non autorisé" }, { status: 401 }
    )
  }

  if (!(await canUseFeature(ctx.tenant.id, "invoice_logo"))) {
    return NextResponse.json(
      { error: "Logo non inclus dans votre formule." },
      { status: 403 }
    )
  }

  const form = await request.formData()
  const value = form.get("file")

  if (!value || typeof value === "string") {
    return NextResponse.json(
      { error: "Fichier manquant." }, { status: 400 }
    )
  }

  const file = value
  if (file.size === 0 || file.size > 2 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Image invalide (max 2 Mo)." },
      { status: 400 }
    )
  }

  const bytes = new Uint8Array(
    await file.slice(0, 8).arrayBuffer()
  )
  const png = file.type === "image/png" &&
    [137,80,78,71,13,10,26,10].every(
      (v, i) => bytes[i] === v
    )
  const jpg = file.type === "image/jpeg" &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255

  if (!png && !jpg) {
    return NextResponse.json(
      { error: "Utilisez une image PNG ou JPG valide." },
      { status: 400 }
    )
  }

  const ext = png ? "png" : "jpg"
  const blob = await put(
    "invoice-logo/" + ctx.tenant.id +
      "/logo-" + Date.now() + "." + ext,
    file,
    { access: "private", addRandomSuffix: true }
  )

  return NextResponse.json({ pathname: blob.pathname })
}

export async function GET(request: NextRequest) {
  const ctx = await getCompanyMemberContext()
  if (!ctx) {
    return NextResponse.json(
      { error: "Non autorisé" }, { status: 401 }
    )
  }

  const pathname = request.nextUrl.searchParams.get("pathname")

  const [row] = await db
    .select({ logo: settings.invoiceLogoPathname })
    .from(settings)
    .where(eq(settings.companyId, ctx.tenant.id))
    .limit(1)

  if (!canReadInvoiceLogo(
    pathname, ctx.tenant.id, row?.logo ?? null
  )) {
    return new NextResponse("Not found", { status: 404 })
  }

  try {
    const result = await get(pathname!, { access: "private" })
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
  } catch {
    return new NextResponse("Not found", { status: 404 })
  }
}
