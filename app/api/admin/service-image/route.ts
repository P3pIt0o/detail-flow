import { type NextRequest, NextResponse } from "next/server"
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { getSession } from "@/lib/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Génération du token d'UPLOAD CLIENT pour les images de prestations.
 *
 * Le fichier est téléversé DIRECTEMENT du navigateur vers Vercel Blob : le
 * binaire ne transite plus par cette route (ni par une Server Action), ce qui
 * supprime la limite de corps (~4,5 Mo des fonctions / 1 Mo des Server
 * Actions). On ne fait ici que valider l'admin et contraindre le token.
 *
 * Les images de prestations sont du contenu PUBLIC (affiché à tous les
 * visiteurs) : on conserve donc `access: "public"` et on enregistre l'URL
 * directe dans `services.image` via l'action `saveService` (scopée entreprise).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        const session = await getSession()
        if (!session?.user) {
          throw new Error("Non autorisé")
        }
        return {
          access: "public",
          addRandomSuffix: true,
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp"],
          maximumSizeInBytes: 8 * 1024 * 1024, // 8 Mo
        }
      },
      // Rien à faire à la complétion : l'URL est renvoyée au client par upload().
      onUploadCompleted: async () => {},
    })
    return NextResponse.json(json)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Échec de l'envoi de l'image." },
      { status: 400 },
    )
  }
}
