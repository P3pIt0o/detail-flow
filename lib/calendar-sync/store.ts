import "server-only"

/**
 * L80 — Accès base de la synchro agenda. TOUTES les requêtes filtrent par
 * `companyId` (jamais pris d'une entrée client : l'appelant le tire de
 * `requireCompanyMember()` ou, pour le flux public, du jeton).
 */

import { randomBytes } from "node:crypto"
import { and, count, eq, gte, inArray, isNotNull, lte, or, isNull, lt, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  bookings,
  bookingItems,
  calendarExternalBlocks,
  calendarSyncSettings,
  companies,
} from "@/lib/db/schema"
import { externalBlocksForDay, type BusyBlock } from "./ics-parse"
import type { FeedBooking } from "./ics-feed"

export type SyncSettings = typeof calendarSyncSettings.$inferSelect

export const newFeedToken = () => randomBytes(32).toString("base64url")

export async function getSyncSettings(companyId: number): Promise<SyncSettings | null> {
  const [row] = await db.select().from(calendarSyncSettings).where(eq(calendarSyncSettings.companyId, companyId)).limit(1)
  return row ?? null
}

/** Renvoie la ligne de la société, en la créant (avec jeton) si besoin. */
export async function ensureSyncSettings(companyId: number): Promise<SyncSettings> {
  const existing = await getSyncSettings(companyId)
  if (existing) return existing
  await db.insert(calendarSyncSettings).values({ companyId, feedToken: newFeedToken() }).onConflictDoNothing()
  const row = await getSyncSettings(companyId)
  if (!row) throw new Error("calendar_sync_settings_missing")
  return row
}

/** Nouveau jeton : l'ancien cesse immédiatement de fonctionner. */
export async function regenerateFeedToken(companyId: number): Promise<void> {
  await ensureSyncSettings(companyId)
  await db
    .update(calendarSyncSettings)
    .set({ feedToken: newFeedToken(), updatedAt: new Date() })
    .where(eq(calendarSyncSettings.companyId, companyId))
}

export async function findCompanyIdByFeedToken(token: string): Promise<number | null> {
  const [row] = await db
    .select({ companyId: calendarSyncSettings.companyId })
    .from(calendarSyncSettings)
    .where(eq(calendarSyncSettings.feedToken, token))
    .limit(1)
  return row?.companyId ?? null
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** Remplace les lignes de blocage de la société, dans une transaction déjà ouverte. */
async function writeBlocks(tx: Tx, companyId: number, blocks: readonly BusyBlock[]): Promise<void> {
  await tx.delete(calendarExternalBlocks).where(eq(calendarExternalBlocks.companyId, companyId))
  for (let i = 0; i < blocks.length; i += 500) {
    await tx.insert(calendarExternalBlocks).values(
      blocks.slice(i, i + 500).map((b) => ({ companyId, startsAt: b.startsAt, endsAt: b.endsAt, allDay: b.allDay })),
    )
  }
}

/** Délie l'agenda externe : adresse et blocages supprimés ensemble. */
export async function setExternalUrl(companyId: number, url: null): Promise<void> {
  await ensureSyncSettings(companyId)
  await db.transaction(async (tx) => {
    await tx
      .update(calendarSyncSettings)
      .set({ externalUrl: url, lastError: null, lastSyncAt: null, lastSuccessAt: null, updatedAt: new Date() })
      .where(eq(calendarSyncSettings.companyId, companyId))
    await writeBlocks(tx, companyId, [])
  })
}

/** Nouvelle adresse déjà lue avec succès : elle remplace l'ancienne et ses blocages. */
export async function saveExternalCalendar(
  companyId: number,
  url: string,
  blocks: readonly BusyBlock[],
  now = new Date(),
): Promise<void> {
  await ensureSyncSettings(companyId)
  await db.transaction(async (tx) => {
    await tx
      .update(calendarSyncSettings)
      .set({ externalUrl: url, lastError: null, lastSyncAt: now, lastSuccessAt: now, updatedAt: now })
      .where(eq(calendarSyncSettings.companyId, companyId))
    await writeBlocks(tx, companyId, blocks)
  })
}

export async function getCompanyTimezone(companyId: number): Promise<string> {
  const [row] = await db.select({ tz: companies.timezone }).from(companies).where(eq(companies.id, companyId)).limit(1)
  return row?.tz || "Europe/Paris"
}

/**
 * Remplace les blocages après une relecture. La ligne de réglages est verrouillée :
 * si l'adresse lue n'est plus celle enregistrée (déliée, changée), rien n'est écrit.
 */
export async function replaceExternalBlocks(
  companyId: number,
  blocks: readonly BusyBlock[],
  now: Date,
  expectedUrl: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ externalUrl: calendarSyncSettings.externalUrl })
      .from(calendarSyncSettings)
      .where(eq(calendarSyncSettings.companyId, companyId))
      .for("update")
    if (current?.externalUrl !== expectedUrl) return false
    await writeBlocks(tx, companyId, blocks)
    await tx
      .update(calendarSyncSettings)
      .set({ lastSyncAt: now, lastSuccessAt: now, lastError: null, updatedAt: now })
      .where(eq(calendarSyncSettings.companyId, companyId))
    return true
  })
}

