import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

type Company = { id: number; customSiteKey: string | null; email: string | null; name: string }

const companiesTable: Company[] = []
const settingsByCompany = new Map<number, string | null>()
const modeByCompany = new Map<number, string | null>()
let lastKey: string | null = null

vi.mock("server-only", () => ({}))
vi.mock("@/lib/tenant", () => ({ getCurrentTenant: vi.fn(async () => null) }))
vi.mock("@/lib/company/booking-distribution", () => ({
  getBookingDistributionMode: async (id: number) => modeByCompany.get(id) ?? null,
}))
vi.mock("drizzle-orm", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, eq: (col: { name?: string }, value: unknown) => ({ col: col?.name, value }) }
})
vi.mock("@/lib/db/schema", () => ({
  companies: { __t: "companies", customSiteKey: { name: "customSiteKey" } },
  settings: {
    __t: "settings",
    companyId: { name: "companyId" },
    businessName: {},
    businessEmail: {},
    businessPhone: {},
    businessAddress: {},
  },
  businessHours: { __t: "businessHours" },
}))
vi.mock("@/lib/db", () => {
  const chain = (table: { __t: string }) => ({
    where: (cond: { col: string; value: unknown }) => ({
      limit: async () => {
        if (table.__t === "companies") {
          lastKey = cond.value as string
          return companiesTable.filter((c) => c.customSiteKey === cond.value)
        }
        const id = cond.value as number
        return [{ businessName: null, businessEmail: settingsByCompany.get(id) ?? null, businessPhone: null, businessAddress: null }]
      },
    }),
  })
  return { db: { select: () => ({ from: (t: { __t: string }) => chain(t) }) } }
})

import { tenantContactMailto } from "@/lib/tenant-contact"
import { getWidgetTenantContactEmail } from "@/lib/public-contact"

const ROOT = join(__dirname, "..")
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")

beforeEach(() => {
  companiesTable.length = 0
  settingsByCompany.clear()
  modeByCompany.clear()
  lastKey = null
})

describe("tenantContactMailto", () => {
  it("construit un mailto vers l'adresse fournie", () => {
    expect(tenantContactMailto("cleanyzer74000@gmail.com")).toBe("mailto:cleanyzer74000@gmail.com")
    expect(tenantContactMailto("  autre@exemple.fr ")).toBe("mailto:autre@exemple.fr")
  })

  it("aucun repli : null si absent ou invalide, jamais contact@detailflow.fr", () => {
    for (const v of [null, undefined, "", "  ", "pas-un-email", "a@b.fr?bcc=x@y.fr", "a@b.fr\ncc:x@y.fr"]) {
      expect(tenantContactMailto(v)).toBeNull()
    }
  })
})

describe("getWidgetTenantContactEmail", () => {
  function seed(id: number, key: string, businessEmail: string | null, mode: string | null, companyEmail: string | null = null) {
    companiesTable.push({ id, customSiteKey: key, email: companyEmail, name: `T${id}` } as Company)
    settingsByCompany.set(id, businessEmail)
    modeByCompany.set(id, mode)
  }

  it("chaque tenant widget obtient SA propre adresse, sans croisement", async () => {
    seed(1, "site-a", "cleanyzer74000@gmail.com", "widget")
    seed(2, "site-b", "autre@exemple.fr", "widget")
    expect(await getWidgetTenantContactEmail("site-a")).toBe("cleanyzer74000@gmail.com")
    expect(await getWidgetTenantContactEmail("site-b")).toBe("autre@exemple.fr")
  })

  it("repli sur companies.email (même tenant) si settings vide", async () => {
    seed(3, "site-c", null, "widget", "fiche@exemple.fr")
    expect(await getWidgetTenantContactEmail("site-c")).toBe("fiche@exemple.fr")
  })

  it("null hors mode widget, clé inconnue, ou clé ambiguë — jamais d'adresse DetailFlow", async () => {
    seed(4, "site-link", "link@exemple.fr", "link")
    seed(5, "dup", "x@exemple.fr", "widget")
    seed(6, "dup", "y@exemple.fr", "widget")
    expect(await getWidgetTenantContactEmail("site-link")).toBeNull()
    expect(await getWidgetTenantContactEmail("inconnue")).toBeNull()
    expect(await getWidgetTenantContactEmail("dup")).toBeNull()
    expect(await getWidgetTenantContactEmail("   ")).toBeNull()
    expect(lastKey).not.toBe("   ")
  })
})

describe("Câblage Cleanyzer", () => {
  const pages = read("components/custom-sites/cleanyzer/pages.tsx")
  const faqRoute = read("app/cleanyzer-preview/faq/page.tsx")

  it("« Nous contacter » utilise le mailto du tenant, plus le module de réservation", () => {
    expect(pages).toMatch(/<a href=\{contactHref\}[^>]*>Nous contacter<\/a>/)
    expect(pages).not.toMatch(/CLZ_BOOKING_HREF[^\n]*Nous contacter/)
    expect(faqRoute).toContain("getWidgetTenantContactEmail(")
  })

  it("les CTA textile pointent toujours vers /p/<slug>/reservation", () => {
    expect(read("components/custom-sites/cleanyzer/tokens.ts")).toMatch(/CLZ_BOOKING_HREF = publicReservationPath\(/)
  })

  it("logique commune sans Cleanyzer ni adresse codée en dur", () => {
    for (const f of ["lib/tenant-contact.ts", "lib/public-contact.ts"]) {
      const src = read(f).toLowerCase()
      expect(src).not.toContain("cleanyzer")
      expect(src).not.toContain("@gmail.com")
      expect(src).not.toContain("contact@detailflow.fr")
    }
    expect(pages).not.toContain("cleanyzer74000@gmail.com")
    expect(pages).not.toContain("contact@detailflow.fr")
  })
})
