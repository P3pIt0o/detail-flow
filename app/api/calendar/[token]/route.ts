import { NextResponse } from "next/server"
import { buildFeed, parseFeedToken } from "@/lib/calendar-sync/ics-feed"
import { findCompanyIdByFeedToken, getFeedBookings } from "@/lib/calendar-sync/store"

export const dynamic = "force-dynamic"

const notFound = () => new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } })

/**
 * L80 — Flux d'agenda privé (abonnement téléphone). Le jeton (32 octets) désigne
 * la société ; mal formé, inconnu ou ancien (régénéré) = 404 identique, sans fuite.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token: raw } = await ctx.params
  const token = parseFeedToken(raw)
  if (!token) return notFound()
  try {
    const companyId = await findCompanyIdByFeedToken(token)
    if (!companyId) return notFound()
    const { tz, items } = await getFeedBookings(companyId)
    return new NextResponse(buildFeed(items, { tz }), {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    })
  } catch {
    return notFound()
  }
}
