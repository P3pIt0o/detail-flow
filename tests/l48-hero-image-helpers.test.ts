import { describe, expect, it } from "vitest"
import { parseHeroImageValue, resolveHeroImageSrc } from "@/lib/public-page/hero-image"

describe("parseHeroImageValue", () => {
  it.each([
    ["https://cdn.exemple.fr/hero.jpg"],
    ["/tenants/x/hero.jpg"],
    ["hero-image/company-7-hero-1-abc.jpg"],
  ])("accepte %s", (v) => {
    expect(parseHeroImageValue(v, 7)).toBe(v)
  })

  it("vide → null", () => {
    expect(parseHeroImageValue(null, 7)).toBeNull()
    expect(parseHeroImageValue("  ", 7)).toBeNull()
  })

  it.each([
    ["http://exemple.fr/hero.jpg"],
    ["javascript:alert(1)"],
    ["data:image/png;base64,AAA"],
    ["texte libre"],
    ["hero-image/company-77-hero.jpg"], // autre tenant (company-7 contre company-77)
    ["service-image/company-7-x.jpg"],
    ["hero-image/company-7-../company-8-x.jpg"],
  ])("refuse %s", (v) => {
    expect(() => parseHeroImageValue(v, 7)).toThrow()
  })
})

describe("resolveHeroImageSrc", () => {
  it("valeurs héritées inchangées, vide → null", () => {
    expect(resolveHeroImageSrc("https://cdn.exemple.fr/h.jpg", "a")).toBe("https://cdn.exemple.fr/h.jpg")
    expect(resolveHeroImageSrc("/hero.png", "a")).toBe("/hero.png")
    expect(resolveHeroImageSrc(null, "a")).toBeNull()
  })

  it("pathname privé → route sécurisée, paramètres encodés", () => {
    expect(resolveHeroImageSrc("hero-image/company-7-h.jpg", "mon slug")).toBe(
      "/api/hero-image?company=mon%20slug&p=hero-image%2Fcompany-7-h.jpg",
    )
  })
})
