import "server-only"
import { and, count, eq, gte, inArray, lte, or, sql, sum } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  bookings,
  bookingItems,
  invoices,
  invoiceItems,
  productPurchases,
  payments,
  tenantAnalyticsDaily,
} from "@/lib/db/schema"
import { requireCompanyId } from "@/lib/tenant"
import { computeMonthlyFinancials, COLLECTED_STATUSES, type PaymentRow } from "@/lib/admin/financials"
import {
  netRevenueSumExpr,
  revenuePeriodDateExpr,
  revenueDocumentFilter,
  excludeCancelledOrDeletedBooking,
} from "@/lib/finance/revenue-sql"
import {
  type AnalysePeriod,
  type DateRange,
  type Granularity,
  resolvePeriodRange,
  buildBucketKeys,
  fillSeries,
  computeChange,
  type Change,
} from "./periods"
import {
  type AppointmentCounts,
  type ClientStats,
  type ServiceShare,
  averageBasketCents,
  appointmentsTotal,
  scheduledAppointments,
  classifyClients,
  toShares,
  conversionRate,
  estimatedResultCents,
} from "./metrics"
import { type AnalyseInsight, buildBusinessInsights } from "./insights"
import { type AnalyseAccess } from "./access"

/**
 * Module Analyse — COUCHE SERVEUR (lecture seule, multi-tenant strict).
 *
 * CHAQUE requête filtre sur un `companyId` résolu CÔTÉ SERVEUR (jamais issu du
 * navigateur). Aucune donnée fictive : tout provient des tables réelles du
 * tenant. Le CA facturé réutilise EXACTEMENT les expressions partagées du
 * tableau de bord (`lib/finance/revenue-sql.ts`) — une seule définition.
 *
 * Le chargement est GATÉ par les droits (`AnalyseAccess`) : on ne lit QUE les
 * données des niveaux autorisés, jamais « tout » avant de masquer côté React.
 */

const REAL_APPOINTMENT_STATUSES = ["confirmed", "completed"] as const

/* ------------------------- Requêtes unitaires ---------------------------- */

/** CA facturé net (factures payées − avoirs) sur la période. */
async function queryInvoicedRevenueCents(cid: number, range: DateRange): Promise<number> {
  const [row] = await db
    .select({ total: netRevenueSumExpr })
    .from(invoices)
    .where(
      and(
        eq(invoices.companyId, cid),
        revenueDocumentFilter(cid),
        sql`${revenuePeriodDateExpr} >= ${range.start}`,
        sql`${revenuePeriodDateExpr} <= ${range.end}`,
        excludeCancelledOrDeletedBooking(cid),
      ),
    )
  return Number(row?.total ?? 0)
}

/** Série du CA par bucket (jour ou mois), remplie sans trous. */
async function queryRevenueSeries(cid: number, range: DateRange, granularity: Granularity) {
  const bucketExpr =
    granularity === "month"
      ? sql<string>`to_char(${revenuePeriodDateExpr}, 'YYYY-MM')`
      : sql<string>`to_char(${revenuePeriodDateExpr}, 'YYYY-MM-DD')`
  const rows = await db
    .select({ bucket: bucketExpr, total: netRevenueSumExpr })
    .from(invoices)
    .where(
      and(
        eq(invoices.companyId, cid),
        revenueDocumentFilter(cid),
        sql`${revenuePeriodDateExpr} >= ${range.start}`,
        sql`${revenuePeriodDateExpr} <= ${range.end}`,
        excludeCancelledOrDeletedBooking(cid),
      ),
    )
    .groupBy(bucketExpr)
    .orderBy(bucketExpr)
  const keys = buildBucketKeys(range, granularity)
  return fillSeries(
    keys,
    rows.map((r) => ({ bucket: r.bucket, totalCents: Number(r.total ?? 0) })),
  )
}

