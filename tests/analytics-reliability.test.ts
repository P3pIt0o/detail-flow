import { describe, expect, it } from "vitest"
import { businessToday, resolvePeriodRange } from "@/lib/analytics/periods"
import { resolveCurrencyContext, resolveFinancialContext, normalizeCurrencyCode } from "@/lib/analytics/currency"
import { classifyClients } from "@/lib/analytics/metrics"
import { buildBusinessInsights } from "@/lib/analytics/insights"

const single = (code: string) => ({ explicitCodes: [code], hasLegacy: false })
const empty = { explicitCodes: [] as string[], hasLegacy: false }

/**
 * PATCH DE FIABILISATION — Module Analyse.
 * Couvre : devise (résolution + multi-devises sans FX), insights sans € codé en
 * dur, classification clients (pending_deposit exclu), et DATE MÉTIER par fuseau.
 */

describe("devise — résolution du contexte (aucune conversion FX)", () => {
  it("EUR seul → regroupable, affiché en EUR", () => {
    const ctx = resolveCurrencyContext({
      accountingCurrency: "EUR",
      presence: { explicitCodes: ["EUR", "EUR"], hasLegacy: false },
    })
    expect(ctx.mixed).toBe(false)
    expect(ctx.displayCurrency).toBe("EUR")
    expect(ctx.presentCurrencies).toEqual(["EUR"])
  })

  it("CHF seul → regroupable, affiché en CHF", () => {
    const ctx = resolveCurrencyContext({
      accountingCurrency: "CHF",
      presence: { explicitCodes: ["CHF"], hasLegacy: false },
    })
    expect(ctx.mixed).toBe(false)
    expect(ctx.displayCurrency).toBe("CHF")
    expect(ctx.presentCurrencies).toEqual(["CHF"])
  })

  it("legacy (currencyCode NULL) → replié sur la devise comptable du tenant", () => {
    const ctx = resolveCurrencyContext({
      accountingCurrency: "CHF",
      presence: { explicitCodes: [], hasLegacy: true },
    })
    expect(ctx.mixed).toBe(false)
    expect(ctx.displayCurrency).toBe("CHF")
    expect(ctx.presentCurrencies).toEqual(["CHF"])
  })

  it("legacy sans devise comptable confirmée → repli EUR (comportement historique)", () => {
    const ctx = resolveCurrencyContext({
      accountingCurrency: null,
      presence: { explicitCodes: [], hasLegacy: true },
    })
    expect(ctx.mixed).toBe(false)
    expect(ctx.displayCurrency).toBe("EUR")
  })

  it("EUR + CHF → INCOMPATIBLE : jamais de total combiné", () => {
    const ctx = resolveCurrencyContext({
      accountingCurrency: "EUR",
      presence: { explicitCodes: ["EUR", "CHF"], hasLegacy: false },
    })
    expect(ctx.mixed).toBe(true)
    expect(ctx.displayCurrency).toBeNull()
    expect(ctx.presentCurrencies).toEqual(["CHF", "EUR"])
  })

  it("EUR explicite + legacy replié sur EUR → une seule devise effective", () => {
    const ctx = resolveCurrencyContext({
      accountingCurrency: "EUR",
      presence: { explicitCodes: ["EUR"], hasLegacy: true },
    })
    expect(ctx.mixed).toBe(false)
    expect(ctx.displayCurrency).toBe("EUR")
  })

  it("CHF explicite + legacy replié sur EUR (comptable non confirmée) → mixte", () => {
    const ctx = resolveCurrencyContext({
      accountingCurrency: null,
      presence: { explicitCodes: ["CHF"], hasLegacy: true },
    })
    expect(ctx.mixed).toBe(true)
    expect(ctx.displayCurrency).toBeNull()
    expect(ctx.presentCurrencies).toEqual(["CHF", "EUR"])
  })

  it("aucun document → 0 affiché dans la devise comptable", () => {
    const ctx = resolveCurrencyContext({
      accountingCurrency: "CHF",
      presence: { explicitCodes: [], hasLegacy: false },
    })
    expect(ctx.mixed).toBe(false)
    expect(ctx.displayCurrency).toBe("CHF")
  })

  it("normalizeCurrencyCode : trim + majuscules, vide sinon", () => {
    expect(normalizeCurrencyCode(" chf ")).toBe("CHF")
    expect(normalizeCurrencyCode(null)).toBe("")
    expect(normalizeCurrencyCode("")).toBe("")
  })
})

