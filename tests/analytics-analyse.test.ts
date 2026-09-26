import { describe, expect, it } from "vitest"
import {
  ANALYSE_PERIODS,
  parsePeriod,
  resolvePeriodRange,
  buildBucketKeys,
  fillSeries,
  computeChange,
  addDays,
  addMonths,
} from "@/lib/analytics/periods"
import {
  sumNetRevenueCents,
  averageBasketCents,
  appointmentsTotal,
  cancellationRate,
  scheduledAppointments,
  classifyClients,
  toShares,
  conversionRate,
  estimatedResultCents,
  type ClientBookingRow,
} from "@/lib/analytics/metrics"
import { buildBusinessInsights, type InsightInput } from "@/lib/analytics/insights"
import { resolveAnalyseAccess } from "@/lib/analytics/access"

/* ------------------------------- Périodes -------------------------------- */

describe("periods — validation & bornes", () => {
  it("parsePeriod refuse toute valeur inconnue et retombe sur 30 jours", () => {
    expect(parsePeriod("banane")).toBe("30d")
    expect(parsePeriod(undefined)).toBe("30d")
    expect(parsePeriod(42)).toBe("30d")
    for (const p of ANALYSE_PERIODS) expect(parsePeriod(p)).toBe(p)
  })

  it("30 jours : fenêtre de 30 jours, granularité quotidienne, période précédente contiguë", () => {
    const now = new Date("2026-03-31T10:00:00Z")
    const r = resolvePeriodRange("30d", now)
    expect(r.current).toEqual({ start: "2026-03-02", end: "2026-03-31" })
    expect(r.granularity).toBe("day")
    // 30 jours précédents, immédiatement avant le début courant.
    expect(r.previous.end).toBe(addDays(r.current.start, -1))
    expect(r.previous).toEqual({ start: "2026-01-31", end: "2026-03-01" })
  })

  it("cette année : year-to-date comparé au même intervalle N-1, granularité mensuelle", () => {
    const now = new Date("2026-03-15T10:00:00Z")
    const r = resolvePeriodRange("year", now)
    expect(r.current).toEqual({ start: "2026-01-01", end: "2026-03-15" })
    expect(r.previous).toEqual({ start: "2025-01-01", end: "2025-03-15" })
    expect(r.granularity).toBe("month")
  })

  it("addMonths borne le jour au dernier jour du mois cible (31 janv → 28/29 févr)", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28")
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29") // année bissextile
  })

  it("buildBucketKeys + fillSeries produisent une série continue sans trous", () => {
    const range = { start: "2026-01-01", end: "2026-01-05" }
    const keys = buildBucketKeys(range, "day")
    expect(keys).toEqual(["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05"])
    const filled = fillSeries(keys, [{ bucket: "2026-01-03", totalCents: 500 }])
    expect(filled.map((f) => f.totalCents)).toEqual([0, 0, 500, 0, 0])
  })

  it("computeChange gère 0 → valeur (new), valeur → 0 (down), et aucune donnée (none)", () => {
    expect(computeChange(100, 0)).toEqual({ pct: null, kind: "new" })
    expect(computeChange(0, 0)).toEqual({ pct: null, kind: "none" })
    expect(computeChange(150, 100)).toEqual({ pct: 50, kind: "up" })
    expect(computeChange(50, 100)).toEqual({ pct: -50, kind: "down" })
    expect(computeChange(100, 100)).toEqual({ pct: 0, kind: "flat" })
  })
})

/* -------------------------------- Métriques ------------------------------ */