/** Agrégat des factures clients PAYÉES (hors avoirs) — base du panier moyen. */
async function queryPaidInvoiceAggregate(cid: number, range: DateRange) {
  const [row] = await db
    .select({ total: sum(invoices.totalCents), n: count() })
    .from(invoices)
    .where(
      and(
        eq(invoices.companyId, cid),
        sql`${invoices.documentType} = 'invoice'`,
        sql`${invoices.status} = 'paid'`,
        excludeCancelledOrDeletedBooking(cid),
        sql`${revenuePeriodDateExpr} >= ${range.start}`,
        sql`${revenuePeriodDateExpr} <= ${range.end}`,
      ),
    )
  return { totalCents: Number(row?.total ?? 0), count: Number(row?.n ?? 0) }
}

/** Comptage des rendez-vous par statut (exclut les données de démonstration). */
async function queryAppointmentCounts(cid: number, range: DateRange): Promise<AppointmentCounts> {
  const rows = await db
    .select({ status: bookings.status, n: count() })
    .from(bookings)
    .where(
      and(
        eq(bookings.companyId, cid),
        gte(bookings.date, range.start),
        lte(bookings.date, range.end),
        eq(bookings.isDemoData, false),
      ),
    )
    .groupBy(bookings.status)
  const counts: AppointmentCounts = { completed: 0, confirmed: 0, cancelled: 0, pendingDeposit: 0 }
  for (const r of rows) {
    const n = Number(r.n ?? 0)
    if (r.status === "completed") counts.completed += n
    else if (r.status === "confirmed") counts.confirmed += n
    else if (r.status === "cancelled") counts.cancelled += n
    else if (r.status === "pending_deposit") counts.pendingDeposit += n
  }
  return counts
}

/**
 * Historique client (jusqu'à `end` inclus) pour la classification nouveaux /
 * récurrents. Exclut annulés + démo. Colonnes minimales, une seule requête.
 */
async function queryClientHistory(cid: number, end: string) {
  return db
    .select({
      email: bookings.customerEmail,
      phone: bookings.customerPhone,
      date: bookings.date,
      status: bookings.status,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.companyId, cid),
        lte(bookings.date, end),
        sql`${bookings.status} <> 'cancelled'`,
        eq(bookings.isDemoData, false),
      ),
    )
}

/** Répartition VOLUME : nombre de RDV distincts contenant chaque prestation. */
async function queryServiceVolume(cid: number, range: DateRange): Promise<ServiceShare[]> {
  const rows = await db
    .select({
      name: bookingItems.serviceName,
      n: sql<number>`count(distinct ${bookingItems.bookingId})`,
    })
    .from(bookingItems)
    .innerJoin(bookings, eq(bookingItems.bookingId, bookings.id))
    .where(
      and(
        eq(bookings.companyId, cid),
        gte(bookings.date, range.start),
        lte(bookings.date, range.end),
        inArray(bookings.status, [...REAL_APPOINTMENT_STATUSES]),
        eq(bookings.isDemoData, false),
      ),
    )
    .groupBy(bookingItems.serviceName)
  return toShares(rows.map((r) => ({ name: r.name, value: Number(r.n ?? 0) })))
}

/**
 * Répartition CA : CA facturé par prestation depuis les LIGNES de facture de
 * type `service` (net des avoirs, sur documents comptant dans le CA).
 *
 * LIMITE ASSUMÉE : les lignes d'avoir sont rattachées par LIBELLÉ de prestation
 * (invoiceItems.label). Pour d'anciens avoirs partiels sans rattachement fiable,
 * l'attribution par libellé peut être imparfaite — on ne fabrique aucune
 * précision fictive : seuls les documents comptant réellement dans le CA sont
 * pris en compte, avec le même filtre que le tableau de bord.
 */