describe("contexte financier — comparaison current/previous (aucune conversion FX)", () => {
  it("current EUR + previous EUR → périodes comparables", () => {
    const fin = resolveFinancialContext({
      accountingCurrency: "EUR",
      current: single("EUR"),
      previous: single("EUR"),
    })
    expect(fin.currentComparable).toBe(true)
    expect(fin.previousComparable).toBe(true)
    expect(fin.periodsComparable).toBe(true)
  })

  it("current CHF + previous CHF → périodes comparables", () => {
    const fin = resolveFinancialContext({
      accountingCurrency: "CHF",
      current: single("CHF"),
      previous: single("CHF"),
    })
    expect(fin.periodsComparable).toBe(true)
  })

  it("current EUR + previous CHF → comparaison financière INTERDITE", () => {
    const fin = resolveFinancialContext({
      accountingCurrency: "EUR",
      current: single("EUR"),
      previous: single("CHF"),
    })
    expect(fin.currentComparable).toBe(true)
    expect(fin.previousComparable).toBe(true)
    // Devises différentes de part et d'autre → aucune évolution possible.
    expect(fin.periodsComparable).toBe(false)
  })

  it("current mixed → comparaison interdite (et courant non regroupable)", () => {
    const fin = resolveFinancialContext({
      accountingCurrency: "EUR",
      current: { explicitCodes: ["EUR", "CHF"], hasLegacy: false },
      previous: single("EUR"),
    })
    expect(fin.currentComparable).toBe(false)
    expect(fin.periodsComparable).toBe(false)
  })

  it("previous mixed → comparaison interdite", () => {
    const fin = resolveFinancialContext({
      accountingCurrency: "EUR",
      current: single("EUR"),
      previous: { explicitCodes: ["EUR", "CHF"], hasLegacy: false },
    })
    expect(fin.currentComparable).toBe(true)
    expect(fin.previousComparable).toBe(false)
    expect(fin.periodsComparable).toBe(false)
  })

  it("previous vide (aucun document) → comparaison autorisée (croissance depuis zéro)", () => {
    const fin = resolveFinancialContext({
      accountingCurrency: "EUR",
      current: single("EUR"),
      previous: empty,
    })
    expect(fin.periodsComparable).toBe(true)
  })

  it("previous non chargé (offre non avancée) → aucune comparaison", () => {
    const fin = resolveFinancialContext({ accountingCurrency: "EUR", current: single("EUR"), previous: null })
    expect(fin.periodsComparable).toBe(false)
  })
})

describe("contexte financier — paiements multi-devises (indépendants des factures)", () => {
  it("paiements EUR seul → total autorisé, devise EUR", () => {
    const fin = resolveFinancialContext({
      accountingCurrency: "EUR",
      current: single("EUR"),
      payments: single("EUR"),
    })
    expect(fin.paymentsComparable).toBe(true)
    expect(fin.paymentsCurrency).toBe("EUR")
  })

  it("paiements CHF seul → total autorisé, devise CHF", () => {
    const fin = resolveFinancialContext({
      accountingCurrency: "CHF",
      current: single("CHF"),
      payments: single("CHF"),
    })
    expect(fin.paymentsComparable).toBe(true)
    expect(fin.paymentsCurrency).toBe("CHF")
  })

  it("paiements EUR + CHF → aucun total encaissé combiné", () => {
    const fin = resolveFinancialContext({
      accountingCurrency: "EUR",
      current: single("EUR"),
      payments: { explicitCodes: ["EUR", "CHF"], hasLegacy: false },
    })
    expect(fin.paymentsComparable).toBe(false)
    expect(fin.paymentsCurrency).toBeNull()
    expect(fin.paymentCurrencies).toEqual(["CHF", "EUR"])
  })

  it("factures EUR mais paiements CHF → CA regroupable, encaissements regroupables séparément", () => {
    // Les devises FACTURES et PAIEMENTS sont indépendantes.
    const fin = resolveFinancialContext({
      accountingCurrency: "EUR",
      current: single("EUR"),
      payments: single("CHF"),
    })
    expect(fin.invoiceCurrency).toBe("EUR")
    expect(fin.paymentsComparable).toBe(true)
    expect(fin.paymentsCurrency).toBe("CHF")
  })

  it("paiements non chargés → non regroupables (rien à afficher)", () => {
    const fin = resolveFinancialContext({ accountingCurrency: "EUR", current: single("EUR"), payments: null })
    expect(fin.paymentsComparable).toBe(false)
  })
})

