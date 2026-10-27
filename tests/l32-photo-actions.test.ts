import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * L32 — actions serveur des photos de prestations Spirit. Dépendances mockées
 * (auth, licence, BDD, Blob, optimisation) ; la signature réelle des fichiers
 * (`sniffImageMime`) n'est PAS mockée.
 */

const log: string[] = []
const requireCompanyMember = vi.fn()
const canUseFeature = vi.fn(async () => true)
const optimize = vi.fn(async () => ({ ok: true as const, data: Buffer.from("webp-optimise") }))
const blobs = new Map<string, { bytes: Uint8Array; size?: number }>()
let dbContent: unknown = null
let failUpdate = false
const whereArgs: unknown[] = []
const updates: unknown[] = []

vi.mock("@/lib/admin", () => ({
  requireCompanyMember: (...a: unknown[]) => requireCompanyMember(...a),
  getCompanyMemberContext: vi.fn(),
}))
vi.mock("@/lib/licensing/enforce", () => ({
  canUseFeature: (...a: unknown[]) => canUseFeature(...(a as [])),
  FEATURE_LOCKED_MESSAGE: "Fonctionnalité indisponible.",
}))
vi.mock("@/lib/custom-sites/spirit-photo-optimize", () => ({
  optimizeSpiritPhoto: (...a: unknown[]) => optimize(...(a as [])),
}))
vi.mock("@vercel/blob", () => ({
  get: vi.fn(async (pathname: string) => {
    log.push(`get:${pathname}`)
    const b = blobs.get(pathname)
    if (!b) return null
    return {
      statusCode: 200,
      blob: { size: b.size ?? b.bytes.length, contentType: "image/jpeg", etag: "e" },
      stream: new ReadableStream({
        start(c) {
          c.enqueue(b.bytes)
          c.close()
        },
      }),
    }
  }),
  put: vi.fn(async (pathname: string, _data: unknown, opts: { contentType?: string; access?: string }) => {
    log.push(`put:${pathname}:${opts.contentType}:${opts.access}`)
    return { pathname }
  }),
  del: vi.fn(async (pathname: string) => {
    log.push(`del:${pathname}`)
  }),
}))
vi.mock("@/lib/db/schema", () => ({
  companies: { id: "companies.id", customSiteKey: "companies.customSiteKey", siteContent: "companies.siteContent" },
}))
vi.mock("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
  and: (...a: unknown[]) => ({ and: a }),
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/db", () => {
  const chain = (rows: () => unknown[]) => {
    const c: Record<string, unknown> = {}
    for (const m of ["from", "limit", "for"]) c[m] = () => c
    c.where = (w: unknown) => {
      whereArgs.push(w)
      return c
    }
    c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(rows()).then(res, rej)
    return c
  }
  const tx = {
    select: () => chain(() => (dbContent === undefined ? [] : [{ siteContent: dbContent }])),
    update: () => ({
      set: (v: { siteContent: unknown }) => ({
        where: async (w: unknown) => {
          whereArgs.push(w)
          if (failUpdate) throw new Error("db down")
          updates.push(v.siteContent)
          log.push("update")
        },
      }),
    }),
  }
  return { db: { transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) } }
})

import {
  getSpiritServicePhotos,
  resetSpiritServicePhoto,
  saveSpiritServicePhoto,
} from "@/app/admin/(dashboard)/parametres/spirit-photos-actions"
import { SPIRIT_PHOTO_MAX_BYTES } from "@/components/custom-sites/spirit-acs/service-photos"

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0])
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52])
const GIF = new TextEncoder().encode("GIF89a.........................")
const HTML = new TextEncoder().encode("<html><script>alert(1)</script></html>")
const AVIF = new Uint8Array([0, 0, 0, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66, 0, 0, 0, 0, 0x61, 0x76, 0x69, 0x66])

const RAW = "spirit-service-photo-upload/company-42-moto-1700000000.jpg"
const OLD = "spirit-service-photo/company-42-moto-ancien123.webp"
const OPTIMIZED = /^spirit-service-photo\/company-42-moto-[a-f0-9]{32}\.webp$/

function member(opts: { customSiteKey?: string | null; id?: number } = {}) {
  requireCompanyMember.mockResolvedValue({
    user: { id: "u1", email: "a@b.c", name: "A" },
    tenant: {
      id: opts.id ?? 42,
      slug: "spirit-acs",
      customSiteKey: "customSiteKey" in opts ? opts.customSiteKey : "spirit-acs",
      siteContent: dbContent,
    },
    role: "OWNER",
    isSuperAdmin: false,
  })
}

