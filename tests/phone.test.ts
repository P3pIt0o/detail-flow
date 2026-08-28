import { describe, it, expect } from "vitest"
import { toWhatsAppDigits, toTelHref } from "@/lib/phone"

/**
 * Normalisation téléphonique partagée (bouton WhatsApp + liens tel:).
 * Couvre : format wa.me FR, lien tel: E.164, absence de numéro, unicité
 * par tenant (chaque numéro produit sa propre sortie).
 */
describe("toWhatsAppDigits", () => {
  it("convertit un numéro FR local en format international wa.me", () => {
    expect(toWhatsAppDigits("06 99 90 13 03")).toBe("33699901303")
    expect(toWhatsAppDigits("06.99.90.13.03")).toBe("33699901303")
    expect(toWhatsAppDigits("06-99-90-13-03")).toBe("33699901303")
    expect(toWhatsAppDigits("(0)6 99 90 13 03")).toBe("33699901303")
  })

  it("conserve un numéro déjà international", () => {
    expect(toWhatsAppDigits("+33 6 99 90 13 03")).toBe("33699901303")
    expect(toWhatsAppDigits("33699901303")).toBe("33699901303")
  })

  it("renvoie null sans numéro valide (le bouton ne s'affiche pas)", () => {
    expect(toWhatsAppDigits(null)).toBeNull()
    expect(toWhatsAppDigits(undefined)).toBeNull()
    expect(toWhatsAppDigits("")).toBeNull()
    expect(toWhatsAppDigits("   ")).toBeNull()
    expect(toWhatsAppDigits("abc")).toBeNull()
  })

  it("respecte le numéro propre à chaque tenant", () => {
    expect(toWhatsAppDigits("06 99 90 13 03")).toBe("33699901303")
    expect(toWhatsAppDigits("07 11 22 33 44")).toBe("33711223344")
    expect(toWhatsAppDigits("06 99 90 13 03")).not.toBe(toWhatsAppDigits("07 11 22 33 44"))
  })
})

describe("toTelHref", () => {
  it("produit un lien tel: E.164 pour un numéro FR local", () => {
    expect(toTelHref("06 99 90 13 03")).toBe("tel:+33699901303")
  })

  it("conserve un numéro déjà international", () => {
    expect(toTelHref("+33699901303")).toBe("tel:+33699901303")
  })

  it("renvoie null sans numéro", () => {
    expect(toTelHref(null)).toBeNull()
    expect(toTelHref("")).toBeNull()
  })
})
