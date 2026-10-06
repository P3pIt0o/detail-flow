import { readFileSync, readdirSync, existsSync } from "node:fs"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

const TENANT_A = 101
const TENANT_B = 202

const state = vi.hoisted(() => ({
  tenant: null as null | { id: number; customSiteKey: string | null; siteContent: unknown },
  updates: [] as { set: Record<string, unknown>; where: unknown }[],
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@vercel/blob", () => ({ put: vi.fn(), del: vi.fn() }))
vi.mock("@/lib/licensing/enforce", () => ({ canUseFeature: vi.fn(async () => true), FEATURE_LOCKED_MESSAGE: "locked" }))
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>()
  return { ...actual, eq: (col: { name: string }, val: unknown) => ({ op: "eq", col: col.name, val }) }
})
vi.mock("@/lib/admin", () => ({
  requireCompanyMember: vi.fn(async () => {
    if (!state.tenant) throw new Error("NEXT_REDIRECT:/admin/login")
    return { user: { id: "u" }, tenant: state.tenant, role: "OWNER", isSuperAdmin: false }
  }),
}))
vi.mock("@/lib/db", () => ({
  db: {
    update: vi.fn(() => ({
      set: (set: Record<string, unknown>) => ({
        where: async (where: unknown) => {
          state.updates.push({ set, where })
        },
      }),
    })),
  },
}))
vi.mock("@/lib/tenant", () => ({ resolveRequestTenant: vi.fn(async () => state.tenant) }))

import { resolveProcessContent, resolveSiteContent, SITE_CONTENT_DEFAULTS } from "@/lib/site-content"
import { saveSiteContent } from "@/app/admin/(dashboard)/parametres/branding-actions"

const DEFAULTS = (SITE_CONTENT_DEFAULTS as any).process

describe("Comment ça marche : résolution du contenu", () => {
  it("1. tenant sans process → textes actuels par défaut", () => {
    const p = resolveSiteContent(null).process
    expect(p.enabled).toBe(true)
    expect(p.eyebrow).toBe("Comment ça marche")
    expect(p.title).toBe("Simple et sans effort")
    expect(p.description).toBe("Un processus clair en quatre étapes pour une expérience sans souci.")
    expect(p.steps.map((s) => s.title)).toEqual(["1. Réservation", "2. Prise en charge", "3. Detailing", "4. Livraison"])
    expect(p.steps[1].description).toBe("Nous venons à vous ou vous accueillons à l'atelier, à l'heure convenue.")
  })

  it("2. texte personnalisé → utilisé", () => {
    const p = resolveProcessContent({ title: "Comment je travaille", eyebrow: "Mon fonctionnement" })
    expect(p.title).toBe("Comment je travaille")
    expect(p.eyebrow).toBe("Mon fonctionnement")
    expect(p.description).toBe(DEFAULTS.description)
  })

  it("3. enabled=false → section désactivée", () => {
    expect(resolveProcessContent({ enabled: false }).enabled).toBe(false)
  })

  it("4. les 4 étapes se personnalisent indépendamment, sans étape vide ni undefined", () => {
    const p = resolveProcessContent({
      steps: [undefined, { description: "Je me déplace à domicile." }, { title: "  " }, { title: "4. Remise des clés" }],
    })
    expect(p.steps).toHaveLength(4)
    expect(p.steps[0]).toEqual(DEFAULTS.steps[0])
    expect(p.steps[1]).toEqual({ title: DEFAULTS.steps[1].title, description: "Je me déplace à domicile." })
    expect(p.steps[2]).toEqual(DEFAULTS.steps[2])
    expect(p.steps[3]).toEqual({ title: "4. Remise des clés", description: DEFAULTS.steps[3].description })
    expect(JSON.stringify(p)).not.toContain("undefined")
  })

  it("5. ancienne config siteContent sans process (ou corrompue) reste compatible", () => {
    const legacy = { about: { title: "Hello" }, sectionOrder: ["process", "about"], customRequests: { enabled: true } }
    const r = resolveSiteContent(legacy)
    expect(r.about.title).toBe("Hello")
    expect(r.process).toEqual(resolveProcessContent(undefined))
    expect(resolveProcessContent({ steps: "x", title: 42 })).toEqual(resolveProcessContent(undefined))
    expect(resolveProcessContent({ steps: new Array(10).fill({ title: "X" }) }).steps).toHaveLength(4)
  })
})

describe("Comment ça marche : sauvegarde sécurisée", () => {
  beforeEach(() => {
    state.updates = []
    state.tenant = null
  })

  it("non connecté → aucune écriture", async () => {
    await expect(saveSiteContent({})).rejects.toThrow()
    expect(state.updates).toHaveLength(0)
  })

  it("6. conserve customRequests, sectionOrder, spiritAcs et clés inconnues ; nettoie et borne process", async () => {
    state.tenant = {
      id: TENANT_A,
      customSiteKey: null,
      siteContent: {
        customRequests: { enabled: true, types: [{ key: "flotte" }] },
        sectionOrder: ["contact", "process"],
        spiritAcs: { foo: "bar" },
        futureKey: 1,
      },
    }
    const res = await saveSiteContent({
      process: {
        enabled: false,
        eyebrow: "E".repeat(200),
        title: "  Mon titre  ",
        description: "D".repeat(500),
        steps: [{ title: "T".repeat(200), description: "S".repeat(500) }, { title: "Deux" }],
      },
    })
    expect(res.ok).toBe(true)
    expect(state.updates).toHaveLength(1)
    const saved = state.updates[0].set.siteContent as any
    expect(saved.customRequests).toEqual({ enabled: true, types: [{ key: "flotte" }] })
    expect(saved.sectionOrder).toEqual(["contact", "process"])
    expect(saved.spiritAcs).toEqual({ foo: "bar" })
    expect(saved.futureKey).toBe(1)
    expect(saved.process.enabled).toBe(false)
    expect(saved.process.eyebrow).toHaveLength(60)
    expect(saved.process.title).toBe("Mon titre")
    expect(saved.process.description).toHaveLength(300)
    expect(saved.process.steps).toHaveLength(4)
    expect(saved.process.steps[0].title).toHaveLength(80)
    expect(saved.process.steps[0].description).toHaveLength(300)
    expect(saved.process.steps[1].title).toBe("Deux")
    expect(resolveProcessContent(saved.process).steps[2]).toEqual(DEFAULTS.steps[2])
  })

  it("7. écrit uniquement sur tenant.id (jamais un tenant B)", async () => {
    state.tenant = { id: TENANT_A, customSiteKey: null, siteContent: null }
    await saveSiteContent({ process: { title: "A" } } as any)
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0].where).toEqual({ op: "eq", col: "id", val: TENANT_A })
    expect(state.updates.some((u) => (u.where as { val: unknown }).val === TENANT_B)).toBe(false)
  })

  it("Spirit ACS reste verrouillé (aucune écriture pour un membre normal)", async () => {
    state.tenant = { id: TENANT_A, customSiteKey: "spirit-acs", siteContent: { spiritAcs: {} } }
    const res = await saveSiteContent({ process: { title: "X" } })
    expect(res.ok).toBe(false)
    expect(state.updates).toHaveLength(0)
  })
})

