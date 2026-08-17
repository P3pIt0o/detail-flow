import "server-only"
import { and, eq, gte, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { tenantAnalyticsDaily, tenantAnalyticsVisits } from "@/lib/db/schema"
import { requireCompanyId } from "@/lib/tenant"

/** Date du jour (UTC, YYYY-MM-DD) — même base que le reste de l'admin. */
function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

/** Date ISO d'il y a `n` jours (incluse), UTC. */
function daysAgoISO(n: number) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

/**
 * Enregistre une page vue pour une entreprise donnée (companyId TOUJOURS résolu
 * côté serveur par l'appelant, jamais envoyé par le navigateur).
 *
 * - Déduplication du visiteur unique via `tenant_analytics_visits`
 *   (companyId + date + visitorId) : l'insert en conflit ne fait rien, et son
 *   résultat indique s'il s'agit de la première visite du jour.
 * - Upsert atomique sur l'agrégat journalier : `pageViews` +1 et
 *   `uniqueVisitors` +1 seulement si nouveau visiteur du jour.
 *
 * Deux requêtes légères, aucune donnée personnelle stockée.
 */
export async function recordPageView(companyId: number, visitorId: string): Promise<void> {
  const date = todayISO()

  // 1) Le visiteur est-il nouveau aujourd'hui ? (insert idempotent)
  const inserted = await db
    .insert(tenantAnalyticsVisits)
    .values({ companyId, date, visitorId })
    .onConflictDoNothing({
      target: [tenantAnalyticsVisits.companyId, tenantAnalyticsVisits.date, tenantAnalyticsVisits.visitorId],
    })
    .returning({ id: tenantAnalyticsVisits.id })

  const isUnique = inserted.length > 0

  // 2) Upsert de l'agrégat journalier.
  await db
    .insert(tenantAnalyticsDaily)
    .values({
      companyId,
      date,
      pageViews: 1,
      uniqueVisitors: isUnique ? 1 : 0,
    })
    .onConflictDoUpdate({
      target: [tenantAnalyticsDaily.companyId, tenantAnalyticsDaily.date],
      set: {
        pageViews: sql`${tenantAnalyticsDaily.pageViews} + 1`,
        uniqueVisitors: sql`${tenantAnalyticsDaily.uniqueVisitors} + ${isUnique ? 1 : 0}`,
        updatedAt: new Date(),
      },
    })
}

/** Incrément générique d'un compteur de l'agrégat du jour (upsert atomique). */
async function bumpDaily(
  companyId: number,
  field: "bookingClicks" | "bookingsCompleted",
): Promise<void> {
  const date = todayISO()
  const col = tenantAnalyticsDaily[field]
  await db
    .insert(tenantAnalyticsDaily)
    .values({ companyId, date, [field]: 1 } as typeof tenantAnalyticsDaily.$inferInsert)
    .onConflictDoUpdate({
      target: [tenantAnalyticsDaily.companyId, tenantAnalyticsDaily.date],
      set: { [field]: sql`${col} + 1`, updatedAt: new Date() },
    })
}

/** Futur taux de conversion : clic sur "Réserver" (booking_started). */
export function recordBookingClick(companyId: number) {
  return bumpDaily(companyId, "bookingClicks")
}

/** Futur taux de conversion : réservation terminée (booking_completed). */
export function recordBookingCompleted(companyId: number) {
  return bumpDaily(companyId, "bookingsCompleted")
}

export type VisitStats = {
  pageViews30: number
  uniqueVisitors30: number
  pageViews7: number
  uniqueVisitors7: number
  /** Évolution des visiteurs uniques vs les 30 jours précédents (en %). */
  visitorsChangePct: number | null
  /** Série journalière (30 derniers jours) pour le mini-graphique. */
  series: { date: string; pageViews: number; uniqueVisitors: number }[]
}

/**
 * Statistiques de visite d'une entreprise. `companyId` est résolu côté serveur
 * par l'appelant → isolation multi-tenant garantie (jamais issu du navigateur).
 */
export async function getVisitStats(companyId?: number): Promise<VisitStats> {
  const cid = companyId ?? (await requireCompanyId())
  const start30 = daysAgoISO(29) // 30 jours glissants (aujourd'hui inclus)
  const start7 = daysAgoISO(6)
  const startPrev30 = daysAgoISO(59)

  const rows = await db
    .select({
      date: tenantAnalyticsDaily.date,
      pageViews: tenantAnalyticsDaily.pageViews,
      uniqueVisitors: tenantAnalyticsDaily.uniqueVisitors,
    })
    .from(tenantAnalyticsDaily)
    .where(and(eq(tenantAnalyticsDaily.companyId, cid), gte(tenantAnalyticsDaily.date, startPrev30)))
    .orderBy(tenantAnalyticsDaily.date)

  let pageViews30 = 0
  let uniqueVisitors30 = 0
  let pageViews7 = 0
  let uniqueVisitors7 = 0
  let uniquePrev30 = 0
  const series: VisitStats["series"] = []

  for (const r of rows) {
    if (r.date >= start30) {
      pageViews30 += r.pageViews
      uniqueVisitors30 += r.uniqueVisitors
      series.push({ date: r.date, pageViews: r.pageViews, uniqueVisitors: r.uniqueVisitors })
      if (r.date >= start7) {
        pageViews7 += r.pageViews
        uniqueVisitors7 += r.uniqueVisitors
      }
    } else {
      uniquePrev30 += r.uniqueVisitors
    }
  }

  const visitorsChangePct =
    uniquePrev30 > 0 ? Math.round(((uniqueVisitors30 - uniquePrev30) / uniquePrev30) * 100) : null

  return { pageViews30, uniqueVisitors30, pageViews7, uniqueVisitors7, visitorsChangePct, series }
}
