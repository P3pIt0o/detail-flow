import { type NextRequest, NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { getSession } from "@/lib/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Upload d'une image de prestation vers Vercel Blob.
 * Route réservée aux administrateurs authentifiés.
 */
export async function POST(request: NextRequest) {
  try {
    // Vérification de la session
    const session = await getSession()

    if (!session?.user) {
      return NextResponse.json(
        { error: "Non autorisé" },
        { status: 401 }
      )
    }

    // Récupération du fichier
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json(
        { error: "Aucun fichier fourni." },
        { status: 400 }
      )
    }

    // Vérification du type
    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "Le fichier doit être une image." },
        { status: 400 }
      )
    }

    // Taille maximale : 4 Mo
    if (file.size > 4 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Image trop lourde (max 4 Mo)." },
        { status: 400 }
      )
    }

    // Extension du fichier
    const ext =
      file.name.split(".").pop()?.toLowerCase() || "png"

    // Upload vers Vercel Blob
    const blob = await put(
      `service-image/service-${Date.now()}.${ext}`,
      file,
      {
        access: "public",
        addRandomSuffix: true,
      }
    )

    // URL enregistrable dans services.image
    return NextResponse.json({
      url: blob.url,
    })
  } catch (error) {
    // Permet de voir l'erreur exacte dans les logs Vercel
    console.error("SERVICE IMAGE UPLOAD ERROR:", error)

    // Et surtout de l'afficher directement dans l'interface admin
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur inconnue pendant l'envoi de l'image.",
      },
      { status: 500 }
    )
  }
}