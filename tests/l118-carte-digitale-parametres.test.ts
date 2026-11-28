import { describe, expect, it } from "vitest"
import { findCategoryByTab, getVisibleSettingsCategories } from "@/lib/admin/settings-nav"
import { searchSettings } from "@/lib/admin/settings-search"

const HREF = "/admin/parametres?tab=digital-card"
const hrefs = (q: string, site?: string) => searchSettings(q, site).map((r) => r.href)

describe("L118 — carte digitale dans les Paramètres de L97", () => {
  it("rangée dans « Ma page de réservation »", () => {
    expect(findCategoryByTab("digital-card")).toMatchObject({ id: "site", label: "Ma page de réservation" })
  })

  it("booking_only : demandes spéciales et carte digitale", () => {
    const site = getVisibleSettingsCategories(null, "booking_only").find((c) => c.id === "site")
    expect(site?.subTabs.map((t) => t.value)).toEqual(["custom-requests", "digital-card"])
  })

  it("tenant standard : la recherche mène à la carte", () => {
    expect(hrefs("carte digitale").some((h) => h.startsWith(HREF))).toBe(true)
  })

  it.each(["carte digitale", "qr code", "vcard"])("Spirit ACS : « %s » ne propose pas la carte (règle L102)", (q) => {
    expect(hrefs(q, "spirit-acs").some((h) => h.startsWith(HREF))).toBe(false)
  })
})
