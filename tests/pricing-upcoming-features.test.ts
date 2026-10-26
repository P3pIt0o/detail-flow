import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { COMMERCIAL_PLANS } from "@/lib/pricing/plans"
import { FEATURE_REGISTRY, PLAN_MATRIX } from "@/lib/licensing/registry"
import { COMMISSION_RULES } from "@/lib/billing/commercial-rules"
import { CUSTOMER_SUBSCRIPTION_PLATFORM_FEE_BPS } from "@/lib/customer-subscriptions/plan-policy"
import { SAAS_ADMIN_CHECKOUT_PLANS } from "@/lib/billing/saas-admin"
import { DESIRED_PLANS } from "@/lib/pricing/desired-plan"
import { COMPARE_CATEGORIES, getPlanUpcomingFeatures } from "@/components/marketing/v4/pricing-data"
import { LANDING_FAQ } from "@/components/marketing/v4/faq-data"

const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8")
const byId = Object.fromEntries(COMMERCIAL_PLANS.map((p) => [p.id, p]))
const rows = COMPARE_CATEGORIES.flatMap((c) => c.rows)
const row = (label: string) => rows.find((r) => r.label === label)

const P6 = ["Automatisations avancées", "Marketing avancé", "Campagnes et relances clients", "Domaine personnalisé"]
const P11 =
  "Ces fonctionnalités sont en préparation. Elles ne sont pas incluses actuellement dans l'offre Performance. Leur disponibilité sera annoncée ultérieurement."

describe("L13 — A1 : fonctions futures séparées des droits", () => {
  it("upcomingFeatures ∩ includedFeatures = ∅ pour chaque offre (par libellé du registre)", () => {
    for (const plan of COMMERCIAL_PLANS) {
      const includedLabels = plan.includedFeatures.map((k) => FEATURE_REGISTRY[k].label)
      for (const label of plan.upcomingFeatures) expect(includedLabels, `${plan.id} : ${label}`).not.toContain(label)
    }
  })

  it("Performance ne promet plus automations ni marketing", () => {
    expect(byId.ultime.includedFeatures).not.toContain("automations")
    expect(byId.ultime.includedFeatures).not.toContain("marketing")
  })

  it("PLAN_MATRIX strictement identique à main @ 0fe7302", () => {
    const hash = createHash("sha256").update(JSON.stringify(PLAN_MATRIX)).digest("hex")
    expect(hash).toBe("87ddd660258a01af2e05849e89224acfb58d556556136b1773595d17e4972e17")
  })
})

describe("L13 — A4 : textes « Prochainement »", () => {
  it("P11 mot pour mot sur Performance uniquement", () => {
    expect(byId.ultime.upcomingNote).toBe(P11)
    for (const id of ["starter", "pro", "entreprise"]) expect(byId[id].upcomingNote).toBeUndefined()
  })

  it("aucune date ni nom de mois", () => {
    const texts = [
      ...COMMERCIAL_PLANS.flatMap((p) => [...p.upcomingFeatures, p.upcomingNote ?? ""]),
      ...(["starter", "pro", "ultime", "entreprise"] as const).flatMap((id) =>
        getPlanUpcomingFeatures(id).flatMap((i) => [i.label, i.description ?? ""]),
      ),
    ]
    for (const t of texts) {
      expect(t).not.toMatch(/(?<!\p{L})(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|trimestre)(?!\p{L})/iu)
      expect(t).not.toMatch(/\d/)
    }
  })
})

describe("L13 — A5 : libellés P6 identiques partout", () => {
  it("cartes : Performance et Équipe", () => {
    expect(byId.ultime.upcomingFeatures).toEqual(P6)
    expect(byId.entreprise.upcomingFeatures).toEqual([
      "Comptes et agendas par collaborateur",
      "Rendez-vous simultanés",
      "Campagnes et relances clients",
      "Domaine personnalisé",
    ])
    expect(byId.starter.upcomingFeatures).toEqual([])
    expect(byId.pro.upcomingFeatures).toEqual([])
  })

  it("comparateur et volet : Campagnes et Domaine en « soon » pour Performance et Équipe", () => {
    for (const label of ["Campagnes et relances clients", "Domaine personnalisé"]) {
      expect(row(label)?.values).toEqual({ starter: false, pro: false, ultime: "soon", entreprise: "soon" })
    }
    expect(rows.some((r) => r.label === "Campagnes & relances clients")).toBe(false)
    expect(getPlanUpcomingFeatures("ultime").map((i) => i.label)).toEqual(["Campagnes et relances clients", "Domaine personnalisé"])
  })

  it("lignes d'équipe : « soon » pour Équipe, aucune coche", () => {
    for (const label of ["Comptes employés", "Agenda par collaborateur", "Rendez-vous simultanés", "Permissions & rôles", "Statistiques par employé"]) {
      expect(row(label)?.values, label).toEqual({ starter: false, pro: false, ultime: false, entreprise: "soon" })
    }
  })

  it("FAQ : les 4 libellés P6, texte validé, réponse domaine exacte", () => {
    const price = LANDING_FAQ.find((f) => f.q === "Combien coûte DetailFlow ?")?.a
    expect(price).toBe(
      "Essentiel est gratuit et disponible dès maintenant. Indépendant coûte 19,90 €/mois avec 30 jours gratuits et est également disponible. Les offres Performance et Équipe sont présentées dans la section Tarifs et seront bientôt disponibles. Automatisations avancées, Marketing avancé, Campagnes et relances clients et Domaine personnalisé sont en préparation et ne sont incluses dans aucune offre actuellement.",
    )
    expect(LANDING_FAQ.find((f) => f.q === "Puis-je utiliser mon propre domaine ?")?.a).toBe(
      "Oui, un domaine peut déjà être relié sur demande, avec notre accompagnement. La gestion autonome du domaine personnalisé depuis votre espace arrive bientôt.",
    )
  })

  it("admin : la liste « Prochainement » vient de la source commerciale", () => {
    const page = read("app/admin/(dashboard)/abonnement/page.tsx")
    expect(page).toMatch(/getCommercialPlanByLicensePlan/)
    expect(page).toMatch(/upcomingFeatures/)
    expect(page).toMatch(/Prochainement/)
    // Revue métier L13 : la mention P11 accompagne la liste admin, comme sur la landing.
    expect(page).toMatch(/upcomingNote/)
  })

  it("encart site sur mesure : domaine « sur demande », jamais présenté comme inclus sans réserve", () => {
    const pricing = read("components/marketing/v4/pricing.tsx")
    expect(pricing).toContain('"Domaine personnalisé (sur demande)"')
    expect(pricing).not.toContain('"Domaine personnalisé",')
  })
})

