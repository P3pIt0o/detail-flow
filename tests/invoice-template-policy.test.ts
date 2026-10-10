import { describe, it, expect } from "vitest"
import { planFeature } from "@/lib/licensing/registry"
import { resolveInvoicePresentation } from "@/lib/invoice/template-policy"
import type { LicensePlan } from "@/lib/licensing/types"

function presentation(plan: LicensePlan, requested?: string) {
  return resolveInvoicePresentation({
    invoice_logo: planFeature(plan, "invoice_logo"),
    invoice_template_choice: planFeature(plan, "invoice_template_choice"),
    invoice_photo: planFeature(plan, "invoice_photo"),
  }, requested)
}

describe("Factur-X C3 - modeles de facture", () => {
  it("Free : basique sans logo ni photo", () => {
    const result = presentation("FREE", "signature_premium")
    expect(result.template).toBe("basic")
    expect(result.logoAllowed).toBe(false)
    expect(result.photoAllowed).toBe(false)
  })

  it("Independant : basique avec logo", () => {
    const result = presentation("PRO", "signature_premium")
    expect(result.template).toBe("basic")
    expect(result.logoAllowed).toBe(true)
    expect(result.photoAllowed).toBe(false)
  })

  it("Performance : Business Pro par defaut", () => {
    expect(presentation("BUSINESS").template).toBe("business_pro")
  })

  it("Performance : les trois modeles", () => {
    const result = presentation("BUSINESS", "signature_premium")
    expect(result.template).toBe("signature_premium")
    expect(result.availableTemplates).toHaveLength(3)
    expect(result.photoAllowed).toBe(true)
  })

  it("Equipe : herite de Performance", () => {
    const result = presentation("ENTERPRISE", "signature_premium")
    expect(result.template).toBe("signature_premium")
    expect(result.photoAllowed).toBe(true)
  })

  it("Un modele inconnu est refuse", () => {
    expect(presentation("BUSINESS", "inconnu").template)
      .toBe("business_pro")
  })
})