async function queryServiceRevenue(cid: number, range: DateRange): Promise<ServiceShare[]> {
  const signedLine = sql<string>`sum(case when ${invoices.documentType} = 'credit_note'
    then -(${invoiceItems.unitPriceCents} * ${invoiceItems.quantity})
    else (${invoiceItems.unitPriceCents} * ${invoiceItems.quantity}) end)`
  const rows = await db
    .select({ name: invoiceItems.label, total: signedLine })
    .from(invoiceItems)
    .innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
    .where(
      and(
        eq(invoices.companyId, cid),
        revenueDocumentFilter(cid),
        excludeCancelledOrDeletedBooking(cid),
        sql`${invoiceItems.kind} = 'service'`,
        sql`${revenuePeriodDateExpr} >= ${range.start}`,
        sql`${revenuePeriodDateExpr} <= ${range.end}`,
      ),
    )
    .groupBy(invoiceItems.label)
  return toShares(rows.map((r) => ({ name: r.name, value: Math.max(0, Number(r.total ?? 0)) })))
}

/** Coût des achats produits/consommables sur la période. */
async function queryProductCostsCents(cid: number, range: DateRange): Promise<number> {
  const [row] = await db
    .select({ total: sum(sql`${productPurchases.priceCents} * ${productPurchases.quantity}`) })
    .from(productPurchases)
    .where(
      and(
        eq(productPurchases.companyId, cid),
        gte(productPurchases.purchaseDate, range.start),
        lte(productPurchases.purchaseDate, range.end),
      ),
    )
  return Number(row?.total ?? 0)
}

/** Encaissements réels (par paidAt/refundedAt) via le helper financier PUR. */
async function queryCollected(cid: number, range: DateRange) {
  const rows = await db
    .select({
      grossAmountCents: payments.grossAmountCents,
      refundedAmountCents: payments.refundedAmountCents,
      status: payments.status,
      paidAt: payments.paidAt,
      refundedAt: payments.refundedAt,
    })
    .from(payments)
    .where(
      and(
        eq(payments.companyId, cid),
        inArray(payments.status, [...COLLECTED_STATUSES]),
        or(
          sql`${payments.paidAt}::date >= ${range.start} and ${payments.paidAt}::date <= ${range.end}`,
          sql`${payments.refundedAt}::date >= ${range.start} and ${payments.refundedAt}::date <= ${range.end}`,
        ),
      ),
    )
  const fin = computeMonthlyFinancials({
    invoicedRevenueCents: 0,
    productCostsCents: 0,
    payments: rows as PaymentRow[],
    start: range.start,
    end: range.end,
  })
  return {
    grossCents: fin.collectedGrossCents,
    refundedCents: fin.refundedCents,
    netCents: fin.collectedNetCents,
  }
}

/** Statistiques de visite du site sur la période (agrégat journalier tenant). */
async function querySiteStats(cid: number, range: DateRange) {
  const [row] = await db
    .select({
      uv: sum(tenantAnalyticsDaily.uniqueVisitors),
      pv: sum(tenantAnalyticsDaily.pageViews),
      clicks: sum(tenantAnalyticsDaily.bookingClicks),
      completed: sum(tenantAnalyticsDaily.bookingsCompleted),
    })
    .from(tenantAnalyticsDaily)
    .where(
      and(
        eq(tenantAnalyticsDaily.companyId, cid),
        gte(tenantAnalyticsDaily.date, range.start),
        lte(tenantAnalyticsDaily.date, range.end),
      ),
    )
  return {
    uniqueVisitors: Number(row?.uv ?? 0),
    pageViews: Number(row?.pv ?? 0),
    bookingClicks: Number(row?.clicks ?? 0),
    bookingsCompleted: Number(row?.completed ?? 0),
  }
}

/* --------------------------- Structure exposée --------------------------- */

export type AnalyseEssentials = {
  invoicedRevenueCents: number
  revenueSeries: { bucket: string; totalCents: number }[]
  granularity: Granularity
  appointments: AppointmentCounts
  appointmentsTotal: number
  averageBasketCents: number | null
  paidInvoiceCount: number
  clients: ClientStats
  collected: { grossCents: number; refundedCents: number; netCents: number }
  site: { uniqueVisitors: number; pageViews: number }
}

