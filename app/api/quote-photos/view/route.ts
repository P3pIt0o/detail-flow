import { type NextRequest, NextResponse } from "next/server"
import { get } from "@vercel/blob"
import { getCompanyMemberContext } from "@/lib/admin"
import { getAttachmentForCompany } from "@/lib/quote-photos/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Sert une photo jointe à une demande de devis — UNIQUEMENT à un membre
 * authentifié de l'entreprise propriétaire.
 *
 * Défense en profondeur (aucune URL privée n'est jamais exposée au public) :
 *   1. l'utilisateur doit être connecté (session) ;
 *   2. il doit appartenir à une entreprise (tenant résolu côté serveur) ;
 *   3. la pièce jointe doit appartenir à CETTE entreprise ;
 *   4. la demande liée doit elle-même appartenir à cette entreprise.
 * Le pathname du Blob n'est jamais accepté depuis l'URL : on ne reçoit qu'un id
 * numérique, résolu en base sous le scope entreprise.
 */
export async function GET(request: NextRequest) {
  const ctx = await getCompanyMemberContext()
  if (!ctx) {
    return new NextResponse("Non autorisé", { status: 401 })
  }

  const idParam = request.nextUrl.searchParams.get("id")?.trim()
  const download = request.nextUrl.searchParams.get("download") === "1"
  const id = Number.parseInt(idParam ?? "", 10)
  if (!Number.isFinite(id)) {
    return new NextResponse("Paramètre manquant", { status: 400 })
  }

  const attachment = await getAttachmentForCompany(id, ctx.tenant.id)
  // Logs de diagnostic TEMPORAIRES (aucune donnée sensible : ni pathname complet
  // ni token). Permettent de distinguer la cause : A) DB/tenant, B) Blob.
  console.log("[quote-photo-view] lookup", {
    id,
    tenantId: ctx.tenant.id,
    tenantSlug: ctx.tenant.slug,
    found: Boolean(attachment),
  })
  if (!attachment) {
    // CAUSE A : la pièce jointe n'appartient pas au tenant résolu pour CETTE
    // requête (souvent : contexte tenant absent → repli sur une autre entreprise).
    return new NextResponse("Not found", { status: 404 })
  }

  const result = await get(attachment.pathname, {
    access: "private",
    ifNoneMatch: request.headers.get("if-none-match") ?? undefined,
  })

  console.log("[quote-photo-view] blob", {
    id,
    hasResult: Boolean(result),
    statusCode: result?.statusCode ?? null,
  })
  if (!result) {
    // CAUSE B : la ligne existe mais le Blob privé est introuvable côté stockage.
    return new NextResponse("Not found", { status: 404 })
  }

  if (result.statusCode === 304) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: result.blob.etag,
        "Cache-Control": "private, max-age=300, must-revalidate",
      },
    })
  }

  const headers: Record<string, string> = {
    "Content-Type": result.blob.contentType || attachment.contentType,
    ETag: result.blob.etag,
    // Jamais mis en cache par un intermédiaire partagé (contenu privé).
    "Cache-Control": "private, max-age=300, must-revalidate",
    "X-Content-Type-Options": "nosniff",
  }
  if (download) {
    const safeName = attachment.originalName.replace(/["\\]/g, "")
    headers["Content-Disposition"] = `attachment; filename="${safeName}"`
  }

  return new NextResponse(result.stream, { headers })
}
