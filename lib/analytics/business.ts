import "server-only"
import { and, count, eq, gte, inArray, lte, or, sql, sum } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  bookings,
  bookingItems,
  companies,
  invoices,
  invoiceItems,
  productPurchases,
  payments,
  settings,
  tenantAnalyticsDaily,
} from "@/lib/db/schema"
import { requireCompanyId } from "@/lib/tenant"
import { resolveDraftCurrency } from "@/lib/billing/country-profiles"
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
  type CurrencyContext,
  type FinancialContext,
  resolveCurrencyContext,
  resolveFinancialContext,
  normalizeCurrencyCode,
} from "./currency"
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

/**
 * Contexte comptable du tenant : fuseau horaire (pour la DATE MÉTIER) et devise
 * comptable résolue. La devise n'est retenue QUE si le profil de facturation
 * est confirmé (`settings.billingProfileConfirmedAt`), via `resolveDraftCurrency`
 * — jamais déduite d'un profil non validé. Fuseau par défaut : Europe/Paris.
 */
async function queryTenantContext(cid: number): Promise<{ timeZone: string; accountingCurrency: string | null }> {
  const [companyRow, settingsRow] = await Promise.all([
    db.select({ tz: companies.timezone }).from(companies).where(eq(companies.id, cid)).limit(1),
    db
      .select({ defaultCurrency: settings.defaultCurrency, confirmedAt: settings.billingProfileConfirmedAt })
      .from(settings)
      .where(eq(settings.companyId, cid))
      .limit(1),
  ])
  const timeZone = (companyRow[0]?.tz ?? "").trim() || "Europe/Paris"
  const accountingCurrency = resolveDraftCurrency(
    Boolean(settingsRow[0]?.confirmedAt),
    settingsRow[0]?.defaultCurrency,
  )
  return { timeZone, accountingCurrency }
}

/**
 * Devises RÉELLEMENT présentes sur les documents comptés dans le CA de la
 * période (mêmes filtres que le CA). Sert à décider si les totaux financiers
 * sont regroupables — DetailFlow ne convertit jamais de devise (pas de FX).
 */
async function queryCurrencyPresence(
  cid: number,
  range: DateRange,
): Promise<{ explicitCodes: string[]; hasLegacy: boolean }> {
  const rows = await db
    .select({ code: invoices.currencyCode, n: count() })
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
    .groupBy(invoices.currencyCode)
  const explicit = new Set<string>()
  let hasLegacy = false
  for (const r of rows) {
    const code = normalizeCurrencyCode(r.code)
    if (code) explicit.add(code)
    else hasLegacy = true
  }
  return { explicitCodes: [...explicit], hasLegacy }
}

/**
 * Devises RÉELLEMENT présentes dans les PAIEMENTS comptés sur la période (mêmes
 * statuts et même fenêtre `paidAt`/`refundedAt` que `queryCollected`). La devise
 * des paiements est résolue INDÉPENDAMMENT de celle des factures : un tenant
 * peut facturer en EUR et encaisser en CHF. `payments.currency` est NOT NULL
 * (défaut "EUR") → jamais de legacy ici.
 */
async function queryPaymentsCurrencyPresence(
  cid: number,
  range: DateRange,
): Promise<{ explicitCodes: string[]; hasLegacy: boolean }> {
  const rows = await db
    .select({ code: payments.currency, n: count() })
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
    .groupBy(payments.currency)
  const explicit = new Set<string>()
  for (const r of rows) {
    const code = normalizeCurrencyCode(r.code)
    if (code) explicit.add(code)
  }
  return { explicitCodes: [...explicit], hasLegacy: false }
}

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
 * récurrents. Ne charge QUE les VRAIS rendez-vous (`confirmed`/`completed`) :
 * un `pending_deposit` (caution en attente) n'est pas encore une activité
 * client et ne doit jamais créer un « nouveau client ». Exclut aussi la démo.
 * Colonnes minimales, une seule requête.
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
        inArray(bookings.status, [...REAL_APPOINTMENT_STATUSES]),
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
  /**
   * CA facturé net. `null` quand la période courante mêle plusieurs devises
   * (non regroupable, aucune conversion FX) — on ne calcule alors PAS le total.
   */
  invoicedRevenueCents: number | null
  /** Vide si la période courante n'est pas regroupable (multi-devises). */
  revenueSeries: { bucket: string; totalCents: number }[]
  granularity: Granularity
  appointments: AppointmentCounts
  appointmentsTotal: number
  averageBasketCents: number | null
  paidInvoiceCount: number
  clients: ClientStats
  /**
   * Encaissements. `null` quand les paiements de la période mêlent plusieurs
   * devises (total non regroupable). Devise d'affichage : `financial.paymentsCurrency`.
   */
  collected: { grossCents: number; refundedCents: number; netCents: number } | null
  site: { uniqueVisitors: number; pageViews: number }
}

