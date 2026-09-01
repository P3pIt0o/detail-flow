import { describe, it, expect } from "vitest"
import { getTenantHeroImage, DEFAULT_HERO_IMAGE } from "@/lib/tenant-hero"

// Override de l'image de Hero par tenant, résolu par SLUG d'entreprise
// (côté serveur), jamais par l'URL. Non-régression : Just Clean obtient son
// image dédiée, tous les autres tenants et la vitrine racine gardent le défaut.

describe("getTenantHeroImage — override par tenant", () => {
  it("justcleandetailing => image dédiée et isolée", () => {
    expect(getTenantHeroImage("justcleandetailing")).toBe(
      "/tenants/justcleandetailing/justclean-hero-v1.jpg",
    )
  })

  it("un autre tenant => image par défaut (aucune fuite)", () => {
    expect(getTenantHeroImage("spirit-acs")).toBe(DEFAULT_HERO_IMAGE)
    expect(getTenantHeroImage("un-autre-tenant")).toBe(DEFAULT_HERO_IMAGE)
  })

  it("vitrine racine sans tenant (null/undefined) => image par défaut", () => {
    expect(getTenantHeroImage(null)).toBe(DEFAULT_HERO_IMAGE)
    expect(getTenantHeroImage(undefined)).toBe(DEFAULT_HERO_IMAGE)
  })

  it("slug inconnu (sensible à la casse) => pas d'override accidentel", () => {
    expect(getTenantHeroImage("JustCleanDetailing")).toBe(DEFAULT_HERO_IMAGE)
    expect(getTenantHeroImage("")).toBe(DEFAULT_HERO_IMAGE)
  })
})