describe("contexte financier — rentabilité (CA vs devise comptable des coûts)", () => {
  it("comptable EUR + CA EUR → rentabilité calculable", () => {
    const fin = resolveFinancialContext({ accountingCurrency: "EUR", current: single("EUR") })
    expect(fin.profitabilityComparable).toBe(true)
  })

  it("comptable CHF + CA CHF → rentabilité calculable", () => {
    const fin = resolveFinancialContext({ accountingCurrency: "CHF", current: single("CHF") })
    expect(fin.profitabilityComparable).toBe(true)
  })

  it("comptable EUR + CA CHF → PAS de rentabilité (coûts implicitement EUR)", () => {
    const fin = resolveFinancialContext({ accountingCurrency: "EUR", current: single("CHF") })
    expect(fin.profitabilityComparable).toBe(false)
  })

  it("legacy EUR (comptable non confirmée) → comportement legacy préservé", () => {
    // accountingCurrency null + documents legacy → repli EUR de part et d'autre.
    const fin = resolveFinancialContext({
      accountingCurrency: null,
      current: { explicitCodes: [], hasLegacy: true },
    })
    expect(fin.invoiceCurrency).toBe("EUR")
    expect(fin.profitabilityComparable).toBe(true)
  })

  it("comptable null + CA CHF explicite → coûts implicitement EUR → PAS de rentabilité", () => {
    const fin = resolveFinancialContext({ accountingCurrency: null, current: single("CHF") })
    expect(fin.profitabilityComparable).toBe(false)
  })

  it("current mixed → jamais de rentabilité", () => {
    const fin = resolveFinancialContext({
      accountingCurrency: "EUR",
      current: { explicitCodes: ["EUR", "CHF"], hasLegacy: false },
    })
    expect(fin.profitabilityComparable).toBe(false)
  })
})

describe("insights — évolution bloquée entre devises différentes", () => {
  const base = {
    revenue: { currentCents: 500000, previousCents: 250000 },
    averageBasket: { currentCents: 8000, previousCents: 5000, invoiceCount: 12 },
    appointments: { scheduled: 40, cancelled: 2 },
    topServiceByVolume: { name: "Lavage", count: 20 },
    topServiceByRevenue: { name: "Lavage", revenueCents: 300000, totalRevenueCents: 500000 },
    site: { uniqueVisitors: 100, bookingsCompleted: 10 },
  }

  it("periodsComparable=false → aucun insight d'évolution CA/panier", () => {
    const insights = buildBusinessInsights({
      ...base,
      currencyCode: "EUR",
      monetaryComparable: true,
      periodsComparable: false,
    })
    expect(insights.some((i) => i.metric === "revenue")).toBe(false)
    expect(insights.some((i) => i.metric === "average_basket")).toBe(false)
    // La part de CA d'une prestation (intra-période) reste possible.
    expect(insights.some((i) => i.metric === "top_service_revenue")).toBe(true)
  })

  it("periodsComparable=true → évolution CA émise", () => {
    const insights = buildBusinessInsights({
      ...base,
      currencyCode: "EUR",
      monetaryComparable: true,
      periodsComparable: true,
    })
    expect(insights.some((i) => i.metric === "revenue")).toBe(true)
  })
})

