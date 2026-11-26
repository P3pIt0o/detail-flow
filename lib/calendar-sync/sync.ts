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
  markSyncAttempt,
  recordSyncError,
  replaceExternalBlocks,
  saveExternalCalendar,
} from "./store"

export type SyncDeps = {
  fetchIcs: (url: string) => Promise<FetchResult>
  getExternalUrl: (companyId: number) => Promise<string | null>
  getTimezone: (companyId: number) => Promise<string>
  markAttempt: (companyId: number, now: Date) => Promise<void>
  /** `false` si l'adresse a changé (ou a été déliée) pendant la lecture : rien n'est écrit. */
  replaceBlocks: (companyId: number, blocks: readonly BusyBlock[], now: Date, url: string) => Promise<boolean>
  saveCalendar: (companyId: number, url: string, blocks: readonly BusyBlock[], now: Date) => Promise<void>
  recordError: (companyId: number, code: string, now: Date, url: string) => Promise<void>
}

const defaultSyncDeps: SyncDeps = {
  fetchIcs: (url) => safeFetchIcs(url),
  getExternalUrl: async (id) => (await getSyncSettings(id))?.externalUrl ?? null,
  getTimezone: getCompanyTimezone,
  markAttempt: markSyncAttempt,
  replaceBlocks: replaceExternalBlocks,
  saveCalendar: saveExternalCalendar,
  recordError: recordSyncError,
}

export type SyncOutcome = { ok: true; blocks: number } | { ok: false; code: string }

/** Télécharge et lit une adresse, sans rien écrire. */
async function readCalendar(
  companyId: number,
  url: string,
  now: Date,
  deps: SyncDeps,
): Promise<{ ok: true; blocks: BusyBlock[] } | { ok: false; code: string }> {
  const res = await deps.fetchIcs(url)
  if (!res.ok) return { ok: false, code: res.code }
  if (!/BEGIN:VCALENDAR/i.test(res.text)) return { ok: false, code: "not_calendar" }
  try {
    const tz = await deps.getTimezone(companyId)
    return { ok: true, blocks: parseBusyEvents(res.text, { tenantTz: tz, now, isOwnUid }) }
  } catch {
    return { ok: false, code: "parse_error" }
  }
}

export async function syncCompany(companyId: number, now = new Date(), deps: SyncDeps = defaultSyncDeps): Promise<SyncOutcome> {
  const url = await deps.getExternalUrl(companyId)
  if (!url) return { ok: false, code: "no_url" }
  // Marqué AVANT la lecture : une société qui fait tomber le passage ne reste pas en tête de file.
  await deps.markAttempt(companyId, now)
  const read = await readCalendar(companyId, url, now, deps)
  if (!read.ok) {
    await deps.recordError(companyId, read.code, now, url)
    return read
  }
  try {
    if (!(await deps.replaceBlocks(companyId, read.blocks, now, url))) return { ok: false, code: "stale" }
    return { ok: true, blocks: read.blocks.length }
  } catch {
    await deps.recordError(companyId, "parse_error", now, url).catch(() => undefined)
    return { ok: false, code: "parse_error" }
  }
}

/** Nouvelle adresse : lue d'abord, enregistrée seulement si la lecture réussit. */
export async function connectCalendar(
  companyId: number,
  url: string,
  now = new Date(),
  deps: SyncDeps = defaultSyncDeps,
): Promise<SyncOutcome> {
  const read = await readCalendar(companyId, url, now, deps)
  if (!read.ok) return read
  await deps.saveCalendar(companyId, url, read.blocks, now)
  return { ok: true, blocks: read.blocks.length }
}

/** Au-delà, on ne lance plus de lecture (dernier lot ≤ 20 s, route limitée à 60 s). */
const RUN_BUDGET_MS = 35_000

type RunDeps = {
  list: (now: Date) => Promise<number[]>
  sync: (companyId: number, now: Date) => Promise<SyncOutcome>
  clock: () => number
}

/** Passe du cron : sociétés dues, 3 en parallèle, une erreur n'arrête pas les autres. */
export async function syncAllDue(
  now = new Date(),
  run: RunDeps = { list: (n) => listDueCompanyIds(n), sync: (id, n) => syncCompany(id, n), clock: Date.now },
): Promise<{ checked: number; ok: number; failed: number }> {
  const started = run.clock()
  const ids = await run.list(now)
  let checked = 0
  let ok = 0
  let failed = 0
  for (let i = 0; i < ids.length && run.clock() - started < RUN_BUDGET_MS; i += 3) {
    const results = await Promise.all(
      ids.slice(i, i + 3).map((id) => run.sync(id, now).catch(() => ({ ok: false as const, code: "error" }))),
    )
    checked += results.length
    for (const r of results) r.ok ? ok++ : failed++
  }
  return { checked, ok, failed }
}
