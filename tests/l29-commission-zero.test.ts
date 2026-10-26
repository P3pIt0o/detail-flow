import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import {
  COMMISSION_RULES,
  LIFETIME_COMMISSION_RULE,
  computeCappedPlatformFeeCents,
  displayedCommissionFeeBps,
  resolveCommercialCommission,
} from "@/lib/billing/commercial-rules"
import { HELP } from "@/lib/customer-subscriptions/admin-labels"
import { CUSTOMER_SUBSCRIPTION_PLATFORM_FEE_BPS, getCustomerSubscriptionPlatformFeeBps } from "@/lib/customer-subscriptions/plan-policy"
import { resolvePlatformFeeBps } from "@/lib/customer-subscriptions/contract"
import { buildCheckoutSessionParams, type ContractForCheckout } from "@/lib/customer-subscriptions/stripe-mapping"
import { COMMERCIAL_PLANS } from "@/lib/pricing/plans"
import { COMPARE_CATEGORIES } from "@/components/marketing/v4/pricing-data"
import { LANDING_FAQ } from "@/components/marketing/v4/faq-data"
import { FeatureCompare, PlanCard } from "@/components/marketing/v4/pricing"

const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8")
const PAID = ["PRO", "BUSINESS", "ENTERPRISE"] as const
const tenant = (licensePlan: string | null, platformFeeBps: number | null = null, billingMode: string | null = "subscription") => ({
  billingMode,
  licensePlan,
  platformFeeBps,
})
/** Frais d'un paiement : résolution au moment de la réservation, puis plafond mensuel (même chaîne que le registre). */
const feeFor = (t: ReturnType<typeof tenant>, grossAmountCents: number, alreadyConsumedCents = 0) => {
  const c = resolveCommercialCommission(t, 0)
  return computeCappedPlatformFeeCents({ grossAmountCents, feeBps: c.feeBps, monthlyCapCents: c.monthlyFeeCapCents, alreadyConsumedCents })
}