export type AnalyseProfitability = {
  /**
   * La rentabilité est-elle calculable ? (CA regroupable ET dans la devise
   * comptable, car les coûts produits sont implicitement comptables). Si
   * `false`, les montants sont `null` et l'UI affiche un message explicite.
   */
  comparable: boolean
  invoicedRevenueCents: number | null
  productCostsCents: number | null
  resultCents: number | null
  /** Devise d'affichage des montants de rentabilité. */
  currencyCode: string | null
}

export type AnalyseAdvanced = {
  /** `null` quand les périodes ne sont pas comparables (devises différentes). */
  revenueChange: Change | null
  appointmentsChange: Change
  /** `null` quand les périodes ne sont pas comparables (devises différentes). */
  basketChange: Change | null
  newClientsChange: Change
  serviceVolume: ServiceShare[]
  /** Vide si la période courante n'est pas regroupable (multi-devises). */
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
  /**
   * Contexte devise des FACTURES de la période courante (compat/affichage). Le
   * détail des décisions multi-devises vit dans `financial`.
   */
  currency: CurrencyContext
  /**
   * Décisions financières multi-devises CENTRALISÉES (regroupabilité courante,
   * inter-période, paiements, rentabilité). L'UI et la couche serveur s'y
   * réfèrent au lieu d'éparpiller des booléens. DetailFlow ne convertit jamais
   * de change : rien n'est agrégé hors d'une devise unique et cohérente.
   */
  financial: FinancialContext
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

  // Contexte tenant d'abord : le fuseau détermine la DATE MÉTIER (donc les
  // bornes de période), la devise comptable sert au repli des documents legacy.
  const { timeZone, accountingCurrency } = await queryTenantContext(cid)
  const { current, previous, granularity } = resolvePeriodRange(period, now, timeZone)

  const needEssentials = access.showEssentials
  const needProfit = access.showProfitability
  const needAdvanced = access.showAdvanced

  // ÉTAPE 1 — Résoudre les devises AVANT toute agrégation financière : on ne
  // calcule JAMAIS un total qui serait de toute façon invalide (§ « ne pas
  // agréger puis masquer »). Présences peu coûteuses (comptages groupés).
  //  - factures courantes (CA, panier, séries, CA/prestation) ;
  //  - factures précédentes (évolutions) — uniquement si l'offre avancée ;
  //  - paiements courants (encaissements) — uniquement si essentiels.
  const [currentInvPresence, previousInvPresence, paymentsPresence] = await Promise.all([
    queryCurrencyPresence(cid, current),
    needAdvanced ? queryCurrencyPresence(cid, previous) : Promise.resolve(null),
    needEssentials ? queryPaymentsCurrencyPresence(cid, current) : Promise.resolve(null),
  ])
  const currency = resolveCurrencyContext({ accountingCurrency, presence: currentInvPresence })
  const financial = resolveFinancialContext({
    accountingCurrency,
    current: currentInvPresence,
    previous: previousInvPresence,
    payments: paymentsPresence,
  })

  // ÉTAPE 2 — Agrégations, GATÉES par le contexte devise résolu ci-dessus.

  // Bloc essentiels (courant). Non financier toujours ; financier facturé
  // seulement si regroupable ; encaissements seulement si paiements regroupables.
  const essentialsPromise: Promise<AnalyseEssentials | null> = needEssentials
    ? (async () => {
        const [appts, clientRows, site, revBundle, collected] = await Promise.all([
          queryAppointmentCounts(cid, current),
          queryClientHistory(cid, current.end),
          querySiteStats(cid, current),
          financial.currentComparable
            ? Promise.all([
                queryInvoicedRevenueCents(cid, current),
                queryRevenueSeries(cid, current, granularity),
                queryPaidInvoiceAggregate(cid, current),
              ])
            : Promise.resolve(null),
          financial.paymentsComparable ? queryCollected(cid, current) : Promise.resolve(null),
        ])
        const paidAgg = revBundle ? revBundle[2] : { totalCents: 0, count: 0 }
        return {
          invoicedRevenueCents: revBundle ? revBundle[0] : null,
          revenueSeries: revBundle ? revBundle[1] : [],
          granularity,
          appointments: appts,
          appointmentsTotal: appointmentsTotal(appts),
          averageBasketCents: revBundle
            ? averageBasketCents({ paidInvoiceTotalCents: paidAgg.totalCents, paidInvoiceCount: paidAgg.count })
            : null,
          paidInvoiceCount: paidAgg.count,
          clients: classifyClients(clientRows, current),
          collected: collected
            ? { grossCents: collected.grossCents, refundedCents: collected.refundedCents, netCents: collected.netCents }
            : null,
          site: { uniqueVisitors: site.uniqueVisitors, pageViews: site.pageViews },
        }
      })()
    : Promise.resolve(null)

  // Bloc rentabilité (courant). Calculé UNIQUEMENT si le CA est regroupable ET
  // dans la devise comptable (les coûts produits sont implicitement comptables).
  // Sinon : objet présent mais non comparable → l'UI affiche un message.
  const profitPromise: Promise<AnalyseProfitability | null> = needProfit
    ? (async () => {
        const currencyCode = financial.invoiceCurrency ?? financial.accountingCurrency
        if (!financial.profitabilityComparable) {
          return { comparable: false, invoicedRevenueCents: null, productCostsCents: null, resultCents: null, currencyCode }
        }
        const [invoicedRevenueCents, productCostsCents] = await Promise.all([
          queryInvoicedRevenueCents(cid, current),
          queryProductCostsCents(cid, current),
        ])
        return {
          comparable: true,
          invoicedRevenueCents,
          productCostsCents,
          resultCents: estimatedResultCents(invoicedRevenueCents, productCostsCents),
          currencyCode,
        }
      })()
    : Promise.resolve(null)

  // Bloc avancé : comparaisons vs période précédente + prestations + conversion.
  // Le CA/panier précédents ne sont lus QUE si les périodes sont comparables
  // (même devise) ; le CA par prestation QUE si la période courante est regroupable.
  const advancedPromise: Promise<{
    prevBundle: [number, { totalCents: number; count: number }] | null
    prevAppts: AppointmentCounts
    prevClients: ClientStats
    serviceVolume: ServiceShare[]
    serviceRevenue: ServiceShare[]
    siteFull: Awaited<ReturnType<typeof querySiteStats>>
  } | null> = needAdvanced
    ? (async () => {
        const [prevBundle, prevAppts, prevClientRows, serviceVolume, serviceRevenue, siteFull] = await Promise.all([
          financial.periodsComparable
            ? Promise.all([queryInvoicedRevenueCents(cid, previous), queryPaidInvoiceAggregate(cid, previous)])
            : Promise.resolve(null),
          queryAppointmentCounts(cid, previous),
          queryClientHistory(cid, previous.end),
          queryServiceVolume(cid, current),
          financial.currentComparable ? queryServiceRevenue(cid, current) : Promise.resolve([] as ServiceShare[]),
          querySiteStats(cid, current),
        ])
        return {
          prevBundle,
          prevAppts,
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
    const prevRevenue = advancedRaw.prevBundle ? advancedRaw.prevBundle[0] : null
    const prevPaid = advancedRaw.prevBundle ? advancedRaw.prevBundle[1] : null
    const prevBasket = prevPaid
      ? averageBasketCents({ paidInvoiceTotalCents: prevPaid.totalCents, paidInvoiceCount: prevPaid.count })
      : null
    const topVolume = advancedRaw.serviceVolume[0] ?? null
    const totalServiceRevenue = advancedRaw.serviceRevenue.reduce((s, x) => s + x.value, 0)
    const topRevenue = advancedRaw.serviceRevenue[0] ?? null

    // Évolutions financières : UNIQUEMENT si les périodes sont comparables
    // (même devise). Jamais de % entre EUR et CHF (aucune conversion FX).
    const revenueChange =
      financial.periodsComparable && essentials.invoicedRevenueCents !== null && prevRevenue !== null
        ? computeChange(essentials.invoicedRevenueCents, prevRevenue)
        : null
    const basketChange =
      financial.periodsComparable && essentials.averageBasketCents !== null && prevBasket !== null
        ? computeChange(essentials.averageBasketCents, prevBasket)
        : null

    const insights = buildBusinessInsights({
      // Devise résolue + regroupabilité : aucun insight financier n'est émis en
      // multi-devises, aucune évolution entre devises différentes, aucun € codé en dur.
      currencyCode: financial.invoiceCurrency,
      monetaryComparable: financial.currentComparable,
      periodsComparable: financial.periodsComparable,
      revenue: { currentCents: essentials.invoicedRevenueCents ?? 0, previousCents: prevRevenue ?? 0 },
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
      revenueChange,
      appointmentsChange: computeChange(essentials.appointmentsTotal, appointmentsTotal(advancedRaw.prevAppts)),
      basketChange,
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

  return { period, current, previous, granularity, currency, financial, essentials, profitability, advanced }
}

/** Variante « contexte » : résout le companyId côté serveur si non fourni. */
export async function loadAnalyseDataForCurrentTenant(
  period: AnalysePeriod,
  access: AnalyseAccess,
): Promise<AnalyseData> {
  const cid = await requireCompanyId()
  return loadAnalyseData(cid, period, access)
}
