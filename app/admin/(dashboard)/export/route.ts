import { NextResponse } from "next/server"
import { getCompanyMemberContext } from "@/lib/admin"
import { buildCompanyExport, packExportZip } from "@/lib/export/build"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Export complet des données de l'entreprise courante (propriété des données).
 * - Auth + appartenance obligatoire (OWNER/ADMIN/EMPLOYEE de ce tenant).
 * - Strictement scopé par companyId ; n'inclut jamais les données d'auth.
 * - Renvoie une archive ZIP (export.json + CSV par entité).
 */
export async function GET() {
  const ctx = await getCompanyMemberContext()
  if (!ctx) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  }
  // Réservé aux gestionnaires (pas de rôle EMPLOYEE pour l'export complet).
  if (ctx.role !== "OWNER" && ctx.role !== "ADMIN" && !ctx.isSuperAdmin) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const data = await buildCompanyExport(ctx.tenant.id)
  const zip = packExportZip(data)
  const stamp = new Date().toISOString().slice(0, 10)
  const filename = `detailflow-export-${ctx.tenant.slug}-${stamp}.zip`

  return new NextResponse(Buffer.from(zip), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}
