import { describe, it, expect } from "vitest"
import {
  canReadInvoiceLogo,
  canChangeInvoiceLogo,
} from "@/lib/invoice/logo-access"

describe("C3 - isolation des logos", () => {
  const own = "invoice-logo/12/logo-123.png"
  const other = "invoice-logo/13/logo-456.png"
  const legacy = "invoice-logo/logo-ancien.jpg"

  it("autorise le logo du tenant", () => {
    expect(canReadInvoiceLogo(own, 12, null)).toBe(true)
  })

  it("refuse un autre tenant", () => {
    expect(canReadInvoiceLogo(other, 12, null)).toBe(false)
  })

  it("refuse un faux prefixe", () => {
    expect(canReadInvoiceLogo(
      "invoice-logo/12/../13/logo-456.png", 12, null
    )).toBe(false)
  })

  it("preserve un ancien logo enregistre", () => {
    expect(canReadInvoiceLogo(legacy, 12, legacy)).toBe(true)
  })

  it("refuse un ancien logo non attribue", () => {
    expect(canReadInvoiceLogo(legacy, 12, null)).toBe(false)
  })

  it("Free ne peut pas modifier son logo", () => {
    expect(canChangeInvoiceLogo(own, null, 12, false))
      .toBe(false)
  })

  it("un logo existant reste conserve", () => {
    expect(canChangeInvoiceLogo(legacy, legacy, 12, false))
      .toBe(true)
  })

  it("un plan autorise peut enregistrer son logo", () => {
    expect(canChangeInvoiceLogo(own, null, 12, true))
      .toBe(true)
  })

  it("interdit de sauvegarder un logo etranger", () => {
    expect(canChangeInvoiceLogo(other, null, 12, true))
      .toBe(false)
  })
})
