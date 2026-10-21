import { describe, expect, it } from "vitest"
import { buildAdminNav, buildAdminNavGroups } from "@/lib/admin/nav"

/** L21 — entrée « Offres & réductions » : groupe Gestion ; masquée pour les tunnels historiques. */
const base = { intent: null, customSiteKey: null as string | null }
const hrefs = (o: typeof base) => buildAdminNav(o).map((i) => i.href)

describe("L21 — navigation admin", () => {
  it("présente pour un tenant standard, dans le groupe Gestion", () => {
    expect(hrefs(base)).toContain("/admin/offres")
    const gestion = buildAdminNavGroups(base).find((g) => g.id === "gestion")!
    expect(gestion.items.map((i) => i.href)).toContain("/admin/offres")
    expect(gestion.items.find((i) => i.href === "/admin/offres")).toMatchObject({ label: "Offres & réductions", icon: "offres" })
  })
  it("absente pour Spirit ACS et Rozan (aucune offre lue pour eux)", () => {
    for (const k of ["spirit-acs", "rozan"]) expect(hrefs({ ...base, customSiteKey: k })).not.toContain("/admin/offres")
  })
  it("présente pour un site personnalisé utilisant Booking V2 (ex. Cleanyzer)", () => {
    expect(hrefs({ ...base, customSiteKey: "cleanyzer" })).toContain("/admin/offres")
  })
  it("les autres entrées sont inchangées", () => {
    for (const k of [null, "spirit-acs", "rozan", "cleanyzer"]) {
      const without = hrefs({ ...base, customSiteKey: k }).filter((h) => h !== "/admin/offres")
      expect(without).not.toContain("/admin/offres")
      expect(without.length).toBeGreaterThan(5)
    }
    expect(hrefs(base).indexOf("/admin/offres")).toBe(hrefs(base).indexOf("/admin/produits") + 1)
  })
})