beforeEach(() => {
  log.length = 0
  whereArgs.length = 0
  updates.length = 0
  blobs.clear()
  dbContent = null
  failUpdate = false
  requireCompanyMember.mockReset()
  canUseFeature.mockReset()
  canUseFeature.mockResolvedValue(true)
  optimize.mockClear()
  optimize.mockResolvedValue({ ok: true, data: Buffer.from("webp-optimise") })
  member()
})

describe("S1 / S7 — droits", () => {
  it("rôles OWNER / ADMIN exigés", async () => {
    await getSpiritServicePhotos()
    expect(requireCompanyMember).toHaveBeenCalledWith(["OWNER", "ADMIN"])
  })

  it.each([
    ["autre tenant (site standard)", null],
    ["autre site sur mesure", "rozan"],
  ])("%s → refusé, rien n'est lu ni écrit", async (_l, key) => {
    member({ customSiteKey: key })
    blobs.set(RAW, { bytes: JPEG })
    for (const r of [await saveSpiritServicePhoto("moto", RAW), await resetSpiritServicePhoto("moto"), await getSpiritServicePhotos()]) {
      expect(r.ok).toBe(false)
      expect(r.error).toMatch(/réservée au site Spirit ACS/)
    }
    expect(log).toEqual([])
    expect(updates).toEqual([])
  })

  it("licence sans site web → refusé", async () => {
    canUseFeature.mockResolvedValue(false)
    blobs.set(RAW, { bytes: JPEG })
    expect((await saveSpiritServicePhoto("moto", RAW)).ok).toBe(false)
    expect(log).toEqual([])
  })
})

describe("S2 — isolation", () => {
  it("fichier d'un autre tenant : refusé, jamais lu ni supprimé", async () => {
    const foreign = "spirit-service-photo-upload/company-99-moto-1.jpg"
    blobs.set(foreign, { bytes: JPEG })
    const r = await saveSpiritServicePhoto("moto", foreign)
    expect(r).toMatchObject({ ok: false, error: "Fichier non autorisé." })
    expect(log).toEqual([])
  })

  it.each([
    "spirit-service-photo-upload/company-42-nettoyage-1.jpg", // autre clé
    "spirit-service-photo/company-42-moto-abc.webp", // pas un fichier d'envoi
    "spirit-service-photo-upload/company-42-moto-../company-99-moto-1.jpg",
    "photo-gallery/company-42-1.jpg",
  ])("chemin hors préfixe d'envoi de la clé : %s → refusé, rien touché", async (p) => {
    expect((await saveSpiritServicePhoto("moto", p)).ok).toBe(false)
    expect(log).toEqual([])
  })

  it("l'écriture vise uniquement l'id du tenant serveur et le site Spirit", async () => {
    blobs.set(RAW, { bytes: JPEG })
    await saveSpiritServicePhoto("moto", RAW)
    expect(whereArgs.length).toBeGreaterThan(0)
    for (const w of whereArgs) {
      expect(w).toEqual({ and: [{ eq: ["companies.id", 42] }, { eq: ["companies.customSiteKey", "spirit-acs"] }] })
    }
  })
})

describe("S3 — fichiers refusés", () => {
  it("prestation inconnue", async () => {
    for (const k of ["entretien-regulier", "__proto__", "inconnue"]) {
      expect(await saveSpiritServicePhoto(k, RAW)).toMatchObject({ ok: false, error: "Prestation inconnue." })
    }
    expect(log).toEqual([])
  })

  it("plus de 8 Mo → refusé, brut supprimé, rien d'enregistré", async () => {
    blobs.set(RAW, { bytes: JPEG, size: SPIRIT_PHOTO_MAX_BYTES + 1 })
    const r = await saveSpiritServicePhoto("moto", RAW)
    expect(r).toMatchObject({ ok: false, error: "Fichier trop volumineux (8 Mo maximum)." })
    expect(log).toContain(`del:${RAW}`)
    expect(log.some((l) => l.startsWith("put:"))).toBe(false)
    expect(updates).toEqual([])
  })

  it.each([
    ["GIF", GIF],
    ["HTML", HTML],
    ["AVIF", AVIF],
  ])("signature réelle %s → refusé même si annoncé image/jpeg", async (_n, bytes) => {
    blobs.set(RAW, { bytes })
    const r = await saveSpiritServicePhoto("moto", RAW)
    expect(r).toMatchObject({ ok: false, error: "Format non accepté : JPG, PNG ou WebP uniquement." })
    expect(log).toContain(`del:${RAW}`)
    expect(optimize).not.toHaveBeenCalled()
    expect(updates).toEqual([])
  })

  it("image illisible ou trop grande en pixels → refusé, brut supprimé", async () => {
    blobs.set(RAW, { bytes: PNG })
    optimize.mockResolvedValue({ ok: false } as never)
    const r = await saveSpiritServicePhoto("moto", RAW)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/illisible/)
    expect(log).toContain(`del:${RAW}`)
    expect(updates).toEqual([])
  })

  it("fichier envoyé introuvable → message clair", async () => {
    expect((await saveSpiritServicePhoto("moto", RAW)).error).toMatch(/introuvable/)
    expect(updates).toEqual([])
  })
})

