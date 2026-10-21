import { describe, expect, it } from "vitest"
import { priceBooking, quoteToCart } from "@/lib/booking/promotions-apply"
import type { EquivalenceRule } from "@/lib/booking/promotions"
import type { QuoteLine } from "@/lib/booking/types"
import { CLZ, fixedTotal, multiServices } from "./helpers/promotions-fixtures"

/**
 * L20 — pont devis ↔ moteur (pur). Sans offre : montants historiques EXACTS.
 * Avec offres : panier normalisé, remise ventilée au centime, code arbitré.
 */
const line = (uid: string, serviceId: number, priceCents: number, durationMin: number, options: [number, number, number][] = []): QuoteLine => ({
  uid,
  serviceId,
  serviceName: `S${serviceId}`,
  vehicleTypeId: 1,
  vehicleTypeName: "Citadine",
  priceCents,
  durationMin,
  options: options.map(([optionId, p, d]) => ({ optionId, optionName: `O${optionId}`, priceCents: p, durationMin: d })),
  lineTotalCents: priceCents + options.reduce((s, o) => s + o[1], 0),
  lineDurationMin: durationMin + options.reduce((s, o) => s + o[2], 0),
})
const quoteOf = (lines: QuoteLine[]) => {
  const subtotalCents = lines.reduce((s, l) => s + l.lineTotalCents, 0)
  return { lines, subtotalCents, eligibleSubtotalCents: subtotalCents, totalDurationMin: lines.reduce((s, l) => s + l.lineDurationMin, 0) }
}
const code = (discountCents: number, targetServiceIds: number[] | null = null) => ({ code: "BIENVENUE", discountCents, targetServiceIds })
const phares: EquivalenceRule = { id: 1, a: { type: "service", id: CLZ.pharesService }, b: { type: "option", id: CLZ.pharesOption }, reason: "Même rénovation des phares" }
const NOW = new Date("2026-11-10T10:00:00Z")

describe("L20 — sans offre ni équivalence : comportement historique exact", () => {
  it("lignes, durée et sous-total inchangés (même objet), moteur non utilisé", () => {
    const q = quoteOf([line("a", 1, 8000, 60, [[98, 5000, 30]]), line("b", 1, 8000, 60)])
    const p = priceBooking({ quote: q, promotions: [], equivalences: [], code: null })
    expect(p.engineUsed).toBe(false)
    expect(p.lines).toBe(q.lines)
    expect(p).toMatchObject({ subtotalCents: 21000, totalDurationMin: 150, discountCents: 0, codeStatus: "none", snapshot: null })
  })
  it("doublon d'une même prestation sur un véhicule : facturé comme aujourd'hui (aucune fusion sans règle)", () => {
    const q = quoteOf([line("v:l1", 1, 8000, 60), line("v:l2", 1, 8000, 60)])
    expect(priceBooking({ quote: q, promotions: [], equivalences: [], code: null }).subtotalCents).toBe(16000)
  })
  it("code promo : remise = min(remise du code, assiette) — 300 paniers aléatoires", () => {
    let seed = 7
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2147483648) % n)
    for (let i = 0; i < 300; i++) {
      const lines = Array.from({ length: 1 + rnd(3) }, (_, k) => line(`u${k}`, 1 + rnd(5), rnd(20000), 30, rnd(2) ? [[90 + rnd(5), rnd(6000), 10]] : []))
      const q = quoteOf(lines)
      const c = rnd(30000)
      const p = priceBooking({ quote: q, promotions: [], equivalences: [], code: code(c) })
      expect(p.discountCents).toBe(Math.max(0, Math.min(c, q.eligibleSubtotalCents)))
      expect(p.subtotalCents).toBe(q.subtotalCents)
    }
  })
})

describe("L20 — offres appliquées", () => {
  it("multi-prestations −10 % sur toute la réservation (2 véhicules), options exclues par défaut", () => {
    const q = quoteOf([line("a", 1, 8000, 60, [[98, 5000, 30]]), line("b", 2, 6000, 45)])
    const p = priceBooking({ quote: q, promotions: [multiServices()], equivalences: [], code: null, now: NOW })
    expect(p.engineUsed).toBe(true)
    expect(p.promotionDiscountCents).toBe(1400)
    expect(p.discountCents).toBe(1400)
    expect(p.subtotalCents).toBe(19000)
    expect(Object.values(p.snapshot!.allocations).reduce((s, c) => s + c, 0)).toBe(1400)
    expect(p.snapshot!.allocations["a|o|98"]).toBeUndefined()
  })
  it("prix total fixe : jamais plus cher que le prix normal", () => {
    const q = quoteOf([line("a", 1, 5000, 60), line("b", 2, 4000, 60)])
    const p = priceBooking({ quote: q, promotions: [fixedTotal()], equivalences: [], code: null, now: NOW })
    expect(p.discountCents).toBe(0)
    expect(p.subtotalCents - p.discountCents).toBeLessThanOrEqual(9000)
  })
  it("offre inactive ou hors dates : aucune remise", () => {
    const q = quoteOf([line("a", 1, 8000, 60), line("b", 2, 6000, 45)])
    for (const promo of [multiServices({ active: false }), multiServices({ endsAt: "2026-11-01T00:00:00Z" })]) {
      expect(priceBooking({ quote: q, promotions: [promo], equivalences: [], code: null, now: NOW }).discountCents).toBe(0)
    }
  })
})

