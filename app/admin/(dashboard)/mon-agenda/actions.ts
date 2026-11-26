"use server"

import { revalidatePath } from "next/cache"
import { requireCompanyMember } from "@/lib/admin"
import { parseExternalUrl } from "@/lib/calendar-sync/safe-fetch"
import { linkErrorMessage, syncErrorMessage } from "@/lib/calendar-sync/ics-feed"
import { connectCalendar, syncCompany } from "@/lib/calendar-sync/sync"
import { ensureSyncSettings, getSyncSettings, regenerateFeedToken, setExternalUrl } from "@/lib/calendar-sync/store"

export type AgendaActionResult = { ok: boolean; error?: string }

const ROLES = ["OWNER", "ADMIN"] as const
const REFRESH_MIN_GAP_MS = 20_000
const GENERIC = "Impossible d'enregistrer pour le moment. Réessayez dans un instant."

/** L'identifiant d'entreprise vient UNIQUEMENT de la session (jamais du formulaire). */
async function companyIdFromSession(): Promise<number> {
  const ctx = await requireCompanyMember([...ROLES])
  return ctx.tenant.id
}

async function linkFailure(companyId: number, code: string): Promise<AgendaActionResult> {
  const settings = await getSyncSettings(companyId).catch(() => null)
  return { ok: false, error: linkErrorMessage(code, Boolean(settings?.externalUrl)) }
}

export async function saveExternalCalendarAction(formData: FormData): Promise<AgendaActionResult> {
  const companyId = await companyIdFromSession()
  const raw = String(formData.get("address") ?? "")
  const parsed = parseExternalUrl(raw)
  if (!parsed) return linkFailure(companyId, "invalid_url")
  try {
    const res = await connectCalendar(companyId, parsed.url.toString())
    if (!res.ok) return linkFailure(companyId, res.code)
    revalidatePath("/admin/mon-agenda")
    return { ok: true }
  } catch {
    return { ok: false, error: GENERIC }
  }
}

export async function removeExternalCalendarAction(): Promise<AgendaActionResult> {
  const companyId = await companyIdFromSession()
  try {
    await setExternalUrl(companyId, null)
    revalidatePath("/admin/mon-agenda")
    return { ok: true }
  } catch {
    return { ok: false, error: GENERIC }
  }
}

export async function regenerateFeedAddressAction(): Promise<AgendaActionResult> {
  const companyId = await companyIdFromSession()
  try {
    await regenerateFeedToken(companyId)
    revalidatePath("/admin/mon-agenda")
    return { ok: true }
  } catch {
    return { ok: false, error: GENERIC }
  }
}

export async function refreshExternalCalendarAction(): Promise<AgendaActionResult> {
  const companyId = await companyIdFromSession()
  try {
    await ensureSyncSettings(companyId)
    const s = await getSyncSettings(companyId)
    if (s?.lastSyncAt && Date.now() - s.lastSyncAt.getTime() < REFRESH_MIN_GAP_MS) {
      const previous = syncErrorMessage(s.lastError)
      return previous ? { ok: false, error: previous } : { ok: true }
    }
    const res = await syncCompany(companyId)
    revalidatePath("/admin/mon-agenda")
    if (!res.ok) return { ok: false, error: syncErrorMessage(res.code) ?? GENERIC }
    return { ok: true }
  } catch {
    return { ok: false, error: GENERIC }
  }
}
