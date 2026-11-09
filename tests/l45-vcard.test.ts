import { describe, it, expect } from "vitest"
import { buildVCard, buildCardActions, isFrenchMobile } from "@/lib/digital-card"

/** L45 — C2 : vCard valide + boutons masqués quand la donnée manque (logique pure). */

describe("buildVCard", () => {
  const full = buildVCard({
    name: "Brillance Auto",
    phone: "06 12 34 56 78",
    email: "contact@brillance.fr",
    website: "https://brillance.fr",
    address: { street: "12 rue de la Paix", postalCode: "69001", city: "Lyon" },
  })

  it("structure vCard 3.0, lignes séparées par CRLF", () => {
    const lines = full.split("\r\n")
    expect(lines[0]).toBe("BEGIN:VCARD")
    expect(lines[1]).toBe("VERSION:3.0")
    expect(lines).toContain("END:VCARD")
    expect(full.endsWith("END:VCARD\r\n")).toBe(true)
    expect(full.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/)
    expect(lines).toContain("FN:Brillance Auto")
    expect(lines).toContain("TEL;TYPE=WORK,VOICE:+33612345678")
    expect(lines).toContain("EMAIL;TYPE=INTERNET:contact@brillance.fr")
    expect(lines).toContain("URL:https://brillance.fr")
    expect(lines).toContain("ADR;TYPE=WORK:;;12 rue de la Paix;Lyon;;69001;")
  })

  it("échappe \\ , ; et les retours à la ligne", () => {
    const v = buildVCard({ name: "A, B; C\\D\nE" })
    expect(v).toContain("FN:A\\, B\\; C\\\\D\\nE")
    expect(v.split("\r\n").filter((l) => l.startsWith("FN:"))).toHaveLength(1)
  })

  it("conserve les accents UTF-8", () => {
    expect(buildVCard({ name: "Détailing Élégance" })).toContain("FN:Détailing Élégance")
  })

  it("champ absent ou vide → ligne absente", () => {
    const v = buildVCard({ name: "Solo", phone: "  ", email: null, website: undefined, address: null })
    expect(v).not.toMatch(/TEL|EMAIL|URL|ADR/)
    expect(v).toContain("FN:Solo")
  })
})

describe("isFrenchMobile", () => {
  it("06/07 et +336/+337 → oui ; fixe, étranger ou vide → non", () => {
    expect(isFrenchMobile("06 12 34 56 78")).toBe(true)
    expect(isFrenchMobile("07.12.34.56.78")).toBe(true)
    expect(isFrenchMobile("+33 6 12 34 56 78")).toBe(true)
    expect(isFrenchMobile("+33712345678")).toBe(true)
    expect(isFrenchMobile("04 78 12 34 56")).toBe(false)
    expect(isFrenchMobile("+44 7700 900123")).toBe(false)
    expect(isFrenchMobile("")).toBe(false)
    expect(isFrenchMobile(null)).toBe(false)
  })
})

describe("buildCardActions", () => {
  const all = {
    reservationUrl: "https://detailflow.fr/reservation?tenant=a",
    phone: "06 12 34 56 78",
    address: "12 rue de la Paix, 69001 Lyon",
    reviewLink: "https://g.page/r/abc/review",
    contactUrl: "/carte/contact?tenant=a",
  }
  const keys = (a: ReturnType<typeof buildCardActions>) => a.map((x) => x.key)

  it("toutes les données → 6 boutons dans l'ordre, aucun href vide", () => {
    const a = buildCardActions(all)
    expect(keys(a)).toEqual(["book", "call", "whatsapp", "directions", "review", "contact"])
    for (const x of a) expect(x.href.trim()).not.toBe("")
    expect(a.find((x) => x.key === "call")!.href).toBe("tel:+33612345678")
    expect(a.find((x) => x.key === "whatsapp")!.href).toBe("https://wa.me/33612345678")
    expect(a.find((x) => x.key === "directions")!.href).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=12%20rue%20de%20la%20Paix%2C%2069001%20Lyon",
    )
  })

  it("chaque bouton est masqué quand sa donnée manque", () => {
    expect(keys(buildCardActions({ ...all, reservationUrl: null }))).not.toContain("book")
    expect(keys(buildCardActions({ ...all, phone: null }))).not.toContain("call")
    expect(keys(buildCardActions({ ...all, phone: null }))).not.toContain("whatsapp")
    expect(keys(buildCardActions({ ...all, phone: "04 78 12 34 56" }))).toEqual([
      "book",
      "call",
      "directions",
      "review",
      "contact",
    ])
    expect(keys(buildCardActions({ ...all, address: null }))).not.toContain("directions")
    expect(keys(buildCardActions({ ...all, address: "  " }))).not.toContain("directions")
    expect(keys(buildCardActions({ ...all, reviewLink: null }))).not.toContain("review")
  })

  it("rien de renseigné → seul « Enregistrer le contact » reste", () => {
    const a = buildCardActions({ reservationUrl: null, phone: null, address: null, reviewLink: null, contactUrl: "/carte/contact" })
    expect(keys(a)).toEqual(["contact"])
    expect(a[0].label).toBe("Enregistrer le contact")
  })
})
