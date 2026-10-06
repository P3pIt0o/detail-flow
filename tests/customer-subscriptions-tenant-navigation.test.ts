import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { withTenant } from "@/lib/tenant-link"
import { buildChecklist } from "@/lib/customer-subscriptions/admin-view"

const MODULE_FILES = [
  "app/admin/(dashboard)/abonnements-clients/page.tsx",
  "app/admin/(dashboard)/abonnements-clients/formules/nouvelle/page.tsx",
  "app/admin/(dashboard)/abonnements-clients/formules/[id]/page.tsx",
  "app/admin/(dashboard)/abonnements-clients/abonnes/[id]/page.tsx",
  "components/admin/customer-subscriptions/plan-configurator.tsx",
  "components/admin/customer-subscriptions/early-cancellation-card.tsx",
  "lib/customer-subscriptions/admin-view.ts",
]

const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8")

function tenantOf(href: string) {
  return new URL(href, "https://x.test").searchParams.get("tenant")
}

describe("Abonnements clients : conservation du tenant dans la navigation", () => {
  const T = "autocare"

  it("la checklist de démarrage conserve le tenant", () => {
    const items = buildChecklist({ paymentsReady: false, hasActivePlan: false, publicMode: "disabled", tenant: T })
    const hrefs = items.map((i) => i.href).filter(Boolean) as string[]
    expect(hrefs.length).toBeGreaterThan(0)
    for (const h of hrefs) expect(tenantOf(h)).toBe(T)
  })

  it("onglets, formule, abonné, retours et liens annexes conservent tenant=autocare", () => {
    const BASE = "/admin/abonnements-clients"
    const links = [
      ...["a-traiter", "formules", "abonnes", "paiements", "emails"].map((v) => `${BASE}?vue=${v}`),
      `${BASE}/formules/nouvelle`,
      `${BASE}/formules/123`,
      `${BASE}/abonnes/123`,
      `${BASE}?vue=formules`,
      `${BASE}?vue=abonnes`,
      "/admin/prestations",
      "/admin/parametres",
    ].map((h) => withTenant(h, T))
    for (const h of links) {
      expect(tenantOf(h)).toBe(T)
      expect(h.match(/tenant=/g)?.length).toBe(1)
    }
  })

  it("parcours formules -> abonné -> retour -> Accueil reste sur autocare", () => {
    let current = withTenant("/admin/abonnements-clients", T)
    const step = (path: string) => {
      current = withTenant(path, tenantOf(current))
      expect(tenantOf(current)).toBe(T)
    }
    step("/admin/abonnements-clients?vue=formules")
    step("/admin/abonnements-clients/abonnes/42")
    step("/admin/abonnements-clients?vue=abonnes")
    step("/admin")
    expect(current).toBe("/admin?tenant=autocare")
  })

  it("chaque fichier du module importe et utilise withTenant", () => {
    for (const f of MODULE_FILES) {
      const src = read(f)
      expect(src, f).toMatch(/import \{ withTenant \} from "@\/lib\/tenant-link"/)
      expect(src, f).toMatch(/withTenant\(/)
    }
  })

  it("garde-fou statique : aucun lien /admin/... brut sans withTenant", () => {
    const forbidden = [
      /href="\/admin[^"]*"/,
      /href=\{`\/admin[^`]*`\}/,
      /href=\{`\$\{BASE\}[^`]*`\}/,
      /router\.(push|replace)\(\s*["'`]\/admin/,
      /href:\s*["'`]\/admin/,
    ]
    for (const f of MODULE_FILES) {
      const src = read(f)
      for (const re of forbidden) expect(src, `${f} ${re}`).not.toMatch(re)
    }
  })

  it("le tenant reste un slug de navigation : aucun companyId lu depuis l'URL", () => {
    for (const f of MODULE_FILES.filter((x) => x.startsWith("app/"))) {
      const src = read(f)
      expect(src).toMatch(/requireAdminCompanyId\(\)/)
      expect(src).not.toMatch(/searchParams:\s*Promise<\{[^}]*companyId/)
      expect(src).not.toMatch(/searchParams\.get\(["']companyId/)
    }
  })
})
