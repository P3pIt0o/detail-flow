import { describe, it, expect, vi } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { createHash } from "node:crypto"

vi.mock("@/app/(site)/formules/actions", () => ({ submitSubscriptionRequest: vi.fn() }))

import { PublicPlans } from "@/components/subscriptions/public-plans"
import { categorySuffix, groupPublicPlans, normalizePlanName, selectedOption } from "@/lib/customer-subscriptions/plan-groups"
import type { PublicPlanView } from "@/lib/customer-subscriptions/public-offer"

/** L36 — regroupement public des formules par catégorie de véhicule (C2, C3). */

type P = { id: number; name: string; vehicleType?: { label: string; rank: number } | null }
const CATS = ["Citadine", "Berline", "SUV", "Utilitaire"]
const vt = (rank: number) => ({ label: CATS[rank], rank })

describe("groupPublicPlans", () => {
  it("3 noms × 4 catégories → 3 groupes de 4, position = première formule, options dans l'ordre des catégories", () => {
    const plans: P[] = []
    let id = 1
    for (const name of ["Essentiel", "Confort", "Premium"]) for (const rank of [2, 0, 3, 1]) plans.push({ id: id++, name, vehicleType: vt(rank) })
    const cards = groupPublicPlans(plans)
    expect(cards).toHaveLength(3)
    expect(cards.map((c) => c.kind === "group" && c.options[0].plan.name)).toEqual(["Essentiel", "Confort", "Premium"])
    for (const c of cards) expect(c.kind === "group" && c.options.map((o) => o.label)).toEqual(CATS)
  })

  it("nom comparé sans casse ni espaces superflus", () => {
    expect(normalizePlanName("  Formule   CONFORT ")).toBe("formule confort")
    const cards = groupPublicPlans<P>([
      { id: 1, name: "Confort", vehicleType: vt(0) },
      { id: 2, name: " confort  ", vehicleType: vt(1) },
    ])
    expect(cards).toEqual([{ kind: "group", key: "confort", options: [expect.objectContaining({ rank: 0 }), expect.objectContaining({ rank: 1 })] }])
  })

  it("sans catégorie, seule de son nom, ou noms différents : cartes simples, ordre conservé", () => {
    const plans: P[] = [
      { id: 1, name: "Confort", vehicleType: null },
      { id: 2, name: "Confort", vehicleType: vt(0) },
      { id: 3, name: "Premium", vehicleType: vt(1) },
      { id: 4, name: "Essentiel" },
    ]
    expect(groupPublicPlans(plans)).toEqual(plans.map((plan) => ({ kind: "single", plan })))
  })

  it("doublon de nom ET de catégorie : la 2e formule reste une carte à part (rien n'est masqué)", () => {
    const cards = groupPublicPlans<P>([
      { id: 1, name: "Confort", vehicleType: vt(1) },
      { id: 2, name: "Solo" },
      { id: 3, name: "Confort", vehicleType: vt(1) },
      { id: 4, name: "Confort", vehicleType: vt(0) },
    ])
    expect(cards.map((c) => (c.kind === "group" ? c.options.map((o) => o.plan.id) : c.plan.id))).toEqual([[4, 1], 2, 3])
  })

  it("une formule sans catégorie de même nom qu'un groupe reste à part", () => {
    const cards = groupPublicPlans<P>([
      { id: 1, name: "Confort", vehicleType: vt(0) },
      { id: 2, name: "Confort", vehicleType: null },
      { id: 3, name: "Confort", vehicleType: vt(1) },
    ])
    expect(cards.map((c) => (c.kind === "group" ? c.options.map((o) => o.plan.id) : c.plan.id))).toEqual([[1, 3], 2])
  })

  it("sélection partagée ; catégorie absente du groupe → sa première option", () => {
    const [g] = groupPublicPlans<P>([
      { id: 1, name: "A", vehicleType: vt(1) },
      { id: 2, name: "A", vehicleType: vt(3) },
    ])
    if (g.kind !== "group") throw new Error("groupe attendu")
    expect(selectedOption(g.options, null).plan.id).toBe(1)
    expect(selectedOption(g.options, 3).plan.id).toBe(2)
    expect(selectedOption(g.options, 0).plan.id).toBe(1)
  })

  it("suffixe de prix : minuscule, sigles conservés", () => {
    expect(categorySuffix("Berline")).toBe("berline")
    expect(categorySuffix("SUV")).toBe("SUV")
  })
})

