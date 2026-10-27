import { type NextRequest, NextResponse } from "next/server"
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { getSpiritEditor } from "@/lib/custom-sites/spirit-editor"
import {
  SPIRIT_PHOTO_MAX_BYTES,
  SPIRIT_PHOTO_SLOTS,
  spiritPhotoUploadPrefix,
} from "@/components/custom-sites/spirit-acs/service-photos"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Jeton d'envoi client Vercel Blob pour les PHOTOS DES PRESTATIONS Spirit (L32).
 * Même modèle que `/api/photo-gallery-upload` : le fichier va directement du
 * navigateur au Blob privé. Réservé à OWNER/ADMIN de Spirit ACS (licence
 * `website`), chemin contraint à `spirit-service-photo-upload/company-<id>-<clé>-`.
 * Ce fichier BRUT n'est jamais servi : l'action d'enregistrement le contrôle,
 * le ré-encode en WebP puis le supprime.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const editor = await getSpiritEditor()
  if (!editor) return NextResponse.json({ error: "Non autorisé." }, { status: 401 })
  if (!editor.ok) return NextResponse.json({ error: editor.error }, { status: 403 })
  const companyId = editor.ctx.tenant.id

  const body = (await request.json()) as HandleUploadBody
  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const allowed =
          !pathname.includes("..") && SPIRIT_PHOTO_SLOTS.some((s) => pathname.startsWith(spiritPhotoUploadPrefix(companyId, s.key)))
        if (!allowed) throw new Error("Chemin de téléversement non autorisé.")
        return {
          access: "private",
          addRandomSuffix: true,
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp"],
          maximumSizeInBytes: SPIRIT_PHOTO_MAX_BYTES,
        }
      },
      // L'enregistrement se fait dans l'action serveur après l'envoi.
      onUploadCompleted: async () => {},
    })
    return NextResponse.json(json)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Échec de la génération du jeton." },
      { status: 400 },
    )
  }
}
