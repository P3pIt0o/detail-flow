import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * L44 — Demandes spéciales : mode widget (booking_only) + type intégré « Nettoyage textile ».
 * Logique pure + action serveur (auth et DB mockées, aucun accès réseau) + câblage (contrôle source).
 */

const requireCompanyMember = vi.fn()
let captured: { set: Record<string, unknown>; where: unknown } | null = null

vi.mock("@/lib/admin", () => ({ requireCompanyMember: (...a: unknown[]) => requireCompanyMember(...a) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/db/schema", () => ({ companies: { id: "companies.id" } }))
vi.mock("drizzle-orm", () => ({ eq: (a: unknown, b: unknown) => ({ eq: [a, b] }) }))
vi.mock("@/lib/db", () => ({
  db: {
    update: () => ({
      set: (set: Record<string, unknown>) => ({
        where: (where: unknown) => {
          captured = { set, where }
          return Promise.resolve()
        },
      }),
    }),
  },
}))

import { SETTINGS_CATEGORIES, findCategoryByTab, getVisibleSettingsCategories } from "@/lib/admin/settings-nav"
import { findRequestType, resolveCustomRequestsConfig, type CustomRequestsConfig } from "@/lib/custom-requests"
import { tenantPublicPathUrl } from "@/lib/tenant-shared"
import { saveCustomRequestsConfig } from "@/app/admin/(dashboard)/parametres/custom-requests-actions"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

beforeEach(() => {
  requireCompanyMember.mockReset()
  captured = null
})

describe("C1 — navigation booking_only", () => {
  it("catégorie « Site public » réduite au seul onglet custom-requests", () => {
    const site = getVisibleSettingsCategories(null, "booking_only").find((c) => c.id === "site")
    expect(site?.label).toBe("Site public")
    expect(site?.subTabs.map((t) => t.value)).toEqual(["custom-requests"])
    expect(findCategoryByTab("custom-requests", null, "booking_only")?.id).toBe("site")
    for (const tab of ["site", "appearance", "gallery", "reviews"]) {
      expect(findCategoryByTab(tab, null, "booking_only")).toBeNull()
    }
  })
})

describe("C2 — non-régression des autres tenants", () => {
  it("null, public_page et autre customSiteKey → liste complète identique", () => {
    expect(getVisibleSettingsCategories(null, null)).toBe(SETTINGS_CATEGORIES)
    expect(getVisibleSettingsCategories(null, "public_page")).toBe(SETTINGS_CATEGORIES)
    expect(getVisibleSettingsCategories("autre-tenant", null)).toBe(SETTINGS_CATEGORIES)
  })
  it("spirit-acs (avec ou sans intention) → pas de custom-requests", () => {
    for (const intent of [null, "booking_only", "public_page"]) {
      expect(findCategoryByTab("custom-requests", "spirit-acs", intent)).toBeNull()
    }
  })
})

describe("C3 — URL du lien /demande", () => {
  it("sans domaine personnalisé → racine + ?tenant=", () => {
    expect(tenantPublicPathUrl("/demande", "garage-a", "detailflow.fr")).toBe(
      "https://www.detailflow.fr/demande?tenant=garage-a",
    )
  })
  it("la page paramètres ne passe l'URL qu'en booking_only, calculée côté serveur", () => {
    const src = read("app/admin/(dashboard)/parametres/page.tsx")
    expect(src).toMatch(
      /dashboardIntent === "booking_only"\s*\?\s*tenantPublicPathUrl\("\/demande", tenant\.slug, process\.env\.NEXT_PUBLIC_ROOT_DOMAIN\)\s*:\s*null/,
    )
  })
  it("l'encadré suit l'état ENREGISTRÉ (config.enabled), pas l'interrupteur", () => {
    const src = read("components/admin/settings/custom-requests-settings.tsx")
    expect(src).toContain("config.enabled ?")
    expect(src).toContain("Activez le module pour obtenir votre lien.")
    expect(src).toContain('label="Copier le lien"')
  })
})

describe("C4 — type intégré « Nettoyage textile »", () => {
  it("présent et désactivé pour une config vide ou ancienne", () => {
    for (const raw of [null, { enabled: true, types: [{ key: "sur-mesure", enabled: true }] }]) {
      const t = resolveCustomRequestsConfig(raw).types.find((x) => x.key === "textile")
      expect(t).toMatchObject({ enabled: false, builtin: true })
    }
  })
  it("activable ; findRequestType : tenant A (actif) accepte, tenant B (sans textile) refuse", () => {
    const a = resolveCustomRequestsConfig({ enabled: true, types: [{ key: "textile", enabled: true }] })
    const b = resolveCustomRequestsConfig({ enabled: true, types: [{ key: "sur-mesure", enabled: true }] })
    expect(findRequestType(a, "textile")?.label).toBe("Nettoyage textile (canapé, matelas, tapis, moquette)")
    expect(findRequestType(b, "textile")).toBeNull()
  })

  it("sauvegarde : textile absent de l'entrée reste désactivé, écriture filtrée par le tenant connecté", async () => {
    requireCompanyMember.mockResolvedValue({ tenant: { id: 42, customSiteKey: null, siteContent: { autre: 1 } }, isSuperAdmin: false })
    const input: CustomRequestsConfig = { enabled: true, types: [{ key: "sur-mesure", label: "", enabled: true, builtin: true }] }
    expect(await saveCustomRequestsConfig(input)).toEqual({ ok: true })
    expect(captured?.where).toEqual({ eq: ["companies.id", 42] })
    const saved = (captured?.set.siteContent as { autre: number; customRequests: CustomRequestsConfig })
    expect(saved.autre).toBe(1)
    const byKey = Object.fromEntries(saved.customRequests.types.map((t) => [t.key, t.enabled]))
    expect(byKey).toMatchObject({ "sur-mesure": true, flotte: true, autre: true, textile: false })
  })

  it("sauvegarde : textile activé explicitement est conservé", async () => {
    requireCompanyMember.mockResolvedValue({ tenant: { id: 7, customSiteKey: null, siteContent: null }, isSuperAdmin: false })
    await saveCustomRequestsConfig({ enabled: true, types: [{ key: "textile", label: "", enabled: true, builtin: true }] })
    const saved = (captured?.set.siteContent as { customRequests: CustomRequestsConfig }).customRequests
    expect(findRequestType(resolveCustomRequestsConfig(saved), "textile")).not.toBeNull()
  })

  it("présélection /demande : type validé par findRequestType (inconnu/inactif ignoré)", () => {
    const src = read("app/(site)/demande/page.tsx")
    expect(src).toContain("findRequestType(config, requestedType)?.key")
    expect(src).toContain("initialType={initialType}")
    expect(read("components/custom-request-form.tsx")).toContain(
      "Précisez les articles et quantités (ex. canapé 3 places, 2 tapis 2 × 3 m).",
    )
  })

  it("carte Prestations conditionnée à module + textile actifs, sans customSiteKey", () => {
    const src = read("app/(site)/prestations/page.tsx")
    expect(src).toMatch(/crConfig\.enabled && !tenant\?\.customSiteKey && findRequestType\(crConfig, "textile"\) !== null/)
    expect(src).toContain('withTenant("/demande?type=textile"')
    expect(src).toContain("Canapés, matelas, tapis et moquettes, sur devis.")
    expect(src).toContain('ctaLabel="Demander un devis"')
  })
})
