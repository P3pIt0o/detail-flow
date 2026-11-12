import { type NextRequest, NextResponse } from "next/server"
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { getCompanyMemberContext } from "@/lib/admin"
import { heroImagePrefix } from "@/lib/public-page/hero-image"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Jeton d'UPLOAD CLIENT pour la photo de bannière de la page publique (même
 * modèle que /api/admin/service-image) : Blob PRIVÉ, pathname imposé sous le
 * préfixe de l'entreprise connectée, types et poids revalidés par le jeton.
 * Les sites personnalisés (customSiteKey) n'ont pas ce configurateur : refus,
 * pour ne pas créer de Blob orphelin.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const ctx = await getCompanyMemberContext()
    if (!ctx) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
    }
    if (ctx.tenant.customSiteKey) {
      return NextResponse.json({ error: "Configurateur indisponible pour ce site." }, { status: 403 })
    }
    const prefix = heroImagePrefix(ctx.tenant.id)
    const body = (await request.json()) as HandleUploadBody

    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(prefix) || pathname.includes("..")) {
          throw new Error("Chemin d'image non autorisé.")
        }
        return {
          access: "private",
          addRandomSuffix: true,
          allowedContentTypes: ["image/jpeg", "image/jpg", "image/png", "image/webp"],
          maximumSizeInBytes: 6 * 1024 * 1024, // 6 Mo
        }
      },
      // Rien à faire : le pathname est renvoyé au client, qui l'enregistre via saveHeroImage.
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
