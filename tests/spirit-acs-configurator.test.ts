import { describe, it, expect } from "vitest"
import {
  getServiceRule,
  getServiceFormulas,
  formulaPriceLabel,
  listConfiguratorServices,
  serializeConfiguratorDescription,
  buildSummary,
  VEHICLE_TYPES,
  PPF_ZONES,
  type ConfiguratorSelection,
} from "@/components/custom-sites/spirit-acs/configurator/config"
import { SPIRIT_SERVICES } from "@/components/custom-sites/spirit-acs/seo-content"

/**
 * Phase 5 — Configurateur Spirit ACS. Ces tests verrouillent les RÈGLES métier
 * validées et la projection ZÉRO-MIGRATION de la sélection vers `description`,
 * sans dépendre de l'UI ni du serveur. Ils couvrent aussi les 2 corrections
 * demandées (polissage sans niveau ; céramique surfaces vitrées 90 € / jantes
 * 1 an sur devis).
 */
describe("configurateur — source unique & projection", () => {
  it("liste exactement les prestations éditoriales (aucune inventée)", () => {
    expect(listConfiguratorServices().map((s) => s.slug)).toEqual(SPIRIT_SERVICES.map((s) => s.slug))
  })

  it("propose des types de véhicule et des zones PPF bornés (pas de prix par zone)", () => {
    expect(VEHICLE_TYPES).toContain("Moto / Scooter")
    expect(VEHICLE_TYPES).toContain("Autre")
    expect(PPF_ZONES.length).toBeGreaterThan(0)
  })
})

describe("correction #1 — polissage", () => {
  it("n'autorise aucun choix de niveau par le client et aboutit à un rendez-vous", () => {
    const rule = getServiceRule("polissage-automobile")
    expect(rule.mode).toBe("info-formula")
    expect(rule.finalAction).toBe("appointment")
    expect(rule.photosRecommended).toBe(false)
  })

  it("sérialise le polissage en demande de rendez-vous, sans niveau choisi", () => {
    const sel: ConfiguratorSelection = {
      serviceSlug: "polissage-automobile",
      serviceTitle: "Polissage et protection céramique",
      vehicleType: "Berline",
      vehicleBrand: "BMW",
      vehicleModel: "Série 3",
      audience: "particulier",
      message: "",
    }
    const out = serializeConfiguratorDescription(sel)
    expect(out).toContain("rendez-vous")
    expect(out).toContain("déterminé par Spirit ACS")
    expect(out.toLowerCase()).not.toContain("formule souhaitée")
  })
})

describe("correction #2 — céramique", () => {
  const formulas = getServiceFormulas("protection-ceramique")

  it("affiche les surfaces vitrées à 90 € (exact)", () => {
    const vitrees = formulas.find((f) => f.label === "Céramique surfaces vitrées")
    expect(vitrees).toBeDefined()
    expect(vitrees!.priceKind).toBe("exact")
    expect(vitrees!.priceCents).toBe(9000)
    // Intl.NumberFormat insère une espace fine insécable avant « € » : on
    // vérifie le montant et la devise sans coder en dur ce caractère.
    expect(formulaPriceLabel(vitrees!)).toMatch(/^90,00\s?€$/)
  })

  it("affiche les jantes 1 an sur devis (aucun prix)", () => {
    const jantes = formulas.find((f) => f.label === "Céramique jantes 1 an")
    expect(jantes).toBeDefined()
    expect(jantes!.priceKind).toBe("quote")
    expect(jantes!.priceCents).toBeUndefined()
    expect(formulaPriceLabel(jantes!)).toBe("Sur devis")
  })

  it("laisse le client sélectionner une formule, validée ensuite par Spirit ACS", () => {
    const rule = getServiceRule("protection-ceramique")
    expect(rule.mode).toBe("select-formula")
    expect(rule.finalAction).toBe("quote")

    const sel: ConfiguratorSelection = {
      serviceSlug: "protection-ceramique",
      serviceTitle: "Protection céramique",
      formulaLabel: "Céramique Gtechniq — bicouche, garantie ~5 ans (350,00 €)",
      vehicleType: "SUV / 4×4",
      vehicleBrand: "Porsche",
      vehicleModel: "Cayenne",
      audience: "particulier",
      message: "",
    }
    const out = serializeConfiguratorDescription(sel)
    expect(out).toContain("Formule souhaitée : Céramique Gtechniq")
    expect(out).toContain("à valider par Spirit ACS")
  })
})

describe("PPF — toujours sur devis", () => {
  it("consigne les zones et n'affiche jamais de prix par zone", () => {
    const rule = getServiceRule("protection-ppf")
    expect(rule.mode).toBe("ppf-zones")
    expect(rule.finalAction).toBe("quote")

    const sel: ConfiguratorSelection = {
      serviceSlug: "protection-ppf",
      serviceTitle: "Protection PPF",
      ppfZones: ["Capot (partiel ou intégral)", "Rétroviseurs"],
      ppfOther: "Je ne sais pas encore",
      vehicleType: "Berline",
      vehicleBrand: "Audi",
      vehicleModel: "A4",
      audience: "professionnel",
      message: "Flotte de véhicules",
    }
    const out = serializeConfiguratorDescription(sel)
    expect(out).toContain("Zones à protéger : Capot (partiel ou intégral), Rétroviseurs")
    expect(out).toContain("Autre / précision : Je ne sais pas encore")
    expect(out).toContain("toujours sur devis")
  })
})

describe("récapitulatif", () => {
  it("résume la prestation, le véhicule et le statut du client", () => {
    const sel: ConfiguratorSelection = {
      serviceSlug: "nettoyage-automobile",
      serviceTitle: "Nettoyage intérieur et extérieur",
      vehicleType: "Citadine",
      vehicleBrand: "Renault",
      vehicleModel: "Clio",
      audience: "particulier",
      message: "Intérieur à rafraîchir",
    }
    const summary = buildSummary(sel)
    const map = Object.fromEntries(summary.map((l) => [l.label, l.value]))
    expect(map["Prestation"]).toBe("Nettoyage intérieur et extérieur")
    expect(map["Véhicule"]).toBe("Citadine · Renault · Clio")
    expect(map["Vous êtes"]).toBe("Un particulier")
  })
})
