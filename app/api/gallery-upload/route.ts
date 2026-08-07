import { type NextRequest, NextResponse } from "next/server"
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { getCompanyMemberContext } from "@/lib/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"]
const MAX_IMAGE_BYTES = 6 * 1024 * 1024 // 6 Mo par image

/**
 * Génère un token d'upload client Vercel Blob pour la galerie Avant/Après.
 *
 * Les images sont téléversées DIRECTEMENT depuis le navigateur vers le Blob
 * (elles ne transitent plus par une Server Action, ce qui évite la limite de
 * corps de 1 Mo de Next.js et le plafond des fonctions Vercel).
 *
 * ISOLATION : seul un membre authentifié de l'entreprise peut obtenir un token,
 * et le pathname est contraint au préfixe de SON entreprise. Les blobs restent
 * privés et sont servis via /api/gallery-image (vérification en base).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const ctx = await getCompanyMemberContext()
  if (!ctx) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 })
  }

  const body = (await request.json()) as HandleUploadBody
  const prefix = `gallery/company-${ctx.tenant.id}-`

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // Le chemin doit appartenir à l'entreprise du membre connecté.
        if (!pathname.startsWith(prefix)) {
          throw new Error("Chemin de téléversement non autorisé.")
        }
        return {
          addRandomSuffix: true,
          allowedContentTypes: ALLOWED_TYPES,
          maximumSizeInBytes: MAX_IMAGE_BYTES,
        }
      },
      // Non utilisé : l'enregistrement en base se fait dans la Server Action
      // une fois l'upload client terminé (nécessaire aussi en local sans URL
      // publique de callback).
      onUploadCompleted: async () => {},
    })
    return NextResponse.json(jsonResponse)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Échec de la génération du token." },
      { status: 400 },
    )
  }
}
