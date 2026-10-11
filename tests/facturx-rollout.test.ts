import { describe, it, expect } from "vitest"
import { canUseFacturX } from "@/lib/invoice/facturx-rollout"

describe("Activation pilote Factur-X", () => {
  it("reste desactive par defaut", () => {
    expect(canUseFacturX(10, {})).toBe(false)
  })

  it("refuse une liste pilote vide", () => {
    expect(canUseFacturX(10, {
      FACTURX_INVOICES_ENABLED: "true",
    })).toBe(false)
  })

  it("autorise uniquement le tenant pilote", () => {
    const env = {
      FACTURX_INVOICES_ENABLED: "true",
      FACTURX_PILOT_COMPANY_IDS: "10,20",
    }
    expect(canUseFacturX(10, env)).toBe(true)
    expect(canUseFacturX(20, env)).toBe(true)
    expect(canUseFacturX(30, env)).toBe(false)
  })

  it("refuse les identifiants invalides", () => {
    const env = {
      FACTURX_INVOICES_ENABLED: "true",
      FACTURX_PILOT_COMPANY_IDS: "10",
    }
    expect(canUseFacturX(-1, env)).toBe(false)
    expect(canUseFacturX(1.5, env)).toBe(false)
  })
})
