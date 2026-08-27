import { describe, it, expect } from "vitest"
import { computeBillingSetup, type BillingSetupInput } from "@/lib/billing/setup-checklist"

// Profil FR complet et confirmé (tout renseigné, formes valides).
const completeFR: BillingSetupInput = {
  country: "FR",
  confirmed: true,
  legalForm: "SASU",
  legalRegistrationNumber: "12345678900012", // SIRET 14 chiffres
  vatNumber: "FR40303265045",
  vatStatus: "subject",
  vatEnabled: true,
  vatExemptNote: null,
  defaultCurrency: "EUR",
  invoiceCompanyAddress: "12 rue des Ateliers, 75000 Paris",
  invoiceIban: "FR7630006000011234567890189",
  invoiceDueDays: 30,
  invoicePrefix: "FAC",
  frBusinessCategory: "pme",
}

describe("setup-checklist — profil complet", () => {
  it("FR complet => 100% et tous les indispensables terminés", () => {
    const r = computeBillingSetup(completeFR)
    expect(r.allMandatoryDone).toBe(true)
    expect(r.mandatoryTodo).toBe(0)
    expect(r.percent).toBe(100)
    expect(r.remaining).toBe(0)
  })
})

describe("setup-checklist — profil vide", () => {
  it("tout vide => indispensables en todo, confirmation bloquée", () => {
    const r = computeBillingSetup({
      country: "FR",
      confirmed: false,
      legalForm: null,
      legalRegistrationNumber: null,
      vatNumber: null,
      vatStatus: "unknown",
      vatEnabled: false,
      vatExemptNote: null,
      defaultCurrency: null,
      invoiceCompanyAddress: null,
      invoiceIban: null,
      invoiceDueDays: 0,
      invoicePrefix: null,
      frBusinessCategory: "unknown",
    })
    expect(r.allMandatoryDone).toBe(false)
    expect(r.mandatoryTodo).toBeGreaterThan(0)
    expect(r.percent).toBeLessThan(100)
    // La confirmation est un élément indispensable, à l'état todo.
    const confirm = r.items.find((i) => i.key === "confirmation")
    expect(confirm?.mandatory).toBe(true)
    expect(confirm?.state).toBe("todo")
  })
})

describe("setup-checklist — numéro d'immatriculation mal formé", () => {
  it("SIRET invalide (présent mais forme douteuse) => review, pas done", () => {
    const r = computeBillingSetup({ ...completeFR, legalRegistrationNumber: "123" })
    const reg = r.items.find((i) => i.key === "registration")
    expect(reg?.state).toBe("review")
    // Un « à vérifier » n'est pas bloquant pour les indispensables déjà valides,
    // mais l'immatriculation est indispensable => allMandatoryDone bascule.
    expect(r.allMandatoryDone).toBe(false)
  })
})

describe("setup-checklist — TVA & exonération", () => {
  it("exempt sans mention => élément mention d'exonération indispensable en todo", () => {
    const r = computeBillingSetup({
      ...completeFR,
      vatStatus: "exempt",
      vatEnabled: false,
      vatExemptNote: null,
    })
    const note = r.items.find((i) => i.key === "exemptNote")
    expect(note?.mandatory).toBe(true)
    expect(note?.state).toBe("todo")
  })

  it("non redevable sans n° de TVA => normal (done, non bloquant)", () => {
    const r = computeBillingSetup({
      ...completeFR,
      vatStatus: "exempt",
      vatEnabled: false,
      vatExemptNote: "TVA non applicable, art. 293 B du CGI",
      vatNumber: null,
    })
    const vat = r.items.find((i) => i.key === "vatNumber")
    expect(vat?.mandatory).toBe(false)
    expect(vat?.state).toBe("done")
  })
})

describe("setup-checklist — spécificités pays", () => {
  it("catégorie entreprise (FR) présente uniquement pour la France", () => {
    const fr = computeBillingSetup(completeFR)
    expect(fr.items.some((i) => i.key === "frCategory")).toBe(true)

    const be = computeBillingSetup({ ...completeFR, country: "BE", legalRegistrationNumber: "0202239951", vatNumber: "BE0202239951" })
    expect(be.items.some((i) => i.key === "frCategory")).toBe(false)
  })

  it("libellés d'identité adaptés au pays vendeur", () => {
    const fr = computeBillingSetup(completeFR)
    const be = computeBillingSetup({ ...completeFR, country: "BE" })
    const frReg = fr.items.find((i) => i.key === "registration")!.label
    const beReg = be.items.find((i) => i.key === "registration")!.label
    expect(frReg).not.toBe(beReg)
  })
})

describe("setup-checklist — cohérence des ancres", () => {
  it("chaque élément expose une ancre non vide", () => {
    const r = computeBillingSetup(completeFR)
    for (const item of r.items) {
      expect(item.anchor.length).toBeGreaterThan(0)
    }
  })
})