describe("L29 — A9 : paiements en ligne", () => {
  it("PRO / BUSINESS / ENTERPRISE : 0 % et plafond 0", () => {
    for (const plan of PAID) {
      expect(COMMISSION_RULES[plan]).toEqual({ feeBps: 0, monthlyFeeCapCents: 0 })
      expect(feeFor(tenant(plan), 150_000)).toBe(0)
    }
  })

  it("aucun application_fee_amount envoyé quand la commission est nulle", () => {
    const src = read("lib/payments/providers.ts")
    expect(src).toMatch(/input\.applicationFeeCents > 0\s*\?\s*\{ application_fee_amount: input\.applicationFeeCents/)
  })

  it("FREE inchangé : 2 % au centime, plafond 19,90 € atteint puis dépassé", () => {
    expect(COMMISSION_RULES.FREE).toEqual({ feeBps: 200, monthlyFeeCapCents: 1990 })
    expect(feeFor(tenant("FREE"), 12_345)).toBe(247) // 246,9 → 247
    expect(feeFor(tenant("FREE"), 10_000, 1900)).toBe(90) // plafond atteint
    expect(feeFor(tenant("FREE"), 10_000, 1990)).toBe(0) // plafond dépassé
  })

  it("Lifetime : 0 % inchangé, même sur un plan payant", () => {
    expect(LIFETIME_COMMISSION_RULE).toEqual({ feeBps: 0, monthlyFeeCapCents: 0 })
    expect(feeFor(tenant("BUSINESS", null, "lifetime"), 50_000)).toBe(0)
  })

  it("tenant A FREE et tenant B PRO : aucun effet croisé", () => {
    const a = tenant("FREE")
    const b = tenant("PRO")
    expect(feeFor(a, 10_000)).toBe(200)
    expect(feeFor(b, 10_000)).toBe(0)
    expect(feeFor(a, 10_000)).toBe(200)
  })

  it("override super-admin : neutralisé sur les offres payantes (plafond 0), actif sur FREE", () => {
    for (const plan of PAID) {
      const c = resolveCommercialCommission(tenant(plan, 300), 0)
      expect(c).toEqual({ feeBps: 300, monthlyFeeCapCents: 0, source: "override" })
      expect(feeFor(tenant(plan, 300), 10_000)).toBe(0)
    }
    expect(feeFor(tenant("FREE", 300), 10_000)).toBe(300)
  })
})

const contract: ContractForCheckout = {
  id: 1,
  companyId: 1,
  status: "pending_payment",
  paymentMode: "recurring",
  currency: "EUR",
  planNameSnapshot: "Entretien",
  priceCentsSnapshot: 8900,
  billingIntervalUnitSnapshot: "month",
  billingIntervalCountSnapshot: 1,
  prepaidBillingCyclesSnapshot: 6,
  initialCleaningRequiredSnapshot: false,
  initialServiceNameSnapshot: null,
  initialServicePriceCentsSnapshot: null,
  customerEmail: "client@example.com",
  externalCustomerId: null,
}
const RETURN = "https://tenant.example.com/abonnement/retour?session_id={CHECKOUT_SESSION_ID}"

describe("L29 — A10 : abonnements clients", () => {
  it("PRO / BUSINESS / ENTERPRISE : 0, aucun application_fee_* dans le Checkout", () => {
    for (const plan of PAID) {
      expect(CUSTOMER_SUBSCRIPTION_PLATFORM_FEE_BPS[plan]).toBe(0)
      const bps = resolvePlatformFeeBps(plan)
      expect(bps).toBe(0)
      const recurring = buildCheckoutSessionParams(contract, "recurring", bps, RETURN)
      expect(JSON.stringify(recurring.params)).not.toMatch(/application_fee/)
      expect(recurring.platformFeeAmountCents).toBe(0)
      const prepaid = buildCheckoutSessionParams({ ...contract, paymentMode: "prepaid" }, "prepaid", bps, RETURN)
      expect(JSON.stringify(prepaid.params)).not.toMatch(/application_fee/)
    }
  })

  it("FREE / ESSENTIAL : 7 % inchangé ; LEGACY null : 0 (jamais FREE)", () => {
    expect(resolvePlatformFeeBps("FREE")).toBe(700)
    expect(CUSTOMER_SUBSCRIPTION_PLATFORM_FEE_BPS.ESSENTIAL).toBe(700)
    expect(getCustomerSubscriptionPlatformFeeBps(null)).toBe(0)
    const free = buildCheckoutSessionParams(contract, "recurring", 700, RETURN)
    expect(free.params.subscription_data.application_fee_percent).toBe(7)
    expect(free.platformFeeAmountCents).toBe(623)
  })
})

describe("L29 — A11 / A12 : non-rétroactivité", () => {
  it("le registre fige feeBps à la réservation et ne le réécrit jamais", () => {
    const sources = readdirSync(join(process.cwd(), "lib/payments"))
      .filter((f) => f.endsWith(".ts"))
      .map((f) => read(`lib/payments/${f}`))
      .join("\n")
    expect(sources).not.toMatch(/UPDATE\s+"platform_fee_reservations"[\s\S]{0,200}"feeBps"\s*=/)
    expect(sources).not.toMatch(/\.update\(platformFeeReservations\)[\s\S]{0,200}feeBps/)
    // Capture : le montant réservé est repris tel quel.
    expect(read("lib/payments/queries.ts")).toMatch(/platformFeeBps: reservation\.feeBps/)
  })

  it("downgrade PRO → FREE : les réservations suivantes reprennent 2 %, la précédente garde 0", () => {
    const before = feeFor(tenant("PRO"), 10_000)
    const after = feeFor(tenant("FREE"), 10_000)
    expect(before).toBe(0)
    expect(after).toBe(200)
  })
})

describe("L29 — A13 : textes", () => {
  const byId = Object.fromEntries(COMMERCIAL_PLANS.map((p) => [p.id, p]))
  const nonZero = /(?<![\d,])(?!0 %)\d+(?:,\d+)? ?% de commission/

  it("Indépendant : une seule ligne de commission", () => {
    expect(byId.pro.highlights).toContain("0 % de commission sur vos paiements et abonnements")
    expect(byId.pro.highlights.filter((h) => /commission/.test(h))).toEqual(["0 % de commission sur vos paiements et abonnements"])
  })

  it("Performance : textes de la fiche, ordre conservé", () => {
    expect(byId.ultime.highlights).toEqual([
      "Tout Indépendant",
      "Abonnements clients illimités, 0 % de commission",
      "0 % de commission sur vos paiements en ligne",
      "Gestion des prospects (CRM)",
      "Statistiques avancées et répartition du chiffre d'affaires",
    ])
  })

  it("Essentiel : textes conservés", () => {
    expect(byId.starter.highlights).toEqual(
      expect.arrayContaining([
        "Abonnements clients : 7 % de commission DetailFlow",
        "Paiements en ligne : 2 % de commission DetailFlow, plafonnée à 19,90 €/mois (frais Stripe distincts)",
      ]),
    )
  })

  it("aucune commission non nulle pour Indépendant, Performance et Équipe (rendu serveur)", () => {
    for (const id of ["pro", "ultime", "entreprise"]) {
      const html = renderToStaticMarkup(createElement(PlanCard, { plan: byId[id] }))
      expect(html, id).not.toMatch(nonZero)
      expect(html).not.toMatch(/plafonnée à 5/)
    }
    const row = COMPARE_CATEGORIES.flatMap((c) => c.rows).find((r) => r.label === "Abonnements clients récurrents")
    expect(row?.notes).toEqual({ starter: "2 actifs · 7 % de commission", pro: "10 actifs · 0 % de commission" })
    expect(renderToStaticMarkup(createElement(FeatureCompare))).toContain("10 actifs · 0 % de commission")
  })

  it("FAQ, phrase sous les cartes, Paramètres › Paiements : textes validés mot pour mot", () => {
    expect(LANDING_FAQ.find((f) => f.q === "Comment fonctionne la commission DetailFlow ?")?.a).toBe(
      "Vous ne payez une commission DetailFlow que sur l'offre Essentiel, lorsque vous encaissez en ligne : 2 %, plafonnée à 19,90 €/mois. Indépendant, Performance et Équipe : 0 % de commission. Les frais Stripe restent distincts.",
    )
    expect(read("components/marketing/v4/pricing.tsx").replace(/\s+/g, " ")).toContain(
      "Avec Essentiel, une commission DetailFlow s'applique uniquement lorsque vous encaissez en ligne, plafonnée chaque mois. Indépendant, Performance et Équipe : 0 % de commission. Les frais Stripe restent distincts.",
    )
    expect(read("components/admin/settings/payments-settings.tsx")).toContain(
      "Avec Essentiel, DetailFlow prélève une commission sur chaque paiement encaissé en ligne (2 %, plafonnée à 19,90 €/mois). Avec Indépendant, Performance et Équipe : 0 % de commission. Les frais de traitement Stripe s'appliquent en plus, côté Stripe.",
    )
    expect(JSON.stringify(LANDING_FAQ)).not.toMatch(/Indépendant : 1 %/)
  })
})

describe("L29 — boucle 1 : affichage aligné sur ce qui est prélevé", () => {
  it("badge : un override neutralisé par le plafond 0 s'affiche 0", () => {
    for (const plan of PAID) expect(displayedCommissionFeeBps(resolveCommercialCommission(tenant(plan, 30), 0))).toBe(0)
    expect(displayedCommissionFeeBps(resolveCommercialCommission(tenant("FREE", 30), 0))).toBe(30)
    expect(displayedCommissionFeeBps(resolveCommercialCommission(tenant("FREE"), 0))).toBe(200)
    // Fallback historique sans plafond connu : taux affiché tel quel.
    expect(displayedCommissionFeeBps({ feeBps: 150, monthlyFeeCapCents: null, source: "fallback" })).toBe(150)
  })

  it("Paramètres › Paiements : le pourcentage affiché passe par le helper", () => {
    expect(read("lib/payments/config.ts")).toMatch(/feePercent: formatBpsPercent\(displayedCommissionFeeBps\(commission\)\)/)
  })

  it("HELP.commission : texte validé mot pour mot", () => {
    expect(HELP.commission).toBe(
      "Avec Essentiel, DetailFlow prélève une commission sur chaque paiement d'abonnement. Avec Indépendant, Performance et Équipe : 0 % de commission.",
    )
  })
})
