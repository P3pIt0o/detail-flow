import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  resolveRegulatoryGuidance,
  type RegulatoryGuidance,
  type RegulatoryStatus,
} from "@/lib/billing/regulatory-guidance"

const statuses = (g: RegulatoryGuidance[]): RegulatoryStatus[] => g.map((x) => x.status)
const text = (g: RegulatoryGuidance[]) => g.map((x) => `${x.title} ${x.message}`).join(" ").toLowerCase()

describe("2B.5B — règle préalable (profil non confirmé)", () => {
  it("1. non confirmé => TO_COMPLETE, aucune conclusion pays", () => {
    for (const country of ["FR", "BE", "CH", "ES", ""]) {
      const g = resolveRegulatoryGuidance({
        country,
        confirmed: false,
        vatStatus: "subject",
        frBusinessCategory: "ge",
      })
      expect(g).toHaveLength(1)
      expect(g[0].status).toBe("TO_COMPLETE")
      // Aucune échéance / conclusion pays détaillée.
      const t = text(g)
      expect(t).not.toContain("2026")
      expect(t).not.toContain("2027")
      expect(t).not.toContain("peppol")
    }
  })
})

describe("2B.5B — France", () => {
  const reception = (g: RegulatoryGuidance[]) =>
    g.find((x) => x.title.toLowerCase().includes("réception"))
  const emission = (g: RegulatoryGuidance[]) =>
    g.find((x) => x.title.toLowerCase().includes("émission"))

  it("2. FR unknown => réception ACTION_REQUIRED + catégorie TO_COMPLETE", () => {
    for (const cat of ["unknown", null]) {
      const g = resolveRegulatoryGuidance({
        country: "FR",
        confirmed: true,
        vatStatus: "subject",
        frBusinessCategory: cat,
      })
      // La réception reste une action requise…
      expect(reception(g)?.status).toBe("ACTION_REQUIRED")
      // …et la catégorie reste à compléter.
      expect(statuses(g)).toContain("TO_COMPLETE")
    }
  })

  it("2ter. FR confirmé => réception TOUJOURS ACTION_REQUIRED (toute catégorie / vatStatus)", () => {
    for (const cat of ["micro", "pme", "eti", "ge", "unknown", null]) {
      for (const vs of ["subject", "exempt", "unknown"]) {
        const g = resolveRegulatoryGuidance({
          country: "FR",
          confirmed: true,
          vatStatus: vs,
          frBusinessCategory: cat,
        })
        const r = reception(g)
        expect(r?.status).toBe("ACTION_REQUIRED")
        expect(r?.deadline).toBe("1er septembre 2026")
      }
    }
  })

  it("3. FR micro et pme => émission INFORMATION au 1er septembre 2027", () => {
    for (const cat of ["micro", "pme"]) {
      const g = resolveRegulatoryGuidance({
        country: "FR",
        confirmed: true,
        vatStatus: "subject",
        frBusinessCategory: cat,
      })
      const e = emission(g)
      expect(e?.status).toBe("INFORMATION")
      expect(e?.deadline).toBe("1er septembre 2027")
    }
  })

  it("4. FR eti et ge => émission ACTION_REQUIRED au 1er septembre 2026", () => {
    for (const cat of ["eti", "ge"]) {
      const g = resolveRegulatoryGuidance({
        country: "FR",
        confirmed: true,
        vatStatus: "subject",
        frBusinessCategory: cat,
      })
      const e = emission(g)
      expect(e?.status).toBe("ACTION_REQUIRED")
      expect(e?.deadline).toBe("1er septembre 2026")
    }
  })

  it("5. FR exempt conserve l'alerte de réception (jamais d'exclusion automatique)", () => {
    const g = resolveRegulatoryGuidance({
      country: "FR",
      confirmed: true,
      vatStatus: "exempt",
      frBusinessCategory: "ge",
    })
    // Réception toujours en action requise malgré "exempt".
    expect(reception(g)?.status).toBe("ACTION_REQUIRED")
    const t = text(g)
    expect(t).toContain("pdf")
    // Aucune conclusion d'exclusion de la réforme.
    expect(t).not.toContain("hors champ")
    expect(t).not.toContain("non concerné")
  })

  it("5bis. formulation prudente : jamais 'toutes les opérations'", () => {
    const g = resolveRegulatoryGuidance({
      country: "FR",
      confirmed: true,
      vatStatus: "subject",
      frBusinessCategory: "ge",
    })
    const t = text(g)
    expect(t).not.toContain("toutes les opérations")
    expect(t).toContain("entreprises concernées")
  })
})