describe("metrics — règles financières dérivées", () => {
  it("CA net : facture 500 € − avoir 100 € = 400 €", () => {
    expect(
      sumNetRevenueCents([
        { documentType: "invoice", totalCents: 50000 },
        { documentType: "credit_note", totalCents: 10000 },
      ]),
    ).toBe(40000)
  })

  it("panier moyen : null si aucune facture, moyenne arrondie sinon", () => {
    expect(averageBasketCents({ paidInvoiceTotalCents: 0, paidInvoiceCount: 0 })).toBeNull()
    expect(averageBasketCents({ paidInvoiceTotalCents: 30000, paidInvoiceCount: 4 })).toBe(7500)
  })

  it("rendez-vous : total = confirmés + réalisés ; pending_deposit exclu", () => {
    const c = { completed: 3, confirmed: 2, cancelled: 1, pendingDeposit: 5 }
    expect(appointmentsTotal(c)).toBe(5)
    expect(scheduledAppointments(c)).toBe(6)
    expect(cancellationRate(c)).toBe(17) // 1 / 6 ≈ 16.7 → 17
    expect(cancellationRate({ completed: 0, confirmed: 0, cancelled: 0, pendingDeposit: 3 })).toBeNull()
  })

  it("classifyClients : nouveaux vs récurrents par identité, hors annulés/démo", () => {
    const rows: ClientBookingRow[] = [
      // Client A : premier RDV avant la période → récurrent
      { email: "a@x.fr", phone: null, date: "2025-12-01", status: "completed" },
      { email: "A@X.fr", phone: null, date: "2026-01-10", status: "confirmed" },
      // Client B : premier RDV dans la période → nouveau
      { email: null, phone: "0600000001", date: "2026-01-05", status: "completed" },
      // Client C : annulé → ignoré
      { email: "c@x.fr", phone: null, date: "2026-01-06", status: "cancelled" },
      // Client D : démo → ignoré
      { email: "d@x.fr", phone: null, date: "2026-01-07", status: "completed", isDemoData: true },
      // Sans identité → ignoré
      { email: null, phone: null, date: "2026-01-08", status: "completed" },
    ]
    const stats = classifyClients(rows, { start: "2026-01-01", end: "2026-01-31" })
    expect(stats).toEqual({ activeClients: 2, newClients: 1, returningClients: 1 })
  })

  it("toShares : filtre les zéros, calcule les parts, trie décroissant", () => {
    const shares = toShares([
      { name: "Lavage", value: 6 },
      { name: "Cire", value: 2 },
      { name: "Vide", value: 0 },
    ])
    expect(shares.map((s) => s.name)).toEqual(["Lavage", "Cire"])
    expect(shares[0].share).toBe(75)
    expect(shares[1].share).toBe(25)
  })

  it("conversion & résultat estimé", () => {
    expect(conversionRate(0, 0)).toBeNull()
    expect(conversionRate(3, 200)).toBe(1.5)
    expect(estimatedResultCents(40000, 12000)).toBe(28000)
  })
})

/* -------------------------------- Insights ------------------------------- */

describe("insights — seuils & absence d'hallucination", () => {
  const base: InsightInput = {
    revenue: { currentCents: 0, previousCents: 0 },
    averageBasket: { currentCents: null, previousCents: null, invoiceCount: 0 },
    appointments: { scheduled: 0, cancelled: 0 },
    topServiceByVolume: null,
    topServiceByRevenue: null,
    site: { uniqueVisitors: 0, bookingsCompleted: 0 },
  }

  it("aucune donnée → un seul message neutre, jamais un conseil inventé", () => {
    const out = buildBusinessInsights(base)
    expect(out).toHaveLength(1)
    expect(out[0].metric).toBe("empty")
    expect(out[0].type).toBe("neutral")
  })

  it("variation de CA sous le seuil (10 %) → aucun insight CA", () => {
    const out = buildBusinessInsights({ ...base, revenue: { currentCents: 10500, previousCents: 10000 } })
    expect(out.some((i) => i.metric === "revenue")).toBe(false)
  })

  it("CA +25 % → insight positif ; -30 % → insight attention", () => {
    const up = buildBusinessInsights({ ...base, revenue: { currentCents: 12500, previousCents: 10000 } })
    expect(up.find((i) => i.metric === "revenue")?.type).toBe("positive")
    const down = buildBusinessInsights({ ...base, revenue: { currentCents: 7000, previousCents: 10000 } })
    expect(down.find((i) => i.metric === "revenue")?.type).toBe("attention")
  })

  it("prestation contributrice : seuil de part de CA à 25 %", () => {
    const out = buildBusinessInsights({
      ...base,
      topServiceByRevenue: { name: "Rénovation", revenueCents: 30000, totalRevenueCents: 100000 },
    })
    const insight = out.find((i) => i.metric === "top_service_revenue")
    expect(insight?.message).toContain("Rénovation")
    expect(insight?.message).toContain("30")
  })
})

/* --------------------------------- Accès --------------------------------- */

describe("access — gating serveur par features (jamais par plan)", () => {
  it("aucune feature → page verrouillée (jamais 404)", () => {
    const a = resolveAnalyseAccess({ businessStats: false, profitability: false, advanced: false })
    expect(a).toEqual({ locked: true, showEssentials: false, showProfitability: false, showAdvanced: false })
  })

  it("business_stats seul → essentiels visibles, reste masqué", () => {
    const a = resolveAnalyseAccess({ businessStats: true, profitability: false, advanced: false })
    expect(a).toEqual({ locked: false, showEssentials: true, showProfitability: false, showAdvanced: false })
  })

  it("advanced_reporting implique l'affichage des essentiels", () => {
    const a = resolveAnalyseAccess({ businessStats: false, profitability: false, advanced: true })
    expect(a.showEssentials).toBe(true)
    expect(a.showAdvanced).toBe(true)
    expect(a.locked).toBe(false)
  })

  it("profitability_analysis seul → rentabilité visible sans avancé", () => {
    const a = resolveAnalyseAccess({ businessStats: false, profitability: true, advanced: false })
    expect(a).toEqual({ locked: false, showEssentials: false, showProfitability: true, showAdvanced: false })
  })
})
