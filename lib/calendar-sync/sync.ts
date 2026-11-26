import "server-only"

/**
 * L80 — Relecture de l'agenda externe d'une société (cron + bouton « Actualiser »).
 * Échec = anciens blocages conservés + code d'erreur enregistré.
 */

import { parseBusyEvents, type BusyBlock } from "./ics-parse"
import { isOwnUid } from "./ics-feed"
import { safeFetchIcs, type FetchResult } from "./safe-fetch"
import {
  getCompanyTimezone,
  getSyncSettings,
  listDueCompanyIds,
  recordSyncError,
  replaceExternalBlocks,
} from "./store"

export type SyncDeps = {
  fetchIcs: (url: string) => Promise<FetchResult>
  getExternalUrl: (companyId: number) => Promise<string | null>
  getTimezone: (companyId: number) => Promise<string>
  replaceBlocks: (companyId: number, blocks: readonly BusyBlock[], now: Date) => Promise<void>
  recordError: (companyId: number, code: string, now: Date) => Promise<void>
}

const defaultSyncDeps: SyncDeps = {
  fetchIcs: (url) => safeFetchIcs(url),
  getExternalUrl: async (id) => (await getSyncSettings(id))?.externalUrl ?? null,
  getTimezone: getCompanyTimezone,
  replaceBlocks: replaceExternalBlocks,
  recordError: recordSyncError,
}

export type SyncOutcome = { ok: true; blocks: number } | { ok: false; code: string }

export async function syncCompany(companyId: number, now = new Date(), deps: SyncDeps = defaultSyncDeps): Promise<SyncOutcome> {
  const url = await deps.getExternalUrl(companyId)
  if (!url) return { ok: false, code: "no_url" }
  const res = await deps.fetchIcs(url)
  if (!res.ok) {
    await deps.recordError(companyId, res.code, now)
    return { ok: false, code: res.code }
  }
  if (!/BEGIN:VCALENDAR/i.test(res.text)) {
    await deps.recordError(companyId, "not_calendar", now)
    return { ok: false, code: "not_calendar" }
  }
  try {
    const tz = await deps.getTimezone(companyId)
    const blocks = parseBusyEvents(res.text, { tenantTz: tz, now, isOwnUid })
    await deps.replaceBlocks(companyId, blocks, now)
    return { ok: true, blocks: blocks.length }
  } catch {
    await deps.recordError(companyId, "parse_error", now).catch(() => undefined)
    return { ok: false, code: "parse_error" }
  }
}

/** Passe du cron : sociétés dues, 3 en parallèle, une erreur n'arrête pas les autres. */
export async function syncAllDue(now = new Date()): Promise<{ checked: number; ok: number; failed: number }> {
  const ids = await listDueCompanyIds(now)
  let ok = 0
  let failed = 0
  for (let i = 0; i < ids.length; i += 3) {
    const results = await Promise.all(
      ids.slice(i, i + 3).map((id) => syncCompany(id, now).catch(() => ({ ok: false as const, code: "error" }))),
    )
    for (const r of results) r.ok ? ok++ : failed++
  }
  return { checked: ids.length, ok, failed }
}
