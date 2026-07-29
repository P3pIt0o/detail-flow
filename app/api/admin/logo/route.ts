import { type NextRequest, NextResponse } from "next/server"
import { put, get } from "@vercel/blob"
import { getSession } from "@/lib/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Upload du logo (Blob privé). Renvoie le pathname à enregistrer en base. */
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session?.user) {
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

  const ext = file.name.split(".").pop() || "png"
  const blob = await put(`invoice-logo/logo-${Date.now()}.${ext}`, file, {
    access: "private",
    addRandomSuffix: true,
  })

  return NextResponse.json({ pathname: blob.pathname })
}

/** Sert le logo (Blob privé) pour l'aperçu dans les paramètres. */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  }

  const pathname = request.nextUrl.searchParams.get("pathname")
  if (!pathname) {
    return NextResponse.json({ error: "Paramètre manquant." }, { status: 400 })
  }

  const result = await get(pathname, { access: "private" })
  if (!result || !("stream" in result)) {
    return new NextResponse("Not found", { status: 404 })
  }
  return new NextResponse(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType,
      ETag: result.blob.etag,
      "Cache-Control": "private, no-cache",
    },
  })
}
