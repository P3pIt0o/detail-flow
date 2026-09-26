import { describe, it, expect } from "vitest"
import {
  validateDiagnostic,
  buildProjectSummary,
  visibleSteps,
  isStepVisible,
  normalizeSiteUrl,
  isReasonablePhone,
  sanitizeText,
  type DiagnosticAnswers,
} from "@/lib/diagnostic/schema"

const baseValid = {
  hasSite: "non",
  hasDomain: "non",
  booking: "aucun",
  identity: "rien",
  goals: [],
  features: [],
  companyName: "Atelier Lumière",
  firstName: "Camille",
  email: "camille@exemple.fr",
  phone: "06 12 34 56 78",
}

describe("validateDiagnostic — contact requis", () => {
  it("accepte une demande minimale valide", () => {
    const res = validateDiagnostic(baseValid)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.companyName).toBe("Atelier Lumière")
      expect(res.data.email).toBe("camille@exemple.fr")
    }
  })

  it("rejette un email invalide", () => {
    const res = validateDiagnostic({ ...baseValid, email: "pas-un-email" })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.email).toBeDefined()
  })

  it("rejette un téléphone invalide", () => {
    const res = validateDiagnostic({ ...baseValid, phone: "123" })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.phone).toBeDefined()
  })

  it("rejette une entreprise/prénom trop courts", () => {
    const res = validateDiagnostic({ ...baseValid, companyName: "A", firstName: "" })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.errors.companyName).toBeDefined()
      expect(res.errors.firstName).toBeDefined()
    }
  })
})

describe("validateDiagnostic — logique conditionnelle URL", () => {
  it("exige une URL valide quand un site existe", () => {
    const res = validateDiagnostic({ ...baseValid, hasSite: "oui", siteUrl: "" })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.siteUrl).toBeDefined()
  })

  it("normalise l'URL fournie (ajoute https://)", () => {
    const res = validateDiagnostic({ ...baseValid, hasSite: "oui", siteUrl: "spiritacs.com" })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.data.siteUrl).toBe("https://spiritacs.com")
  })

  it("ignore l'URL quand il n'y a pas de site", () => {
    const res = validateDiagnostic({ ...baseValid, hasSite: "non", siteUrl: "peu-importe" })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.data.siteUrl).toBe("")
  })
})

describe("validateDiagnostic — enums & multi-sélection", () => {
  it("filtre les valeurs multi-sélection hors liste", () => {
    const res = validateDiagnostic({
      ...baseValid,
      goals: ["site_pro", "hack", "site_pro", "moderniser"],
      features: ["reservation", "___", "seo_local"],
    })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.goals).toEqual(["site_pro", "moderniser"])
      expect(res.data.features).toEqual(["reservation", "seo_local"])
    }
  })

  it("ne conserve bookingTool que pour logiciel/autre", () => {
    const kept = validateDiagnostic({ ...baseValid, booking: "logiciel", bookingTool: "Planity" })
    const dropped = validateDiagnostic({ ...baseValid, booking: "telephone", bookingTool: "Planity" })
    if (kept.ok) expect(kept.data.bookingTool).toBe("Planity")
    if (dropped.ok) expect(dropped.data.bookingTool).toBe("")
  })

  it("borne la longueur du commentaire", () => {
    const res = validateDiagnostic({ ...baseValid, comment: "x".repeat(5000) })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.data.comment.length).toBe(1000)
  })
})

describe("visibilité des étapes (parcours conditionnel)", () => {
  const a: DiagnosticAnswers = {
    hasSite: "non",
    siteUrl: "",
    hasDomain: "non",
    domain: "",
    booking: "aucun",
    bookingTool: "",
    goals: [],
    features: [],
    identity: null,
    companyName: "",
    firstName: "",
    email: "",
    phone: "",
    comment: "",
  }

  it("masque les micro-étapes non pertinentes", () => {
    expect(isStepVisible("siteUrl", a)).toBe(false)
    expect(isStepVisible("domain", a)).toBe(false)
    expect(isStepVisible("bookingTool", a)).toBe(false)
    expect(visibleSteps(a)).not.toContain("siteUrl")
  })

  it("révèle siteUrl quand hasSite=oui", () => {
    expect(visibleSteps({ ...a, hasSite: "oui" })).toContain("siteUrl")
  })

  it("révèle domain quand hasDomain=oui, bookingTool quand booking=autre", () => {
    expect(visibleSteps({ ...a, hasDomain: "oui" })).toContain("domain")
    expect(visibleSteps({ ...a, booking: "autre" })).toContain("bookingTool")
  })
})

describe("buildProjectSummary", () => {
  it("reflète les réponses et n'affiche que le rempli", () => {
    const rows = buildProjectSummary({
      hasSite: "oui",
      siteUrl: "https://spiritacs.com",
      hasDomain: "oui",
      domain: "spiritacs.com",
      booking: "logiciel",
      bookingTool: "Planity",
      goals: ["site_pro", "visibilite_google"],
      features: ["reservation", "seo_local"],
      identity: "logo_couleurs",
      companyName: "Spirit",
      firstName: "Corentin",
      email: "c@ex.fr",
      phone: "0600000000",
      comment: "",
    })
    const map = Object.fromEntries(rows.map((r) => [r.label, r.value]))
    expect(map["Site actuel"]).toBe("https://spiritacs.com")
    expect(map["Nom de domaine"]).toContain("spiritacs.com")
    expect(map["Prise de rendez-vous"]).toContain("Planity")
    expect(map["Objectifs prioritaires"]).toContain("professionnel")
    expect(map["Fonctionnalités souhaitées"]).toContain("SEO local")
    expect(map["Identité visuelle"]).toBeDefined()
  })

  it("omet les sections vides", () => {
    const rows = buildProjectSummary({
      hasSite: null,
      siteUrl: "",
      hasDomain: null,
      domain: "",
      booking: null,
      bookingTool: "",
      goals: [],
      features: [],
      identity: null,
      companyName: "",
      firstName: "",
      email: "",
      phone: "",
      comment: "",
    })
    expect(rows).toHaveLength(0)
  })
})

describe("helpers", () => {
  it("normalizeSiteUrl", () => {
    expect(normalizeSiteUrl("exemple.fr")).toBe("https://exemple.fr")
    expect(normalizeSiteUrl("https://a.fr/")).toBe("https://a.fr")
    expect(normalizeSiteUrl("sansdomaine")).toBeNull()
    expect(normalizeSiteUrl("")).toBeNull()
  })

  it("isReasonablePhone", () => {
    expect(isReasonablePhone("06 12 34 56 78")).toBe(true)
    expect(isReasonablePhone("+33 6 12 34 56 78")).toBe(true)
    expect(isReasonablePhone("123")).toBe(false)
    expect(isReasonablePhone("lettres")).toBe(false)
  })

  it("sanitizeText retire les caractères de contrôle et borne", () => {
    expect(sanitizeText("a\u0000b", 10)).toBe("a b")
    expect(sanitizeText("abcdef", 3)).toBe("abc")
    expect(sanitizeText(42, 10)).toBe("")
  })
})
