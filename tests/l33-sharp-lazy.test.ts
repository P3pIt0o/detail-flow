import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * L33 — incident du 27/10 : `import sharp` au niveau module faisait tomber la page
 * Paramètres (500) pour tous les tenants si `sharp` ne se chargeait pas. `sharp`
 * n'est plus chargé qu'à l'appel de l'optimisation.
 */

// `sharp` introuvable : toute tentative de chargement échoue.
vi.mock("sharp", () => {
  throw new Error("Cannot find module 'sharp'")
})

const log: string[] = []
const updates: unknown[] = []
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0])
const RAW = "spirit-service-photo-upload/company-42-moto-1700000000.jpg"

vi.mock("@/lib/admin", () => ({
  requireCompanyMember: vi.fn(async () => ({
    user: { id: "u1", email: "a@b.c", name: "A" },
    tenant: { id: 42, slug: "spirit-acs", customSiteKey: "spirit-acs", siteContent: null },
    role: "OWNER",
    isSuperAdmin: false,
  })),
  getCompanyMemberContext: vi.fn(),
}))
vi.mock("@/lib/licensing/enforce", () => ({ canUseFeature: vi.fn(async () => true), FEATURE_LOCKED_MESSAGE: "x" }))
vi.mock("@vercel/blob", () => ({
  get: vi.fn(async () => ({
    statusCode: 200,
    blob: { size: JPEG.length },
    stream: new ReadableStream({ start: (c) => (c.enqueue(JPEG), c.close()) }),
  })),
  put: vi.fn(async (p: string) => {
    log.push(`put:${p}`)
    return { pathname: p }
  }),
  del: vi.fn(async (p: string) => {
    log.push(`del:${p}`)
  }),
}))
vi.mock("@/lib/db/schema", () => ({ companies: { id: "id", customSiteKey: "customSiteKey", siteContent: "siteContent" } }))
vi.mock("drizzle-orm", () => ({ eq: () => ({}), and: () => ({}) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/db", () => ({
  db: {
    transaction: async () => {
      updates.push("tx")
      throw new Error("aucune écriture attendue")
    },
  },
}))

beforeEach(() => {
  log.length = 0
  updates.length = 0
})

describe("R1 — sharp introuvable : la page Paramètres reste fonctionnelle", () => {
  it("les modules se chargent et la lecture des photos (rendu de la page) répond", async () => {
    const actions = await import("@/app/admin/(dashboard)/parametres/spirit-photos-actions")
    const res = await actions.getSpiritServicePhotos()
    expect(res.ok).toBe(true)
    expect(res.photos).toHaveLength(7)
  })

  it("l'optimisation renvoie « indisponible » sans lever", async () => {
    const { optimizeSpiritPhoto } = await import("@/lib/custom-sites/spirit-photo-optimize")
    expect(await optimizeSpiritPhoto(JPEG)).toEqual({ ok: false, unavailable: true })
  })

  it("l'enregistrement renvoie le message prévu, supprime le brut, n'écrit rien", async () => {
    const { saveSpiritServicePhoto } = await import("@/app/admin/(dashboard)/parametres/spirit-photos-actions")
    expect(await saveSpiritServicePhoto("moto", RAW)).toEqual({
      ok: false,
      error: "La photo n'a pas pu être traitée, réessayez plus tard.",
    })
    expect(log).toEqual([`del:${RAW}`])
    expect(updates).toEqual([])
  })
})

describe("R2 — aucun chargement statique de sharp", () => {
  const ROOT = process.cwd()
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const e of readdirSync(dir)) {
      const f = path.join(dir, e)
      if (statSync(f).isDirectory()) walk(f, out)
      else if (/\.(ts|tsx|js|mjs)$/.test(e)) out.push(f)
    }
    return out
  }

  it("app/, components/, lib/ : ni `import … from \"sharp\"` ni `require(\"sharp\")`", () => {
    const files = ["app", "components", "lib"].flatMap((d) => walk(path.join(ROOT, d)))
    const offenders = files
      .filter((f) => /from\s+["']sharp["']|require\(\s*["']sharp["']\s*\)/.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(ROOT, f))
    expect(offenders).toEqual([])
    expect(readFileSync(path.join(ROOT, "lib/custom-sites/spirit-photo-optimize.ts"), "utf8")).toContain('await import("sharp")')
  })
})

describe("R3 — sharp est une dépendance de production, en une seule version", () => {
  it("package.json : dependencies, pas devDependencies", () => {
    const pkg = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8"))
    expect(pkg.dependencies.sharp).toBeTruthy()
    expect(pkg.devDependencies?.sharp).toBeUndefined()
  })

  it("pnpm-lock.yaml : une seule version de sharp résolue", () => {
    const lock = readFileSync(path.join(process.cwd(), "pnpm-lock.yaml"), "utf8")
    const versions = new Set([...lock.matchAll(/^  sharp@(\d+\.\d+\.\d+)/gm)].map((m) => m[1]))
    expect([...versions]).toHaveLength(1)
  })
})