describe("enregistrement, optimisation et S6 (suppression après succès)", () => {
  it("enregistre le WebP optimisé, jamais le brut ; ancien supprimé APRÈS la mise à jour", async () => {
    dbContent = { spiritAcs: { home: { zoneText: "Ma zone" }, servicePhotos: { moto: OLD } }, gallery: { title: "G" } }
    member()
    blobs.set(RAW, { bytes: JPEG })
    const r = await saveSpiritServicePhoto("moto", RAW)
    expect(r.ok).toBe(true)

    const put = log.find((l) => l.startsWith("put:"))!
    const [, stored, contentType, access] = put.split(":")
    expect(stored).toMatch(OPTIMIZED)
    expect([contentType, access]).toEqual(["image/webp", "private"])
    expect(optimize).toHaveBeenCalledTimes(1)

    expect(updates).toEqual([
      { spiritAcs: { home: { zoneText: "Ma zone" }, servicePhotos: { moto: stored } }, gallery: { title: "G" } },
    ])
    expect(log.indexOf("update")).toBeLessThan(log.indexOf(`del:${OLD}`))
    expect(log).toContain(`del:${RAW}`)
    expect(log).not.toContain(`del:${stored}`)

    const moto = r.photos!.find((p) => p.key === "moto")!
    expect(moto.custom).toBe(true)
    expect(moto.src).toMatch(/^\/api\/spirit-service-photo\?company=spirit-acs&k=moto&v=/)
  })

  it("échec de l'écriture → ancien JAMAIS supprimé, nouveau WebP nettoyé", async () => {
    dbContent = { spiritAcs: { servicePhotos: { moto: OLD } } }
    member()
    blobs.set(RAW, { bytes: JPEG })
    failUpdate = true
    const r = await saveSpiritServicePhoto("moto", RAW)
    expect(r.ok).toBe(false)
    expect(log).not.toContain(`del:${OLD}`)
    const stored = log.find((l) => l.startsWith("put:"))!.split(":")[1]
    expect(log).toContain(`del:${stored}`)
  })

  it("une ancienne valeur hors préfixe de l'entreprise n'est jamais supprimée", async () => {
    const foreign = "spirit-service-photo/company-99-moto-xyz.webp"
    dbContent = { spiritAcs: { servicePhotos: { moto: foreign } } }
    member()
    blobs.set(RAW, { bytes: JPEG })
    expect((await saveSpiritServicePhoto("moto", RAW)).ok).toBe(true)
    expect(log).not.toContain(`del:${foreign}`)
  })
})

describe("revenir à la photo d'origine", () => {
  it("retire la clé, puis supprime l'ancien fichier", async () => {
    dbContent = { spiritAcs: { servicePhotos: { moto: OLD, nettoyage: "spirit-service-photo/company-42-nettoyage-a1.webp" } } }
    member()
    const r = await resetSpiritServicePhoto("moto")
    expect(r.ok).toBe(true)
    expect(updates).toEqual([{ spiritAcs: { servicePhotos: { nettoyage: "spirit-service-photo/company-42-nettoyage-a1.webp" } } }])
    expect(log.indexOf("update")).toBeLessThan(log.indexOf(`del:${OLD}`))
    const moto = r.photos!.find((p) => p.key === "moto")!
    expect(moto).toMatchObject({ custom: false, src: "/custom-sites/spirit-acs/detailing-moto-kymco.jpg" })
  })

  it("dernière photo retirée → `servicePhotos` disparaît, le reste est préservé", async () => {
    dbContent = { spiritAcs: { home: { zoneText: "Z" }, servicePhotos: { moto: OLD } } }
    member()
    await resetSpiritServicePhoto("moto")
    expect(updates).toEqual([{ spiritAcs: { home: { zoneText: "Z" } } }])
  })

  it("aucune photo personnalisée → aucune suppression", async () => {
    await resetSpiritServicePhoto("moto")
    expect(log.filter((l) => l.startsWith("del:"))).toEqual([])
  })
})

describe("lecture admin", () => {
  it("7 photos avec l'endroit où elles s'affichent", async () => {
    const r = await getSpiritServicePhotos()
    expect(r.photos!.map((p) => p.key)).toHaveLength(7)
    const polish = r.photos!.find((p) => p.key === "polissage-ceramique")!
    expect(polish.where).toEqual(["Configurateur de devis", "Carte d'accueil", "Page « Polissage automobile »"])
    const ceramic = r.photos!.find((p) => p.key === "protection-ceramique")!
    expect(ceramic.where).toEqual(["Page « Protection céramique »"])
  })
})