describe("L13 — A6 / N7 : analyse alignée sur les droits", () => {
  it("CA & panier moyen dès Indépendant ; analyse avancée reste Performance ; rentabilité dès Indépendant", () => {
    const proUp = { starter: false, pro: true, ultime: true, entreprise: true }
    expect(row("Chiffre d'affaires & panier moyen")?.values).toEqual(proUp)
    expect(row("Analyse avancée & répartition du CA")?.values).toEqual({ starter: false, pro: false, ultime: true, entreprise: true })
    expect(row("Analyse de rentabilité")?.values).toEqual(proUp)
    expect(PLAN_MATRIX.PRO.features.business_stats).toBe(true)
    expect(PLAN_MATRIX.PRO.features.profitability_analysis).toBe(true)
  })
})

describe("L13 — N1 : points forts, valeurs issues des règles existantes", () => {
  it("Performance : ordre et textes exacts", () => {
    expect(byId.ultime.highlights).toEqual([
      "Tout Indépendant",
      // L29 (C1) : textes de commission à 0 %.
      "Abonnements clients illimités, 0 % de commission",
      "0 % de commission sur vos paiements en ligne",
      "Gestion des prospects (CRM)",
      "Statistiques avancées et répartition du chiffre d'affaires",
    ])
    expect(byId.ultime.description).toBe(
      "Développez votre activité avec une gestion avancée de vos clients, de vos prospects et de votre rentabilité.",
    )
  })

  it("les chiffres affichés correspondent aux règles (0 % depuis L29)", () => {
    expect(COMMISSION_RULES.BUSINESS).toEqual({ feeBps: 0, monthlyFeeCapCents: 0 })
    expect(COMMISSION_RULES.PRO).toEqual({ feeBps: 0, monthlyFeeCapCents: 0 })
    expect(CUSTOMER_SUBSCRIPTION_PLATFORM_FEE_BPS.BUSINESS).toBe(0)
    expect(CUSTOMER_SUBSCRIPTION_PLATFORM_FEE_BPS.PRO).toBe(0)
    expect(PLAN_MATRIX.BUSINESS.limits.maxActiveCustomerSubscriptions).toBeNull()
  })

  it("Indépendant : point fort dépenses/rentabilité, adossé aux droits PRO", () => {
    expect(byId.pro.highlights[2]).toBe("Suivi des dépenses et analyse de rentabilité")
    expect(byId.pro.includedFeatures).toEqual(expect.arrayContaining(["expense_management", "profitability_analysis"]))
    // L13 : +1 point fort ; L29 : les 2 lignes de commission fusionnées en une.
    expect(byId.pro.highlights).toHaveLength(8)
  })

  it("aucune note « 50 SMS » (réservée à L15)", () => {
    expect(JSON.stringify(COMMERCIAL_PLANS) + JSON.stringify(COMPARE_CATEGORIES) + JSON.stringify(LANDING_FAQ)).not.toMatch(/50 SMS/)
  })
})

describe("L13 — A7 : Performance et Équipe non achetables", () => {
  it("coming_soon, aucun lien, listes d'achat inchangées", () => {
    for (const id of ["ultime", "entreprise"]) {
      expect(byId[id].availability).toBe("coming_soon")
      expect(byId[id].cta.href).toBeNull()
    }
    expect([...SAAS_ADMIN_CHECKOUT_PLANS]).toEqual(["PRO"])
    expect([...DESIRED_PLANS]).toEqual(["PRO"])
  })
})
