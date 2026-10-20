import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({ db: {} }))

import { rowToPromotion, promotionToColumns, rowToEquivalence, rowToUpsell, zonedDayBoundary } from "@/lib/booking/promotions-store"

const row = (over: Record<string, unknown> = {}) => ({
  id: 7,
  name: "2 prestations",
  kind: "multi_services",
  active: true,
  startsAt: null,
  endsAt: null,
  priority: 0,
  stackable: false,
  stackableWithPromoCode: false,
  scope: { eligibleServiceIds: null, includeOptions: false },
  tiers: [{ minQuantity: 2, value: { type: "percent", bps: 1000 } }],
  ...over,
})

describe("L19 — ligne SQL ↔ offre du moteur", () => {
  it("aller-retour sans perte", () => {
    const p = rowToPromotion(row())!
    expect(p).toMatchObject({ id: 7, kind: "multi_services", eligibleServiceIds: null, includeOptions: false })
    const c = promotionToColumns(p)
    expect(rowToPromotion({ ...row(), ...c, scope: JSON.parse(c.scope), tiers: JSON.parse(c.tiers) })).toEqual(p)
  })
  it("jsonb renvoyé en texte : accepté", () => {
    expect(rowToPromotion(row({ scope: JSON.stringify({ eligibleServiceIds: [1, 2], includeOptions: true }), tiers: JSON.stringify(row().tiers) }))).toMatchObject({ eligibleServiceIds: [1, 2], includeOptions: true })
  })
  it("jsonb malformé, palier invalide ou type inconnu : ignoré (jamais transmis au moteur)", () => {
    expect(rowToPromotion(row({ tiers: "{pas du json" }))).toBeNull()
    expect(rowToPromotion(row({ tiers: [{ minQuantity: 2, value: { type: "percent", bps: 0 } }] }))).toBeNull()
    expect(rowToPromotion(row({ kind: "autre" }))).toBeNull()
    expect(rowToPromotion(row({ id: "x" }))).toBeNull()
  })
  it("prestation + option : déclencheur complet obligatoire", () => {
    const so = { kind: "service_option", scope: { trigger: { serviceId: 158, optionId: 98, appliesTo: "both" } }, tiers: [{ minQuantity: 1, value: { type: "amount", cents: 1500 } }] }
    expect(rowToPromotion(row(so))).toMatchObject({ kind: "service_option", trigger: { serviceId: 158, optionId: 98, appliesTo: "both" } })
    expect(rowToPromotion(row({ ...so, scope: { trigger: { serviceId: 158, appliesTo: "both" } } }))).toBeNull()
  })
  it("dates converties en ISO", () => {
    expect(rowToPromotion(row({ startsAt: new Date("2026-11-01T00:00:00+01:00") }))!.startsAt).toBe("2026-10-31T23:00:00.000Z")
  })
  it("équivalence : motif obligatoire, éléments valides", () => {
    expect(rowToEquivalence({ id: 1, kind: "equivalence", itemA: { type: "service", id: 158 }, itemB: { type: "option", id: 98 }, reason: "Même traitement" })).toEqual({
      id: 1, a: { type: "service", id: 158 }, b: { type: "option", id: 98 }, reason: "Même traitement",
    })
    expect(rowToEquivalence({ id: 1, kind: "equivalence", itemA: { type: "service", id: 158 }, itemB: { type: "option", id: 98 }, reason: " " })).toBeNull()
    expect(rowToEquivalence({ id: 1, kind: "equivalence", itemA: { type: "x", id: 1 }, itemB: { type: "option", id: 98 }, reason: "r" })).toBeNull()
  })
  it("complément : au moins un élément valide", () => {
    expect(rowToUpsell({ id: 1, whenServiceId: 143, suggest: [{ type: "option", id: 98 }, { type: "?", id: 1 }], message: " ", active: true })).toEqual({
      id: 1, whenServiceId: 143, suggest: [{ type: "option", id: 98 }], message: null, active: true,
    })
    expect(rowToUpsell({ id: 1, whenServiceId: 143, suggest: [], active: true })).toBeNull()
  })
})

describe("L19 — jour saisi → horodatage dans le fuseau de l'entreprise", () => {
  it("Paris, heure d'hiver : fin de journée du 31/10 incluse", () => {
    expect(zonedDayBoundary("2026-10-31", "Europe/Paris", "end")).toBe("2026-10-31T22:59:59.999Z")
  })
  it("Paris, heure d'été : début du 14/07", () => {
    expect(zonedDayBoundary("2026-07-14", "Europe/Paris", "start")).toBe("2026-07-13T22:00:00.000Z")
  })
  it("jour du changement d'heure (25/10/2026) : début à 00:00 heure d'été", () => {
    expect(zonedDayBoundary("2026-10-25", "Europe/Paris", "start")).toBe("2026-10-24T22:00:00.000Z")
    expect(zonedDayBoundary("2026-10-25", "Europe/Paris", "end")).toBe("2026-10-25T22:59:59.999Z")
  })
  it("autre fuseau (Martinique)", () => {
    expect(zonedDayBoundary("2026-10-31", "America/Martinique", "start")).toBe("2026-10-31T04:00:00.000Z")
  })
  it("fuseau invalide → Europe/Paris ; date invalide → null", () => {
    expect(zonedDayBoundary("2026-10-31", "Pas/Un_Fuseau", "end")).toBe("2026-10-31T22:59:59.999Z")
    expect(zonedDayBoundary("2026-02-30", "Europe/Paris", "start")).toBeNull()
    expect(zonedDayBoundary("31/10/2026", "Europe/Paris", "start")).toBeNull()
  })
})