describe("insights — pas de € codé en dur (formatage via devise résolue)", () => {
  const base = {
    revenue: { currentCents: 500000, previousCents: 250000 },
    averageBasket: { currentCents: 8000, previousCents: 5000, invoiceCount: 12 },
    appointments: { scheduled: 40, cancelled: 2 },
    topServiceByVolume: { name: "Lavage", count: 20 },
    topServiceByRevenue: { name: "Lavage", revenueCents: 300000, totalRevenueCents: 500000 },
    site: { uniqueVisitors: 100, bookingsCompleted: 10 },
  }

  it("insights financiers affichent CHF quand le tenant est en CHF", () => {
    const insights = buildBusinessInsights({ ...base, currencyCode: "CHF", monetaryComparable: true })
    for (const i of insights) {
      expect(i.message).not.toContain("€")
    }
    expect(insights.some((i) => i.message.includes("CHF"))).toBe(true)
  })

  it("insights financiers affichent € quand le tenant est en EUR", () => {
    const insights = buildBusinessInsights({ ...base, currencyCode: "EUR", monetaryComparable: true })
    expect(insights.some((i) => i.message.includes("€"))).toBe(true)
  })

  it("multi-devises : aucun insight monétaire regroupé (montants non comparables)", () => {
    const insights = buildBusinessInsights({ ...base, currencyCode: null, monetaryComparable: false })
    // Aucun insight ne doit afficher un € ni un total agrégé trompeur.
    expect(insights.every((i) => !i.message.includes("€"))).toBe(true)
    // Les insights non financiers restent produits (prestation volume, annulations…).
    expect(insights.some((i) => i.metric === "top_service_volume" || i.metric === "cancellation_rate")).toBe(true)
  })
})

describe("clients — pending_deposit n'est pas une activité client", () => {
  const range = { start: "2024-06-01", end: "2024-06-30" }

  it("un client uniquement pending_deposit ne devient pas un nouveau client", () => {
    const stats = classifyClients(
      [{ email: "a@x.com", phone: null, date: "2024-06-10", status: "pending_deposit" }],
      range,
    )
    expect(stats.newClients).toBe(0)
    expect(stats.activeClients).toBe(0)
    expect(stats.returningClients).toBe(0)
  })

  it("confirmed compte comme activité client", () => {
    const stats = classifyClients(
      [{ email: "a@x.com", phone: null, date: "2024-06-10", status: "confirmed" }],
      range,
    )
    expect(stats.newClients).toBe(1)
    expect(stats.activeClients).toBe(1)
  })

  it("completed compte comme activité client", () => {
    const stats = classifyClients(
      [{ email: "b@x.com", phone: null, date: "2024-06-12", status: "completed" }],
      range,
    )
    expect(stats.newClients).toBe(1)
    expect(stats.activeClients).toBe(1)
  })

  it("client avec un historique confirmé antérieur → récurrent, pas nouveau", () => {
    const stats = classifyClients(
      [
        { email: "c@x.com", phone: null, date: "2024-01-05", status: "completed" },
        { email: "c@x.com", phone: null, date: "2024-06-15", status: "confirmed" },
      ],
      range,
    )
    expect(stats.returningClients).toBe(1)
    expect(stats.newClients).toBe(0)
  })
})

describe("date métier — fuseau du tenant (pas UTC)", () => {
  it("Europe/Paris : 23h30 UTC en été = déjà le lendemain à Paris (UTC+2)", () => {
    // 2024-07-15T23:30:00Z → 2024-07-16 01:30 à Paris.
    const now = new Date("2024-07-15T23:30:00Z")
    expect(businessToday(now, "Europe/Paris")).toBe("2024-07-16")
  })

  it("Europe/Paris : 00h30 heure de Paris utilise le nouveau jour français", () => {
    // Hiver (UTC+1) : 2024-01-14T23:30:00Z → 2024-01-15 00:30 à Paris.
    const now = new Date("2024-01-14T23:30:00Z")
    expect(businessToday(now, "Europe/Paris")).toBe("2024-01-15")
  })

  it("Europe/Zurich : même bascule de jour que Paris (UTC+2 en été)", () => {
    const now = new Date("2024-07-15T22:30:00Z")
    expect(businessToday(now, "Europe/Zurich")).toBe("2024-07-16")
  })

  it("fuseau invalide → repli sûr sur la date UTC (aucune exception)", () => {
    const now = new Date("2024-07-15T10:00:00Z")
    expect(businessToday(now, "Not/AZone")).toBe("2024-07-15")
  })

  it("resolvePeriodRange 30j utilise la date métier du fuseau", () => {
    const now = new Date("2024-07-15T23:30:00Z") // = 2024-07-16 à Paris
    const r = resolvePeriodRange("30d", now, "Europe/Paris")
    expect(r.current.end).toBe("2024-07-16")
    expect(r.current.start).toBe("2024-06-17") // 30 jours inclusifs
  })
})
