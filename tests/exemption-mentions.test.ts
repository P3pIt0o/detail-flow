import { describe, it, expect } from "vitest"
import { getExemptionMentions } from "@/lib/billing/exemption-mentions"

describe("exemption-mentions — applicabilité", () => {
  it("assujetti (subject) => aucune mention nécessaire", () => {
    for (const country of ["FR", "BE", "CH", "ES"]) {
      const r = getExemptionMentions({ country, vatStatus: "subject" })
      expect(r.applicable).toBe(false)
      expect(r.proposals).toHaveLength(0)
      expect(r.note.length).toBeGreaterThan(0)
    }
  })

  it("statut inconnu => pas de proposition, invite à préciser", () => {
    for (const vatStatus of ["unknown", "", null, undefined]) {
      const r = getExemptionMentions({ country: "FR", vatStatus })
      expect(r.applicable).toBe(false)
      expect(r.proposals).toHaveLength(0)
    }
  })
})

describe("exemption-mentions — pas d'hallucination réglementaire", () => {
  it("FR exempt => uniquement l'art. 293 B du CGI (référence connue et déjà par défaut)", () => {
    const r = getExemptionMentions({ country: "FR", vatStatus: "exempt" })
    expect(r.applicable).toBe(true)
    expect(r.proposals).toHaveLength(1)
    expect(r.proposals[0].mention).toBe("TVA non applicable, art. 293 B du CGI")
    expect(r.proposals[0].source?.url).toContain("impots.gouv.fr")
  })

  it("BE exempt => AUCUN numéro d'article de loi cité", () => {
    const r = getExemptionMentions({ country: "BE", vatStatus: "exempt" })
    expect(r.applicable).toBe(true)
    for (const p of r.proposals) {
      // Aucune mention ne doit contenir un motif du type "art. 44" / "article 56".
      expect(p.mention.toLowerCase()).not.toMatch(/art\.?\s*\d|article\s*\d/)
    }
    expect(r.proposals[0].source?.url).toContain("finances.belgium.be")
  })

  it("CH exempt => AUCUN numéro d'article de loi cité", () => {
    const r = getExemptionMentions({ country: "CH", vatStatus: "exempt" })
    expect(r.applicable).toBe(true)
    for (const p of r.proposals) {
      expect(p.mention.toLowerCase()).not.toMatch(/art\.?\s*\d|article\s*\d/)
    }
    expect(r.proposals[0].source?.url).toContain("estv.admin.ch")
  })

  it("pays non pris en charge => formulation générale sans article, sans source", () => {
    const r = getExemptionMentions({ country: "ES", vatStatus: "exempt" })
    expect(r.applicable).toBe(true)
    expect(r.proposals[0].mention.toLowerCase()).not.toMatch(/art\.?\s*\d|article\s*\d/)
    expect(r.proposals[0].source).toBeUndefined()
  })

  it("chaque cas exempt fournit une note de vérification (jamais « conforme »)", () => {
    for (const country of ["FR", "BE", "CH", "ES"]) {
      const r = getExemptionMentions({ country, vatStatus: "exempt" })
      expect(r.note.length).toBeGreaterThan(0)
      expect(r.note.toLowerCase()).not.toContain("conforme")
    }
  })

  it("insensible à la casse du pays et du statut", () => {
    const a = getExemptionMentions({ country: "fr", vatStatus: "EXEMPT" })
    const b = getExemptionMentions({ country: "FR", vatStatus: "exempt" })
    expect(a).toEqual(b)
  })
})
