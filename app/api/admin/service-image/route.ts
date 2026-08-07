import { type NextRequest, NextResponse } from "next/server"
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { getCompanyMemberContext } from "@/lib/admin"
import { serviceImagePrefix } from "@/lib/service-image"

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
 * Le Blob store du projet est PRIVÉ : on émet donc un token `access: "private"`
 * (comme la galerie), et on force le pathname sous le préfixe de l'entreprise
 * courante pour empêcher d'écrire sous le namespace d'un autre tenant.
 * L'image est servie ensuite via /api/service-image (isolée par tenant).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody

  try {
    const ctx = await getCompanyMemberContext()
    if (!ctx) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
    }
    const prefix = serviceImagePrefix(ctx.tenant.id)

    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // Le pathname est choisi côté client ; on REVÉRIFIE qu'il reste sous le
        // préfixe de l'entreprise connectée (défense en profondeur).
        if (!pathname.startsWith(prefix)) {
          throw new Error("Chemin d'image non autorisé.")
        }
        return {
          access: "private",
          addRandomSuffix: true,
          allowedContentTypes: ["image/jpeg", "image/jpg", "image/png", "image/webp"],
          maximumSizeInBytes: 6 * 1024 * 1024, // 6 Mo
        }
      },
      // Rien à faire à la complétion : le pathname est renvoyé au client par upload().
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