describe("Comment ça marche : rendu et périmètre", () => {
  const src = readFileSync(join(process.cwd(), "components/sections/process.tsx"), "utf8")

  it("8. Process lit getPublicSiteContent() et n'a plus de texte codé en dur", () => {
    expect(src).toContain('from "@/lib/site-content"')
    expect(src).toMatch(/await getPublicSiteContent\(\)/)
    expect(src).toMatch(/enabled === false\) return null/)
    expect(src).not.toContain("l'atelier")
    expect(src).not.toContain("Simple et sans effort")
    for (const icon of ["CalendarCheck", "Car", "Sparkles", "ThumbsUp"]) expect(src).toContain(icon)
    expect(src).toContain("<Reveal")
  })

  it("Spirit ACS n'utilise pas components/sections/process.tsx", () => {
    const dir = join(process.cwd(), "components/custom-sites")
    const walk = (d: string): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(d, e.name)) : /\.tsx?$/.test(e.name) ? [join(d, e.name)] : [],
      )
    for (const f of walk(dir)) expect(readFileSync(f, "utf8")).not.toContain("sections/process")
  })

  it("9. aucune migration DB : stockage dans companies.siteContent existant", () => {
    const schema = readFileSync(join(process.cwd(), "lib/db/schema.ts"), "utf8")
    expect(schema).toMatch(/siteContent/)
    expect(schema).not.toMatch(/process_steps|processSteps/)
    expect(existsSync(join(process.cwd(), "components/admin/settings/public-site-content.tsx"))).toBe(true)
  })
})
