import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest"
import type { PGlite } from "@electric-sql/pglite"

/**
 * L45 — C3 : réglages de la carte digitale.
 * Logique pure + action serveur sur une vraie base PGlite (en mémoire, aucun réseau).
 */

const h = vi.hoisted(() => ({
  pg: null as unknown as PGlite,
  requireCompanyMember: (() => undefined) as (...a: unknown[]) => unknown,
  queries: [] as string[],
}))

vi.mock("@/lib/admin", () => ({ requireCompanyMember: (...a: unknown[]) => h.requireCompanyMember(...a) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite")
  const { drizzle } = await import("drizzle-orm/pglite")
  h.pg = new PGlite()
  const db = drizzle(h.pg, { logger: { logQuery: (q: string) => void h.queries.push(q) } })
  return { db }
})

import {
  DEFAULT_CARD_ACCENT,
  DEFAULT_CARD_BACKGROUND,
  contrastText,
  resolveDigitalCard,
  sanitizeDigitalCard,
} from "@/lib/digital-card"
import { saveDigitalCard } from "@/app/admin/(dashboard)/parametres/digital-card-actions"
import { ALL_SETTINGS_TABS, findCategoryByTab, getVisibleSettingsCategories } from "@/lib/admin/settings-nav"

const valid = { enabled: true, background: "#0f172a", accent: "#2563EB", style: "gradient" }

describe("sanitizeDigitalCard", () => {
  it("refuse les couleurs non #RRGGBB", () => {
    for (const bad of ["#FFF", "red", "#GGGGGG", "", "#2563EB80", " #2563EB"]) {
      const r = sanitizeDigitalCard({ ...valid, background: bad })
      expect(r.ok, bad).toBe(false)
      if (!r.ok) expect(r.error).toBe("Couleur invalide (format #RRGGBB).")
      expect(sanitizeDigitalCard({ ...valid, accent: bad }).ok).toBe(false)
    }
  })

  it("refuse un style inconnu, accepte les 3 styles", () => {
    expect(sanitizeDigitalCard({ ...valid, style: "neon" }).ok).toBe(false)
    for (const style of ["solid", "gradient", "holographic"]) {
      expect(sanitizeDigitalCard({ ...valid, style })).toEqual({
        ok: true,
        value: { enabled: true, background: "#0F172A", accent: "#2563EB", style },
      })
    }
  })

  it("ignore les clés inconnues (companyId forgé) et refuse une activation non booléenne", () => {
    const r = sanitizeDigitalCard({ ...valid, companyId: 1 })
    expect(r.ok && Object.keys(r.value).sort()).toEqual(["accent", "background", "enabled", "style"])
    expect(sanitizeDigitalCard({ ...valid, enabled: "true" }).ok).toBe(false)
    expect(sanitizeDigitalCard(null).ok).toBe(false)
  })
})

describe("resolveDigitalCard", () => {
  it("absent → activée, couleurs par défaut, style holographique", () => {
    expect(resolveDigitalCard(undefined)).toEqual({
      enabled: true,
      background: DEFAULT_CARD_BACKGROUND,
      accent: DEFAULT_CARD_ACCENT,
      style: "holographic",
    })
    expect(DEFAULT_CARD_BACKGROUND).toBe("#0F172A")
    expect(DEFAULT_CARD_ACCENT).toBe("#2563EB")
  })

  it("accent par défaut = couleur principale du tenant si elle est valide", () => {
    expect(resolveDigitalCard(undefined, "#E11D48").accent).toBe("#E11D48")
    expect(resolveDigitalCard(undefined, "rouge").accent).toBe(DEFAULT_CARD_ACCENT)
    expect(resolveDigitalCard({ accent: "#00FF00" }, "#E11D48").accent).toBe("#00FF00")
  })

  it("valeurs stockées invalides → défauts, désactivation respectée", () => {
    expect(resolveDigitalCard({ enabled: false, background: "nope", style: "x" })).toEqual({
      enabled: false,
      background: DEFAULT_CARD_BACKGROUND,
      accent: DEFAULT_CARD_ACCENT,
      style: "holographic",
    })
  })
})

describe("contrastText", () => {
  it("fond clair → texte noir, fond sombre → texte blanc (seuil WCAG)", () => {
    expect(contrastText("#FFFFFF")).toBe("#000000")
    expect(contrastText("#0F172A")).toBe("#FFFFFF")
    expect(contrastText("#777777")).toBe("#000000")
    expect(contrastText("#757575")).toBe("#FFFFFF")
  })
})

describe("saveDigitalCard (PGlite)", () => {
  const member = (id: number) => {
    h.requireCompanyMember = async () => ({ user: { id: "u" }, tenant: { id }, role: "STAFF" })
  }
  const siteContent = async (id: number) =>
    (await h.pg.query<{ siteContent: unknown }>(`SELECT "siteContent" FROM companies WHERE id = $1`, [id])).rows[0]?.siteContent

  beforeAll(async () => {
    const { db } = await import("@/lib/db")
    void db
    await h.pg.exec(`CREATE TABLE companies (id serial PRIMARY KEY, "siteContent" jsonb, "updatedAt" timestamp NOT NULL DEFAULT now())`)
  })

  beforeEach(async () => {
    h.queries.length = 0
    await h.pg.exec(`TRUNCATE companies RESTART IDENTITY`)
    await h.pg.query(`INSERT INTO companies ("siteContent") VALUES ($1), ($2)`, [
      JSON.stringify({ digitalCard: { enabled: true, background: "#111111", accent: "#222222", style: "solid" }, footer: { tagline: "A" } }),
      JSON.stringify({ customRequests: { enabled: true }, locationLabels: { client: { title: "Chez vous" } }, footer: { tagline: "B" } }),
    ])
  })

  it("fusion : préserve customRequests / locationLabels / footer, sous verrou for update", async () => {
    member(2)
    expect(await saveDigitalCard(valid)).toEqual({ ok: true })
    expect(await siteContent(2)).toEqual({
      customRequests: { enabled: true },
      locationLabels: { client: { title: "Chez vous" } },
      footer: { tagline: "B" },
      digitalCard: { enabled: true, background: "#0F172A", accent: "#2563EB", style: "gradient" },
    })
    expect(h.queries.some((q) => /select [\s\S]* for update/i.test(q))).toBe(true)
  })

  it("tenant B ne modifie pas A, même avec un companyId forgé", async () => {
    const before = await siteContent(1)
    member(2)
    expect(await saveDigitalCard({ ...valid, companyId: 1, tenantId: 1 })).toEqual({ ok: true })
    expect(await siteContent(1)).toEqual(before)
    expect((await siteContent(2) as { digitalCard: unknown }).digitalCard).toBeDefined()
  })

  it("entrée invalide → refus sans aucune requête", async () => {
    member(2)
    const r = await saveDigitalCard({ ...valid, accent: "#FFF" })
    expect(r).toEqual({ ok: false, error: "Couleur invalide (format #RRGGBB)." })
    expect(h.queries).toHaveLength(0)
  })

  it("entreprise introuvable → échec, rien n'est écrit", async () => {
    member(9)
    const r = await saveDigitalCard(valid)
    expect(r.ok).toBe(false)
    expect(h.queries.some((q) => /^update/i.test(q))).toBe(false)
  })
})

describe("navigation : onglet « Carte digitale »", () => {
  it("présent dans Site public, visible standard / Spirit / booking_only", () => {
    expect(ALL_SETTINGS_TABS).toContain("digital-card")
    expect(findCategoryByTab("digital-card")?.id).toBe("site")
    expect(findCategoryByTab("digital-card", "spirit-acs")?.id).toBe("site")
    expect(findCategoryByTab("digital-card", null, "booking_only")?.id).toBe("site")
  })

  it("booking_only : « Site public » ne contient que la carte digitale", () => {
    const site = getVisibleSettingsCategories(null, "booking_only").find((c) => c.id === "site")
    expect(site?.subTabs.map((t) => t.value)).toEqual(["digital-card"])
  })
})