describe("2B.5B — Belgique", () => {
  it("6. BE subject => ACTION_REQUIRED", () => {
    const g = resolveRegulatoryGuidance({
      country: "BE",
      confirmed: true,
      vatStatus: "subject",
      frBusinessCategory: null,
    })
    expect(statuses(g)).toContain("ACTION_REQUIRED")
  })

  it("7. BE exempt/unknown => REVIEW_REQUIRED, jamais d'exemption automatique", () => {
    for (const vs of ["exempt", "unknown"]) {
      const g = resolveRegulatoryGuidance({
        country: "BE",
        confirmed: true,
        vatStatus: vs,
        frBusinessCategory: null,
      })
      expect(statuses(g)).toContain("REVIEW_REQUIRED")
      expect(statuses(g)).not.toContain("ACTION_REQUIRED")
      const t = text(g)
      expect(t).not.toContain("exemption applicable")
      expect(t).not.toContain("exonéré")
    }
  })

  it("8. BE ne présente pas Peppol comme méthode absolument unique", () => {
    for (const vs of ["subject", "exempt", "unknown"]) {
      const g = resolveRegulatoryGuidance({
        country: "BE",
        confirmed: true,
        vatStatus: vs,
        frBusinessCategory: null,
      })
      const t = text(g)
      expect(t).not.toContain("uniquement peppol")
      expect(t).not.toContain("seul peppol")
      expect(t).not.toContain("unique méthode")
      // Une alternative EN 16931 doit rester envisageable pour le cas subject.
      if (vs === "subject") expect(t).toContain("en 16931")
    }
  })
})

describe("2B.5B — Suisse", () => {
  it("9. CH => INFORMATION uniquement, sans obligation Peppol inventée", () => {
    const g = resolveRegulatoryGuidance({
      country: "CH",
      confirmed: true,
      vatStatus: "subject",
      frBusinessCategory: null,
    })
    expect(statuses(g)).toEqual(["INFORMATION"])
    const t = text(g)
    expect(t).not.toContain("peppol")
    expect(t).not.toContain("obligation générale")
  })
})

describe("2B.5B — autres pays", () => {
  it("10. pays générique => aucune conclusion spécifique / échéance", () => {
    const g = resolveRegulatoryGuidance({
      country: "ES",
      confirmed: true,
      vatStatus: "subject",
      frBusinessCategory: null,
    })
    const t = text(g)
    expect(t).toContain("ne fournit pas encore")
    expect(g.every((x) => !x.deadline)).toBe(true)
    expect(t).not.toContain("2026")
    expect(t).not.toContain("2027")
  })
})

describe("2B.5B — API publique restreinte au profil vendeur", () => {
  const engineSrc = readFileSync(join(process.cwd(), "lib/billing/regulatory-guidance.ts"), "utf8")
  const engineCode = engineSrc.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")

  it("11. aucune entrée client / facture / taxTreatment dans le moteur", () => {
    for (const banned of [
      /taxTreatment/,
      /taxLegalMention/,
      /customer/i,
      /invoice/i,
      /\bamount/i,
      /\bmontant/i,
      /\bclient\b/i,
    ]) {
      expect(engineCode).not.toMatch(banned)
    }
  })

  it("11bis. pas d'accès DB / réseau / React", () => {
    for (const banned of [/import .*drizzle/i, /from "@\/lib\/db/i, /fetch\(/, /useState|useMemo|react/i]) {
      expect(engineCode).not.toMatch(banned)
    }
  })

  it("aucune affirmation de conformité dans le moteur", () => {
    expect(engineCode).not.toMatch(/non conforme/i)
    expect(engineCode).not.toMatch(/\bconforme\b/i)
    expect(engineCode).not.toMatch(/TVA valide/i)
    expect(engineCode).not.toMatch(/numéro tva vérifié/i)
    expect(engineCode).not.toMatch(/autoliquidation applicable/i)
  })
})
