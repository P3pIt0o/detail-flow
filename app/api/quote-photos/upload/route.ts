import { type NextRequest, NextResponse } from "next/server"
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES } from "@/lib/quote-photos/config"
import { blobPrefix, verifyGrant } from "@/lib/quote-photos/grant"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Génère un token d'upload client Vercel Blob pour les photos d'une DEMANDE DE
 * DEVIS publique.
 *
 * Le formulaire étant public, aucun token Blob libre n'est émis : le navigateur
 * doit présenter un JETON SIGNÉ (grant) préalablement obtenu du serveur après
 * validation des champs de la demande. Le grant est vérifié ici (signature +
 * expiration) et contraint le pathname au préfixe de SA demande/entreprise.
 *
 * On ne fait JAMAIS confiance au companyId / requestId transmis par le
 * navigateur : ils proviennent du grant signé côté serveur.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Validation d'origine : la requête doit provenir du même hôte (anti-CSRF léger).
  const origin = request.headers.get("origin")
  if (origin) {
    try {
      if (new URL(origin).host !== request.headers.get("host")) {
        return NextResponse.json({ error: "Origine non autorisée." }, { status: 403 })
      }
    } catch {
      return NextResponse.json({ error: "Origine non autorisée." }, { status: 403 })
    }
  }

  const body = (await request.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const grant = verifyGrant(clientPayload)
        if (!grant) {
          throw new Error("Autorisation d'envoi invalide ou expirée.")
        }
        const prefix = blobPrefix(grant.companyId, grant.requestId)
        if (!pathname.startsWith(prefix) || pathname.includes("..")) {
          throw new Error("Chemin de téléversement non autorisé.")
        }
        return {
          // Noms uniques et immuables : aucun fichier n'écrase un autre.
          addRandomSuffix: true,
          allowedContentTypes: [...ALLOWED_MIME_TYPES],
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          // Répercuté dans onUploadCompleted (non utilisé : association via action).
          tokenPayload: clientPayload ?? "",
        }
      },
      // L'association (et donc toutes les vérifications serveur : existence du
      // Blob, signature réelle, quota, cohérence company/demande) est réalisée
      // par la Server Action `associateQuotePhoto` une fois l'upload terminé —
      // nécessaire aussi en local sans URL publique de callback.
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