export type AnalyseProfitability = {
  invoicedRevenueCents: number
  productCostsCents: number
  resultCents: number
}

export type AnalyseAdvanced = {
  revenueChange: Change
  appointmentsChange: Change
  basketChange: Change
  newClientsChange: Change
  serviceVolume: ServiceShare[]
  serviceRevenue: ServiceShare[]
  site: {
    uniqueVisitors: number
    pageViews: number
    bookingClicks: number
    bookingsCompleted: number
    conversionRate: number | null
  }
  insights: AnalyseInsight[]
}

export type AnalyseData = {
  period: AnalysePeriod
  current: DateRange
  previous: DateRange
  granularity: Granularity
  essentials: AnalyseEssentials | null
  profitability: AnalyseProfitability | null
  advanced: AnalyseAdvanced | null
}

/* ------------------------------ Orchestration ---------------------------- */

/**
 * Charge les données Analyse pour un tenant, une période et un niveau d'accès.
 * `companyId` DOIT être résolu côté serveur par l'appelant (sécurité).
 * On ne calcule QUE ce que `access` autorise (gating serveur), et on parallélise
 * les lectures indépendantes pour rester rapide même avec beaucoup de données.
 */
export async function loadAnalyseData(
  companyId: number,
  period: AnalysePeriod,
  access: AnalyseAccess,
  now: Date = new Date(),
): Promise<AnalyseData> {
  const cid = companyId
  const { current, previous, granularity } = resolvePeriodRange(period, now)

  const needEssentials = access.showEssentials
  const needProfit = access.showProfitability
  const needAdvanced = access.showAdvanced

  // Bloc essentiels (courant).
  const essentialsPromise: Promise<AnalyseEssentials | null> = needEssentials
    ? (async () => {
        const [invoicedRevenueCents, revenueSeries, paidAgg, appts, clientRows, collected, site] =
          await Promise.all([
            queryInvoicedRevenueCents(cid, current),
            queryRevenueSeries(cid, current, granularity),
            queryPaidInvoiceAggregate(cid, current),
            queryAppointmentCounts(cid, current),
            queryClientHistory(cid, current.end),
            queryCollected(cid, current),
            querySiteStats(cid, current),
          ])
        const clients = classifyClients(clientRows, current)
        return {
          invoicedRevenueCents,
          revenueSeries,
          granularity,
          appointments: appts,
          appointmentsTotal: appointmentsTotal(appts),
          averageBasketCents: averageBasketCents({
            paidInvoiceTotalCents: paidAgg.totalCents,
            paidInvoiceCount: paidAgg.count,
          }),
          paidInvoiceCount: paidAgg.count,
          clients,
          collected: { grossCents: collected.grossCents, refundedCents: collected.refundedCents, netCents: collected.netCents },
          site: { uniqueVisitors: site.uniqueVisitors, pageViews: site.pageViews },
        }
      })()
    : Promise.resolve(null)

  // Bloc rentabilité (courant). CA recalculé indépendamment (peut être affiché
  // sans les essentiels via un override profitability seul).
  const profitPromise: Promise<AnalyseProfitability | null> = needProfit
    ? (async () => {
        const [invoicedRevenueCents, productCostsCents] = await Promise.all([
          queryInvoicedRevenueCents(cid, current),
          queryProductCostsCents(cid, current),
        ])
        return {
          invoicedRevenueCents,
          productCostsCents,
          resultCents: estimatedResultCents(invoicedRevenueCents, productCostsCents),
        }
      })()
    : Promise.resolve(null)

  // Bloc avancé : comparaisons vs période précédente + prestations + conversion.
  const advancedPromise: Promise<{
    prevRevenue: number
    prevAppts: AppointmentCounts
    prevPaid: { totalCents: number; count: number }
    prevClients: ClientStats
    serviceVolume: ServiceShare[]
    serviceRevenue: ServiceShare[]
    siteFull: Awaited<ReturnType<typeof querySiteStats>>
  } | null> = needAdvanced
    ? (async () => {
        const [prevRevenue, prevAppts, prevPaid, prevClientRows, serviceVolume, serviceRevenue, siteFull] =
          await Promise.all([
            queryInvoicedRevenueCents(cid, previous),
            queryAppointmentCounts(cid, previous),
            queryPaidInvoiceAggregate(cid, previous),
            queryClientHistory(cid, previous.end),
            queryServiceVolume(cid, current),
            queryServiceRevenue(cid, current),
            querySiteStats(cid, current),
          ])
        return {
          prevRevenue,
          prevAppts,
          prevPaid,
          prevClients: classifyClients(prevClientRows, previous),
          serviceVolume,
          serviceRevenue,
          siteFull,
        }
      })()
    : Promise.resolve(null)

  const [essentials, profitability, advancedRaw] = await Promise.all([
    essentialsPromise,
    profitPromise,
    advancedPromise,
  ])

  let advanced: AnalyseAdvanced | null = null
  if (advancedRaw && essentials) {
    const prevBasket = averageBasketCents({
      paidInvoiceTotalCents: advancedRaw.prevPaid.totalCents,
      paidInvoiceCount: advancedRaw.prevPaid.count,
    })
    const topVolume = advancedRaw.serviceVolume[0] ?? null
    const totalServiceRevenue = advancedRaw.serviceRevenue.reduce((s, x) => s + x.value, 0)
    const topRevenue = advancedRaw.serviceRevenue[0] ?? null
    const insights = buildBusinessInsights({
      revenue: { currentCents: essentials.invoicedRevenueCents, previousCents: advancedRaw.prevRevenue },
      averageBasket: {
        currentCents: essentials.averageBasketCents,
        previousCents: prevBasket,
        invoiceCount: essentials.paidInvoiceCount,
      },
      appointments: {
        scheduled: scheduledAppointments(essentials.appointments),
        cancelled: essentials.appointments.cancelled,
      },
      topServiceByVolume: topVolume ? { name: topVolume.name, count: topVolume.value } : null,
      topServiceByRevenue: topRevenue
        ? { name: topRevenue.name, revenueCents: topRevenue.value, totalRevenueCents: totalServiceRevenue }
        : null,
      site: { uniqueVisitors: essentials.site.uniqueVisitors, bookingsCompleted: advancedRaw.siteFull.bookingsCompleted },
    })
    advanced = {
      revenueChange: computeChange(essentials.invoicedRevenueCents, advancedRaw.prevRevenue),
      appointmentsChange: computeChange(essentials.appointmentsTotal, appointmentsTotal(advancedRaw.prevAppts)),
      basketChange: computeChange(essentials.averageBasketCents ?? 0, prevBasket ?? 0),
      newClientsChange: computeChange(essentials.clients.newClients, advancedRaw.prevClients.newClients),
      serviceVolume: advancedRaw.serviceVolume,
      serviceRevenue: advancedRaw.serviceRevenue,
      site: {
        uniqueVisitors: advancedRaw.siteFull.uniqueVisitors,
        pageViews: advancedRaw.siteFull.pageViews,
        bookingClicks: advancedRaw.siteFull.bookingClicks,
        bookingsCompleted: advancedRaw.siteFull.bookingsCompleted,
        conversionRate: conversionRate(advancedRaw.siteFull.bookingsCompleted, advancedRaw.siteFull.uniqueVisitors),
      },
      insights,
    }
  }

  return { period, current, previous, granularity, essentials, profitability, advanced }
}

/** Variante « contexte » : résout le companyId côté serveur si non fourni. */
export async function loadAnalyseDataForCurrentTenant(
  period: AnalysePeriod,
  access: AnalyseAccess,
): Promise<AnalyseData> {
  const cid = await requireCompanyId()
  return loadAnalyseData(cid, period, access)
}
