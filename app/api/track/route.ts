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

/**
 * Observabilité minimale : la route reste NON bloquante (toujours 204), mais on
 * n'avale plus les pannes en silence. On journalise une ligne structurée et
 * NON SENSIBLE — jamais d'IP, d'email, de téléphone, d'identifiant personnel ni
 * de contenu navigateur (User-Agent). Seulement : l'étape, le type d'événement,
 * la présence (booléenne) d'un tenant, et un message technique sécurisé.
 */
function logTrack(
  level: "warn" | "error",
  step: string,
  data: { hasTenant: boolean; event?: string; message?: string },
) {
  const payload = {
    scope: "analytics/track",
    step,
    hasTenant: data.hasTenant,
    event: data.event ?? "pageview",
    ...(data.message ? { message: data.message } : {}),
  }
  if (level === "error") console.error("[analytics]", JSON.stringify(payload))
  else console.warn("[analytics]", JSON.stringify(payload))
}

export async function POST(req: NextRequest) {
  let hasTenant = false
  const body = (await req.json().catch(() => ({}))) as TrackBody
  const event = body.event === "booking_click" ? "booking_click" : "pageview"
  try {
    // companyId TOUJOURS résolu côté serveur depuis l'en-tête tenant (middleware).
    // Le navigateur ne peut pas injecter un companyId d'une autre entreprise.
    const tenant = await getCurrentTenant()
    if (!tenant || tenant.status === "ARCHIVED") {
      // Cas le plus courant du bug historique : le tenant n'a pas pu être résolu
      // (souvent `?tenant=` perdu dans l'appel). On le rend visible sans PII.
      logTrack("warn", "tenant_unresolved", { hasTenant: false, event })
      return new NextResponse(null, { status: 204 })
    }
    hasTenant = true

    const ua = req.headers.get("user-agent") ?? ""
    if (!ua || BOT_RE.test(ua)) {
      // Bot / aperçu exclu volontairement : pas une panne, on ne journalise pas.
      return new NextResponse(null, { status: 204 })
    }

    const visitorId = typeof body.visitorId === "string" ? body.visitorId.slice(0, 64) : ""
    if (!visitorId) {
      logTrack("warn", "missing_visitor_id", { hasTenant, event })
      return new NextResponse(null, { status: 204 })
    }

    if (event === "booking_click") {
      await recordBookingClick(tenant.id)
    } else {
      await recordPageView(tenant.id, visitorId)
    }

    return new NextResponse(null, { status: 204 })
  } catch (err) {
    // Le tracking ne doit jamais casser la navigation : on répond 204. Mais on
    // journalise l'échec (souvent une erreur base : table/contrainte manquante).
    const message = err instanceof Error ? err.message : "unknown error"
    logTrack("error", "record_failed", { hasTenant, event, message })
    return new NextResponse(null, { status: 204 })
  }
}