describe("L20 — même traitement jamais facturé deux fois (équivalence)", () => {
  it("prestation phares avec l'option phares sur le même véhicule : facturée une fois (prestation gardée, jamais d'option seule)", () => {
    const q = quoteOf([line("v", CLZ.pharesService, 6500, 45, [[CLZ.pharesOption, 5000, 30]])])
    const p = priceBooking({ quote: q, promotions: [], equivalences: [phares], code: null, now: NOW })
    expect(p.lines).toHaveLength(1)
    expect(p.lines[0]).toMatchObject({ serviceId: CLZ.pharesService, options: [], lineTotalCents: 6500, lineDurationMin: 45 })
    expect(p).toMatchObject({ subtotalCents: 6500, totalDurationMin: 45 })
    expect(p.snapshot!.adjustments[0]).toMatchObject({ kind: "equivalence_resolved", removed: { type: "option", id: CLZ.pharesOption } })
  })
  it("véhicules différents : les deux formes restent facturées (règle par véhicule)", () => {
    const q = quoteOf([line("a", CLZ.pharesService, 6500, 45), line("b", CLZ.lavageExterieurEco, 3000, 60, [[CLZ.pharesOption, 5000, 30]])])
    expect(priceBooking({ quote: q, promotions: [], equivalences: [phares], code: null, now: NOW }).subtotalCents).toBe(14500)
  })
  it("anti-fraude : un identifiant de ligne commun envoyé par le navigateur ne fusionne jamais deux véhicules", () => {
    const q = quoteOf([line("x:1", CLZ.lavageExterieurEco, 3000, 60, [[CLZ.pharesOption, 5000, 30]]), line("x:2", CLZ.pharesService, 6500, 45), line("x:3", CLZ.lavageExterieurEco, 3000, 60)])
    const p = priceBooking({ quote: q, promotions: [], equivalences: [phares], code: null, now: NOW })
    expect(p.subtotalCents).toBe(17500)
    expect(p.lines).toHaveLength(3)
    expect(p.adjustments).toEqual([])
  })
})

describe("L20 — code promo et offres", () => {
  const q = quoteOf([line("a", 1, 8000, 60), line("b", 2, 6000, 45)])
  it("offre non cumulable plus avantageuse : code écarté (non appliqué)", () => {
    const p = priceBooking({ quote: q, promotions: [multiServices()], equivalences: [], code: code(1000), now: NOW })
    expect(p.codeStatus).toBe("rejected_not_combinable")
    expect(p).toMatchObject({ codeDiscountCents: 0, discountCents: 1400 })
  })
  it("code plus avantageux : code seul retenu, offre non cumulable écartée", () => {
    const p = priceBooking({ quote: q, promotions: [multiServices()], equivalences: [], code: code(2000), now: NOW })
    expect(p).toMatchObject({ codeStatus: "applied", codeDiscountCents: 2000, promotionDiscountCents: 0, discountCents: 2000 })
  })
  it("cumul autorisé par l'offre : offre puis code sur le reste, jamais au-delà du prix", () => {
    const p = priceBooking({ quote: q, promotions: [multiServices({ stackableWithPromoCode: true })], equivalences: [], code: code(50000), now: NOW })
    expect(p.codeStatus).toBe("applied")
    expect(p.promotionDiscountCents).toBe(1400)
    expect(p.discountCents).toBe(14000)
    expect(Object.values(p.snapshot!.allocations).reduce((s, c) => s + c, 0)).toBe(14000)
  })
})

describe("L20 — clés véhicule", () => {
  it("une ligne = un véhicule, clé tirée du rang (jamais de l'uid du navigateur)", () => {
    expect(quoteToCart([line("x:1", 1, 100, 1), line("x:1", 2, 200, 1), line("a|b", 1, 100, 1)]).vehicles.map((v) => v.key)).toEqual(["l1", "l2", "l3"])
  })
})

describe("L20 — code en pourcentage calculé sur le montant réellement facturé", () => {
  const pct = (percent: number, discountCents: number, targetServiceIds: number[] | null = null) => ({ code: "DIX", discountCents, targetServiceIds, percent })
  it("équivalence : 10 % du prix facturé (65 €), pas du catalogue (115 €)", () => {
    const q = quoteOf([line("v", CLZ.pharesService, 6500, 45, [[CLZ.pharesOption, 5000, 30]])])
    const p = priceBooking({ quote: q, promotions: [], equivalences: [phares], code: pct(10, 1150), now: NOW })
    expect(p).toMatchObject({ codeStatus: "applied", codeDiscountCents: 650, discountCents: 650 })
  })
  it("offre cumulable : le pourcentage porte sur le reste après l'offre", () => {
    const q = quoteOf([line("a", 1, 8000, 60), line("b", 2, 6000, 45)])
    const p = priceBooking({ quote: q, promotions: [multiServices({ stackableWithPromoCode: true })], equivalences: [], code: pct(10, 1400), now: NOW })
    expect(p).toMatchObject({ promotionDiscountCents: 1400, codeDiscountCents: 1260, discountCents: 2660 })
  })
  it("code ciblé : seules les prestations visées, après l'offre cumulable", () => {
    const q = quoteOf([line("a", 1, 8000, 60), line("b", 2, 6000, 45)])
    const p = priceBooking({ quote: q, promotions: [multiServices({ stackableWithPromoCode: true })], equivalences: [], code: pct(10, 600, [2]), now: NOW })
    expect(p).toMatchObject({ codeDiscountCents: 540, discountCents: 1940 })
  })
  it("code fixe : montant validé inchangé (plafonné au reste)", () => {
    const q = quoteOf([line("a", 1, 8000, 60), line("b", 2, 6000, 45)])
    const p = priceBooking({ quote: q, promotions: [multiServices({ stackableWithPromoCode: true })], equivalences: [], code: { code: "F", discountCents: 1000, targetServiceIds: null, percent: null }, now: NOW })
    expect(p.codeDiscountCents).toBe(1000)
  })
})
