import { NextResponse } from "next/server"
import { rejectUnauthorizedCron } from "@/lib/cron/auth"
import { syncAllDue } from "@/lib/calendar-sync/sync"

export const dynamic = "force-dynamic"

/** L80 — Relecture des agendas externes, toutes les 15 min (garde CRON_SECRET fail-closed). */
export async function GET(request: Request) {
  const denied = rejectUnauthorizedCron(request)
  if (denied) return denied
  try {
    return NextResponse.json({ ok: true, ...(await syncAllDue(new Date())) })
  } catch (e) {
    console.error("[cron/calendar-sync] unexpected_error", { kind: e instanceof Error ? e.name : "unknown" })
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 })
  }
}