/** Début d'une relecture (ordre de passage du cron). */
export async function markSyncAttempt(companyId: number, now = new Date()): Promise<void> {
  await db.update(calendarSyncSettings).set({ lastSyncAt: now }).where(eq(calendarSyncSettings.companyId, companyId))
}

/** Échec : les anciens blocages sont CONSERVÉS, seul le statut change. */
export async function recordSyncError(companyId: number, code: string, now: Date, expectedUrl: string): Promise<void> {
  await db
    .update(calendarSyncSettings)
    .set({ lastSyncAt: now, lastError: code, updatedAt: now })
    .where(and(eq(calendarSyncSettings.companyId, companyId), eq(calendarSyncSettings.externalUrl, expectedUrl)))
}

/** Nombre de créneaux importés à venir (affiché dans « Mon agenda »). */
export async function countExternalBlocks(companyId: number, now = new Date()): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(calendarExternalBlocks)
    .where(and(eq(calendarExternalBlocks.companyId, companyId), gte(calendarExternalBlocks.endsAt, now)))
  return row?.n ?? 0
}

/** Sociétés à relire (adresse enregistrée, dernière lecture > 14 min). */
export async function listDueCompanyIds(now: Date, limit = 100): Promise<number[]> {
  const threshold = new Date(now.getTime() - 14 * 60_000)
  const rows = await db
    .select({ companyId: calendarSyncSettings.companyId })
    .from(calendarSyncSettings)
    .where(
      and(
        isNotNull(calendarSyncSettings.externalUrl),
        or(isNull(calendarSyncSettings.lastSyncAt), lt(calendarSyncSettings.lastSyncAt, threshold)),
      ),
    )
    .orderBy(sql`${calendarSyncSettings.lastSyncAt} asc nulls first`)
    .limit(limit)
  return rows.map((r) => r.companyId)
}

/**
 * Blocages externes d'une journée pour `getAvailability` (lecture base SEULE).
 * Erreur de base → aucun blocage (jamais d'échec de réservation), avec trace au journal.
 */
export async function getExternalBusyForDate(companyId: number, dateStr: string) {
  try {
    const tz = await getCompanyTimezone(companyId)
    // Fenêtre large (±1 jour) puis découpe exacte en fuseau tenant.
    const day = new Date(`${dateStr}T12:00:00Z`).getTime()
    const rows = await db
      .select({ startsAt: calendarExternalBlocks.startsAt, endsAt: calendarExternalBlocks.endsAt, allDay: calendarExternalBlocks.allDay })
      .from(calendarExternalBlocks)
      .where(
        and(
          eq(calendarExternalBlocks.companyId, companyId),
          lte(calendarExternalBlocks.startsAt, new Date(day + 36 * 3_600_000)),
          gte(calendarExternalBlocks.endsAt, new Date(day - 36 * 3_600_000)),
        ),
      )
    return externalBlocksForDay(rows, dateStr, tz)
  } catch (err) {
    // La réservation reste ouverte. La table absente (migration pas encore appliquée)
    // est attendue ; toute autre erreur est journalisée (code seul, jamais la requête).
    const e = err as { code?: string; cause?: { code?: string } } | null
    const code = e?.code ?? e?.cause?.code
    if (code !== "42P01") {
      console.error("[calendar-sync] lecture des blocages impossible", { companyId, code: code ?? "inconnu" })
    }
    return { fullDay: false, ranges: [] as { start: number; end: number }[] }
  }
}

/** Rendez-vous exportés (J-1 → +180 j) d'une société, pour le flux. */
export async function getFeedBookings(companyId: number, now = new Date()): Promise<{ tz: string; items: FeedBooking[] }> {
  const tz = await getCompanyTimezone(companyId)
  const from = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10)
  const to = new Date(now.getTime() + 180 * 86_400_000).toISOString().slice(0, 10)
  const rows = await db
    .select({
      id: bookings.id,
      reference: bookings.reference,
      date: bookings.date,
      startTime: bookings.startTime,
      endTime: bookings.endTime,
      customerName: bookings.customerName,
      customerPhone: bookings.customerPhone,
      address: bookings.address,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.companyId, companyId),
        inArray(bookings.status, ["pending_deposit", "confirmed"]),
        gte(bookings.date, from),
        lte(bookings.date, to),
      ),
    )
    .limit(2000)
  const ids = rows.map((r) => r.id)
  const items = ids.length
    ? await db
        .select({ bookingId: bookingItems.bookingId, serviceName: bookingItems.serviceName })
        .from(bookingItems)
        .where(inArray(bookingItems.bookingId, ids))
    : []
  const names = new Map<number, string[]>()
  for (const it of items) names.set(it.bookingId, [...(names.get(it.bookingId) ?? []), it.serviceName])
  return { tz, items: rows.map((r) => ({ ...r, serviceNames: names.get(r.id) ?? [] })) }
}
