import { type NextRequest, NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { requireCompanyMember } from "@/lib/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Upload d'une image de prestation.
 *
 * Les images de prestations sont du contenu PUBLIC (affiché à tous les
 * visiteurs du site vitrine) : on les stocke donc en Blob public et on
 * renvoie l'URL directe, enregistrée ensuite dans `services.image`.
 *
 * SÉCURITÉ : accès réservé à un membre de l'entreprise (requireCompanyMember).
 * Aucun pathname/URL n'est accepté depuis le client pour la lecture.
 */
export async function POST(request: NextRequest) {
  // Vérifie la session ET l'appartenance à une entreprise (rejette les non-membres).
  await requireCompanyMember()

  const formData = await request.formData()
  const file = formData.get("file") as File | null
  if (!file) {
    return NextResponse.json({ error: "Aucun fichier fourni." }, { status: 400 })
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Le fichier doit être une image." }, { status: 400 })
  }
  if (file.size > 4 * 1024 * 1024) {
    return NextResponse.json({ error: "Image trop lourde (max 4 Mo)." }, { status: 400 })
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "png"
  const blob = await put(`service-image/service-${Date.now()}.${ext}`, file, {
    access: "public",
    addRandomSuffix: true,
  })

  return NextResponse.json({ url: blob.url })
}
