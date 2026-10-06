import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { withPlansSlot, PLANS_SLOT } from "@/lib/home-plans-placement"
import type { HomeSectionKey } from "@/lib/site-content"

const homeSource = readFileSync(join(process.cwd(), "app/(site)/page.tsx"), "utf8")

describe("accueil standard : placement des Formules d'entretien", () => {
  const fullOrder: HomeSectionKey[] = [
    "about",
    "whyUs",
    "services",
    "process",
    "gallery",
    "reviews",
    "customRequests",
    "contact",
  ]

  it("Prestations avant Formules, Formules avant Demandes spéciales", () => {
    const slots = withPlansSlot(fullOrder)
    expect(slots.indexOf("services")).toBeLessThan(slots.indexOf(PLANS_SLOT))
    expect(slots.indexOf(PLANS_SLOT)).toBe(slots.indexOf("services") + 1)
    expect(slots.indexOf(PLANS_SLOT)).toBeLessThan(slots.indexOf("customRequests"))
  })

  it("rend le bloc Formules une seule fois et conserve l'ordre des autres sections", () => {
    const slots = withPlansSlot(fullOrder)
    expect(slots.filter((s) => s === PLANS_SLOT)).toHaveLength(1)
    expect(slots.filter((s) => s !== PLANS_SLOT)).toEqual(fullOrder)
  })

  it("respecte un ordre personnalisé", () => {
    const custom: HomeSectionKey[] = ["reviews", "services", "contact", "customRequests", "about"]
    expect(withPlansSlot(custom)).toEqual(["reviews", "services", PLANS_SLOT, "contact", "customRequests", "about"])
  })

  it("repli sans 'services' : avant customRequests/contact", () => {
    expect(withPlansSlot(["about", "reviews", "contact", "customRequests"])).toEqual([
      "about",
      "reviews",
      PLANS_SLOT,
      "contact",
      "customRequests",
    ])
  })

  it("repli sans 'services' ni contact/demandes : en fin de liste", () => {
    expect(withPlansSlot(["about", "reviews"])).toEqual(["about", "reviews", PLANS_SLOT])
  })

  it("page.tsx : PublicPlans rendu une seule fois, via loadPublicOffer et le slot", () => {
    expect(homeSource.match(/<PublicPlans\b/g)).toHaveLength(1)
    expect(homeSource.match(/loadPublicOffer\(db, tenant\?\.id\)/g)).toHaveLength(1)
    expect(homeSource).toContain("withPlansSlot(order)")
    expect(homeSource).not.toMatch(/order\.map\(\(key\) => sections\[key\]\)\}\s*<PublicPlans/)
  })
})