const base = { description: "Lavage complet chaque mois.", priceLabel: "29,00 €", intervalLabel: "par mois", includedLabel: "Lavage complet par période", commitmentLabel: "Sans engagement", renewalLabel: "Se poursuit", stopRuleLabel: "Résiliable", noticeLabel: null, initialCleaningLabel: null, paymentOptions: [{ mode: "recurring" as const, label: "Paiement mensuel — 29,00 €" }] }
const period = { badge: "Paiement mensuel", priceMain: "34 €", priceSuffix: "/ mois", usesLine: "12 lavages par an, quand vous voulez", features: ["Lavage complet"], footer: "Engagement 12 mois", choices: null, choiceNote: null }
const render = (mode: "request" | "direct", plans: PublicPlanView[]) => renderToStaticMarkup(createElement(PublicPlans, { offer: { mode, plans }, tenantSlug: "acme" }))
// submissionId = UUID aléatoire à chaque rendu : neutralisé avant l'empreinte.
const sha = (s: string) => createHash("sha256").update(s.replace(/name="submissionId" value="[^"]*"/g, 'name="submissionId" value=""')).digest("hex")

describe("PublicPlans (rendu réel)", () => {
  it("C3 — formules sans catégorie : markup octet pour octet identique à avant L36 (empreintes relevées sur main)", () => {
    const plans: PublicPlanView[] = [
      { ...base, id: 1, name: "Essentiel", period: null },
      { ...base, id: 2, name: "Confort", description: null, period, vehicleType: null },
    ]
    expect(sha(render("request", plans))).toBe("e38de9cebad63705eafa0daeadd7e7b2ddd384e0dbabe9b1b7511b8cc7d54eea")
    expect(sha(render("direct", plans))).toBe("9476761c07d9c530cacbb8a21ad96e62abe920c34b4790cc5159a0cc3ca7c0ba")
  })

  it("C2 — carte groupée : pastilles, puis prix, description, lignes et planId de la 1re catégorie", () => {
    const plans: PublicPlanView[] = [
      { ...base, id: 11, name: "Confort", description: "Pour les berlines.", period: { ...period, priceMain: "52 €", usesLine: "Ligne berline" }, vehicleType: vt(1) },
      { ...base, id: 10, name: "Confort", description: "Pour les citadines.", period: { ...period, priceMain: "45 €", usesLine: "Ligne citadine" }, vehicleType: vt(0) },
      { ...base, id: 20, name: "Essentiel", period: null, priceLabel: "19,00 €", vehicleType: vt(1) },
      { ...base, id: 21, name: "Essentiel", period: null, priceLabel: "24,00 €", vehicleType: vt(2) },
    ]
    const html = render("request", plans)
    expect(html.match(/<h3/g)).toHaveLength(2)
    const pills = [...html.matchAll(/aria-pressed="(true|false)"[^>]*>([^<]+)</g)].map((m) => `${m[2]}:${m[1]}`)
    expect(pills).toEqual(["Citadine:true", "Berline:false", "Berline:true", "SUV:false"])
    expect(html).toContain("45 €")
    expect(html).toContain("/ mois · citadine")
    expect(html).toContain("Pour les citadines.")
    expect(html).toContain("Ligne citadine")
    expect(html).not.toContain("Ligne berline")
    expect(html).toContain('name="planId" value="10"')
    expect(html).not.toContain('name="planId" value="11"')
    // Essentiel n'a pas Citadine : 1re catégorie du groupe (Berline).
    expect(html).toContain("19,00 €")
    expect(html).toContain("par mois · berline")
    expect(html).toContain('name="planId" value="20"')
    expect(html).not.toContain("24,00 €")
    // Aucun texte de vente nouveau : libellé du bouton existant.
    expect(html).toContain("Demander cette formule")
  })

  it("C1 — la description saisie est affichée", () => {
    expect(render("direct", [{ ...base, id: 1, name: "Essentiel", description: "Quelques mots.", period: null }])).toContain("Quelques mots.")
  })
})
