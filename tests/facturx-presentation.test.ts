import { describe, it, expect } from "vitest"
import { buildFacturXPresentation } from "@/lib/invoice/facturx-presentation"

type Fields = Parameters<typeof buildFacturXPresentation>[0]

const invoice: Fields = {
  issuerPhone: "0102030405",
  customerPhone: "0607080910",
  vehicleTypeName: "Voiture",
  vehicleBrand: "Porsche",
  vehicleModel: "911",
  vehiclePlate: "AA-123-BB",
  footerNote: "Merci pour votre confiance",
  legalMentions: "Mentions legales de test",
}

describe("Presentation Factur-X C4", () => {
  it("conserve le logo", () => {
    const result = buildFacturXPresentation(
      invoice,
      "data:image/png;base64,dGVzdA=="
    )
    expect(result.logoDataUrl).toBe(
      "data:image/png;base64,dGVzdA=="
    )
  })

  it("conserve le vehicule", () => {
    const result = buildFacturXPresentation(invoice, null)
    expect(result.vehicle).toBe("Porsche 911")
    expect(result.vehiclePlate).toBe("AA-123-BB")
  })

  it("conserve les coordonnees et mentions", () => {
    const result = buildFacturXPresentation(invoice, null)
    expect(result.issuerPhone).toBe("0102030405")
    expect(result.customerPhone).toBe("0607080910")
    expect(result.footerNote).toBe(
      "Merci pour votre confiance"
    )
    expect(result.legalMentions).toBe(
      "Mentions legales de test"
    )
  })

  it("fonctionne sans logo", () => {
    const result = buildFacturXPresentation(invoice, null)
    expect(result.logoDataUrl).toBeNull()
  })

  it("utilise le type si marque absente", () => {
    const result = buildFacturXPresentation({
      ...invoice,
      vehicleBrand: null,
      vehicleModel: null,
    }, null)
    expect(result.vehicle).toBe("Voiture")
  })
})
