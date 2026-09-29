import { describe, expect, it, vi } from "vitest"

/**
 * Le moteur de prix ne connaît que les référentiels du tenant courant (requêtes
 * scopées par companyId). Un id appartenant à un autre tenant est REFUSÉ
 * (ignoré) : jamais tarifé, jamais ajouté.
 */

vi.mock("server-only", () => ({}))
vi.mock("@/lib/booking/queries", () => ({
  getServices: async () => [{ id: 1, name: "Intérieur — Formule Éco", basePriceCents: 5000, durationMin: 60 }],
  getVehicleTypes: async () => [{ id: 10, name: "Citadine" }],
  getOptions: async () => [{ id: 100, name: "Ozone", priceCents: 4900, durationMin: 0 }],
  getServicePrices: async () => [{ serviceId: 1, vehicleTypeId: 10, priceCents: 5000, durationMin: 60 }],
}))

import { buildQuote } from "@/lib/booking/pricing"

const settings = { depositMode: "none", depositValue: 0 } as never

describe("buildQuote — isolation tenant", () => {
  it("refuse une prestation d'un autre tenant", async () => {
    const quote = await buildQuote([{ uid: "a", serviceId: 999, vehicleTypeId: 10, optionIds: [] }] as never, settings, null)
    expect(quote.lines).toHaveLength(0)
    expect(quote.totalCents).toBe(0)
  })

  it("refuse une option d'un autre tenant sur une prestation valide", async () => {
    const quote = await buildQuote([{ uid: "a", serviceId: 1, vehicleTypeId: 10, optionIds: [100, 888] }] as never, settings, null)
    expect(quote.lines).toHaveLength(1)
    expect(quote.lines[0].options.map((o) => o.optionId)).toEqual([100])
    expect(quote.totalCents).toBe(9900)
  })
})
