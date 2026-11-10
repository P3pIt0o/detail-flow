import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { COMMISSION_RULES } from "@/lib/billing/commercial-rules"
import {
  COMMERCIAL_PLANS,
  CUSTOM_SITE_OFFER,
  PRICING_COPY,
  formatBpsPercent,
  formatPriceCents,
} from "@/lib/pricing/plans"
import { LANDING_FAQ } from "@/components/marketing/v4/faq-data"
import { Pricing } from "@/components/marketing/v4/pricing"

const unescape = (html: string) => html.replace(/&#x27;/g, "'")
const faq = (q: string) => LANDING_FAQ.find((f) => f.q === q)?.a

describe("L41 — formateur unique", () => {
  it("centimes → euros (espaces ordinaires)", () => {
    expect(formatPriceCents(0)).toBe("0 €")
    expect(formatPriceCents(1990)).toBe("19,90 €")
    expect(formatPriceCents(79000)).toBe("790 €")
    expect(formatPriceCents(199000)).toBe("1 990 €")
    expect(formatPriceCents(5)).toBe("0,05 €")
    expect(formatPriceCents(1234567)).toBe("12 345,67 €")
  })

  it("points de base → pourcentage", () => {
    expect(formatBpsPercent(0)).toBe("0 %")
    expect(formatBpsPercent(200)).toBe("2 %")
    expect(formatBpsPercent(250)).toBe("2,5 %")
    expect(formatBpsPercent(1)).toBe("0,01 %")
    expect(formatBpsPercent(1000)).toBe("10 %")
  })
})

describe("L41 — rendu identique au caractère près (littéraux d'avant)", () => {
  it("textes de plans.ts", () => {
    expect(PRICING_COPY.trialSub).toBe(
      "Ajoutez un moyen de paiement avant la fin de l'essai pour continuer sur Indépendant à 19,90 €/mois. Sinon, votre espace repasse automatiquement sur Essentiel.",
    )
    expect(COMMERCIAL_PLANS.find((p) => p.id === "starter")?.highlights).toContain(
      "Paiements en ligne : 2 % de commission DetailFlow, plafonnée à 19,90 €/mois (frais Stripe distincts)",
    )
    expect(COMMERCIAL_PLANS.find((p) => p.id === "pro")?.monthlyPriceCents).toBe(1990)
    expect(CUSTOM_SITE_OFFER.fromPriceCents).toBe(79000)
  })

  it("FAQ (L40 et L48)", () => {
    expect(LANDING_FAQ.map((f) => f.a)).toContain(
      "Essentiel est gratuit et disponible dès maintenant. Indépendant coûte 19,90 €/mois avec 30 jours gratuits et est également disponible. Les offres Performance et Équipe sont présentées dans la section Tarifs et seront bientôt disponibles. Automatisations avancées, Marketing avancé, Campagnes et relances clients et Domaine personnalisé sont en préparation et ne sont incluses dans aucune offre actuellement.",
    )
    expect(faq("Comment fonctionne la commission DetailFlow ?")).toBe(
      "Vous ne payez une commission DetailFlow que sur l'offre Essentiel, lorsque vous encaissez en ligne : 2 %, plafonnée à 19,90 €/mois. Indépendant, Performance et Équipe : 0 % de commission. Les frais Stripe restent distincts.",
    )
  })

  it("section prix (rendu serveur) : phrase sous les cartes et « 790 € »", () => {
    const html = unescape(renderToStaticMarkup(createElement(Pricing)))
    expect(html).toContain(
      "Avec Essentiel, une commission DetailFlow s'applique uniquement lorsque vous encaissez en ligne, plafonnée chaque mois. Indépendant, Performance et Équipe : 0 % de commission. Les frais Stripe restent distincts.",
    )
    expect(html).toMatch(/>À partir de<\/span><span[^>]*>790 €<\/span>/)
    expect(html).toContain(PRICING_COPY.trialSub)
  })
})

describe("L41 — invariant commissions", () => {
  it("Indépendant, Performance et Équipe ont le même taux (phrase groupée)", () => {
    expect(COMMISSION_RULES.BUSINESS.feeBps).toBe(COMMISSION_RULES.PRO.feeBps)
    expect(COMMISSION_RULES.ENTERPRISE.feeBps).toBe(COMMISSION_RULES.PRO.feeBps)
  })
})

describe("L41 — dérivation réelle (règles simulées)", () => {
  it("les textes suivent COMMISSION_RULES", async () => {
    vi.resetModules()
    vi.doMock("@/lib/billing/commercial-rules", () => ({
      COMMISSION_RULES: {
        FREE: { feeBps: 250, monthlyFeeCapCents: 2490 },
        PRO: { feeBps: 100, monthlyFeeCapCents: 500 },
        BUSINESS: { feeBps: 100, monthlyFeeCapCents: 500 },
        ENTERPRISE: { feeBps: 100, monthlyFeeCapCents: 500 },
      },
    }))
    const plans = await import("@/lib/pricing/plans")
    const { LANDING_FAQ: mockedFaq } = await import("@/components/marketing/v4/faq-data")
    expect(plans.COMMERCIAL_PLANS[0].highlights).toContain(
      "Paiements en ligne : 2,5 % de commission DetailFlow, plafonnée à 24,90 €/mois (frais Stripe distincts)",
    )
    expect(mockedFaq.find((f) => f.q === "Comment fonctionne la commission DetailFlow ?")?.a).toContain(
      "2,5 %, plafonnée à 24,90 €/mois. Indépendant, Performance et Équipe : 1 % de commission.",
    )
    vi.doUnmock("@/lib/billing/commercial-rules")
    vi.resetModules()
  })
})

/* ------------------------------------------------------------------------- */
/*  C2 — anti-dérive : aucun montant en dur dans components/marketing         */
/* ------------------------------------------------------------------------- */

const DEMO = "montant fictif de démonstration"
const CSS = "pourcentage CSS/SVG (mise en page)"
/** Liste blanche explicite : fichier → montants tolérés (motif). */
const ALLOWED: Record<string, { matches: string[]; reason: string }> = {
  "components/marketing/detailflow-panel.tsx": { matches: ["50%", "45%"], reason: CSS },
  "components/marketing/scroll-stage.tsx": { matches: ["68%", "40%"], reason: CSS },
  "components/marketing/v2/trustpilot-trustbox.tsx": { matches: ["100%"], reason: CSS },
  "components/marketing/v2/hero.tsx": { matches: ["12%", "44%"], reason: CSS },
  "components/marketing/static-marketing-content.tsx": { matches: ["12%", "44%"], reason: CSS },
  "components/marketing/v4/case-study.tsx": { matches: ["60%", "50%", "30%"], reason: CSS },
  "components/marketing/v4/primitives.tsx": { matches: ["26%"], reason: CSS },
  "components/marketing/v4/problem.tsx": { matches: ["0%", "100%"], reason: CSS },
  "components/marketing/v4/booking-demo.tsx": { matches: ["100%"], reason: CSS },
  "components/marketing/v4/trustpilot.tsx": { matches: ["84 %"], reason: "commentaire : remplissage des étoiles 4,2/5" },
  "components/marketing/v4/bento.tsx": {
    matches: ["280 €", "10 %", "80 €", "30 %", "34,20 €", "79,80 €", "0,50 €"],
    reason: DEMO,
  },
  "components/marketing/v4/planning.tsx": {
    matches: ["208,00 €", "69,00 €", "139,00 €", "517,00 €", "403,00 €", "114,00 €"],
    reason: DEMO,
  },
  "components/marketing/v4/hero.tsx": { matches: ["114 €", "34,20 €", "70%", "55%", "50%", "30%"], reason: `${DEMO} + ${CSS}` },
  "components/marketing/v4/mobile.tsx": { matches: ["34,20 €"], reason: DEMO },
  "components/marketing/v4/invoicing.tsx": { matches: ["20 %"], reason: "démo de facture (TVA 20 %)" },
  "components/marketing/v4/pricing-data.ts": {
    matches: ["7 %", "0 %"],
    reason: "abonnements clients (plan-policy.ts, système distinct) — lot ultérieur (L41 D4)",
  },
}

const AMOUNT = /\d+(?:,\d+)? ?[€%]/g

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return walk(full)
    return /\.(ts|tsx)$/.test(name) ? [full] : []
  })
}

describe("L41 — anti-dérive des montants (components/marketing)", () => {
  const root = process.cwd()
  const found = new Map<string, Set<string>>()
  for (const file of walk(join(root, "components/marketing"))) {
    const matches = readFileSync(file, "utf8").match(AMOUNT)
    if (matches) found.set(relative(root, file).split("\\").join("/"), new Set(matches))
  }

  it("aucun montant en dur hors liste blanche", () => {
    const offenders: string[] = []
    for (const [file, matches] of found) {
      for (const m of matches) if (!ALLOWED[file]?.matches.includes(m)) offenders.push(`${file}: « ${m} »`)
    }
    expect(offenders).toEqual([])
  })

  it("chaque entrée de la liste blanche correspond encore au code", () => {
    const stale: string[] = []
    for (const [file, { matches }] of Object.entries(ALLOWED)) {
      for (const m of matches) if (!found.get(file)?.has(m)) stale.push(`${file}: « ${m} »`)
    }
    expect(stale).toEqual([])
  })

  it("le détecteur attrape bien les montants visés", () => {
    expect("à 19,90 €/mois · 2 % · 790 €".match(AMOUNT)).toEqual(["19,90 €", "2 %", "790 €"])
  })
})
