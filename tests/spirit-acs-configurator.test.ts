import { describe, it, expect } from "vitest"
import {
  getServiceRule,
  getServiceFormulas,
  formulaPriceLabel,
  listConfiguratorServices,
  serializeConfiguratorDescription,
  buildSummary,
  canonicalServiceSlug,
  POLISH_INSPECTION_VALUE,
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
  it("liste les familles commerciales depuis la source unique (céramique intégrée au polissage, aucune inventée)", () => {
    const slugs = listConfiguratorServices().map((s) => s.slug)
    // La « protection céramique » n'est PAS une entrée autonome (ramenée dans
    // « Polissage & protection céramique »), mais reste dans SPIRIT_SERVICES
    // (page SEO dédiée conservée). Les autres prestations proviennent toutes de
    // la source éditoriale unique — leur nombre suit donc SPIRIT_SERVICES.
    expect(slugs).toEqual(SPIRIT_SERVICES.filter((s) => s.slug !== "protection-ceramique").map((s) => s.slug))
    expect(slugs).toHaveLength(SPIRIT_SERVICES.length - 1)
    expect(slugs).not.toContain("protection-ceramique")
    // Aucun slug inventé : tous proviennent de la source éditoriale unique.
    expect(slugs.every((slug) => SPIRIT_SERVICES.some((s) => s.slug === slug))).toBe(true)
  })

  it("propose exactement 6 types de véhicule (sans Break ni Autre) et des zones PPF bornées", () => {
    expect(VEHICLE_TYPES).toEqual([
      "Citadine",
      "Berline",
      "SUV / 4×4",
      "Monospace",
      "Utilitaire / Van",
      "Moto / Scooter",
    ])
    expect(VEHICLE_TYPES).not.toContain("Break")
    expect(VEHICLE_TYPES).not.toContain("Autre")
    expect(PPF_ZONES.length).toBeGreaterThan(0)
  })
})

describe("polissage & céramique — parcours combiné", () => {
  it("est un parcours choisi par le client, toujours conclu par un devis", () => {
    const rule = getServiceRule("polissage-automobile")
    expect(rule.mode).toBe("polish-and-ceramic")
    expect(rule.finalAction).toBe("quote")
    expect(rule.photosRecommended).toBe(false)
  })

  it("ramène l'entrée « protection céramique » vers le polissage (jamais seule)", () => {
    expect(canonicalServiceSlug("protection-ceramique")).toBe("polissage-automobile")
    expect(canonicalServiceSlug("polissage-automobile")).toBe("polissage-automobile")
    expect(canonicalServiceSlug("nettoyage-automobile")).toBe("nettoyage-automobile")
    // la céramique partage la même règle de parcours combiné.
    expect(getServiceRule("protection-ceramique").mode).toBe("polish-and-ceramic")
  })

  it("sérialise séparément le polissage et la protection céramique", () => {
    const sel: ConfiguratorSelection = {
      serviceSlug: "polissage-automobile",
      serviceTitle: "Polissage et protection céramique",
      polishLevel: "Polissage niveau 1 — éclat (dès 299,00 €)",
      ceramicLabel: "Cire (~9 à 12 mois) (120,00 €)",
      vehicleType: "Citadine",
      vehicleBrand: "Renault",
      vehicleModel: "Clio",
      audience: "particulier",
      message: "",
    }
    const out = serializeConfiguratorDescription(sel)
    expect(out).toContain("Polissage : Polissage niveau 1")
    expect(out).toContain("Protection céramique : Cire")
  })

  it("permet de laisser Spirit ACS déterminer le niveau, sans céramique", () => {
    const sel: ConfiguratorSelection = {
      serviceSlug: "polissage-automobile",
      serviceTitle: "Polissage et protection céramique",
      polishLevel: POLISH_INSPECTION_VALUE,
      ceramicLabel: null,
      vehicleType: "Berline",
      vehicleBrand: "BMW",
      vehicleModel: "Série 3",
      audience: "particulier",
      message: "",
    }
    const out = serializeConfiguratorDescription(sel)
    expect(out).toContain("après inspection")
    expect(out).toContain("Protection céramique : aucune")

    const map = Object.fromEntries(buildSummary(sel).map((l) => [l.label, l.value]))
    expect(map["Polissage"]).toContain("déterminer après inspection")
    expect(map["Protection céramique"]).toBe("Aucune")
  })
})

describe("céramique — données réelles (inchangées)", () => {
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
