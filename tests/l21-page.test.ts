import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/** L21 — structure de l'écran : tenant et rôle de session, actions L19 uniquement. */
const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8")
const page = read("app/admin/(dashboard)/offres/page.tsx")
const ui = read("components/admin/offres/offers-manager.tsx")

describe("L21 — page Offres & réductions", () => {
  it("tenant et rôle issus de la session ; Spirit ACS / Rozan : non disponible", () => {
    expect(page).toContain("await requireCompanyMember()")
    expect(page).toContain("usesLegacyBookingWizard(tenant.customSiteKey)")
    expect(page).toMatch(/canEdit=\{role === "OWNER" \|\| role === "ADMIN"\}/)
    expect(page).toContain("getAdminServices(tenant.id)")
    expect(page).toContain("getAdminOptions(tenant.id)")
  })
  it("aucun companyId lu du navigateur, aucune requête directe", () => {
    for (const src of [page, ui]) {
      expect(src).not.toMatch(/searchParams|formData\.get\(\s*["']companyId|companyId:/)
      expect(src).not.toMatch(/@\/lib\/db["']/)
    }
  })
  it("l'interface n'appelle que les actions serveur L19 (droits contrôlés côté serveur)", () => {
    const imported = /from "@\/app\/admin\/\(dashboard\)\/offres\/actions"/.test(ui)
    expect(imported).toBe(true)
    // Le stockage n'est importé que pour ses TYPES (effacés à la compilation).
    expect(ui).toContain('import type { AdminLists } from "@/lib/booking/promotions-store"')
    expect(ui.replace('import type { AdminLists } from "@/lib/booking/promotions-store"', "")).not.toContain("promotions-store")
    expect(ui).toMatch(/^"use client"/)
  })
  it("chaque bouton d'écriture est conditionné à canEdit", () => {
    const writeBlocks = ui.split("{canEdit && (").length - 1
    expect(writeBlocks).toBeGreaterThanOrEqual(6)
    for (const fn of ["deletePromotionAction", "setPromotionActiveAction", "duplicatePromotionAction", "setEquivalenceActiveAction", "deleteEquivalenceAction", "setUpsellActiveAction", "deleteUpsellAction"]) {
      const at = ui.indexOf(`${fn}(`)
      expect(at, fn).toBeGreaterThan(0)
      expect(ui.lastIndexOf("{canEdit && (", at), fn).toBeGreaterThan(0)
    }
  })
})
