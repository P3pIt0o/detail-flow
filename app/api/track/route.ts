import { type NextRequest, NextResponse } from "next/server"
import { getCurrentTenant } from "@/lib/tenant"
import { recordPageView, recordBookingClick } from "@/lib/analytics/queries"

export const runtime = "nodejs"
// Route purement analytique : jamais mise en cache.
export const dynamic = "force-dynamic"

// Filtre anti-bot minimal (pas d'anti-bot complexe) : évite de compter les
// crawlers et health checks évidents.
const BOT_RE = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|headless|monitor|healthcheck|preview|lighthouse/i

type TrackBody = {
  // Identifiant anonyme de navigateur (cookie/localStorage) — sert UNIQUEMENT à
  // estimer les visiteurs uniques du jour. Aucune donnée personnelle.
  visitorId?: string
  // Événement : "pageview" (défaut) ou "booking_click" (préparé pour la V2).
  event?: "pageview" | "booking_click"
}

export async function POST(req: NextRequest) {
  try {
    // companyId TOUJOURS résolu côté serveur depuis l'en-tête tenant (middleware).
    // Le navigateur ne peut pas injecter un companyId d'une autre entreprise.
    const tenant = await getCurrentTenant()
    if (!tenant || tenant.status === "ARCHIVED") {
      return new NextResponse(null, { status: 204 })
    }

    const ua = req.headers.get("user-agent") ?? ""
    if (!ua || BOT_RE.test(ua)) {
      return new NextResponse(null, { status: 204 })
    }

    const body = (await req.json().catch(() => ({}))) as TrackBody
    const visitorId = typeof body.visitorId === "string" ? body.visitorId.slice(0, 64) : ""
    if (!visitorId) return new NextResponse(null, { status: 204 })

    if (body.event === "booking_click") {
      await recordBookingClick(tenant.id)
    } else {
      await recordPageView(tenant.id, visitorId)
    }

    return new NextResponse(null, { status: 204 })
  } catch {
    // Le tracking ne doit jamais casser la navigation : on avale l'erreur.
    return new NextResponse(null, { status: 204 })
  }
}
