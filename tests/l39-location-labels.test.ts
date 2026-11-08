import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * L39 — libellés personnalisables des lieux (« Chez vous » / « À l'atelier »).
 * Logique pure + action serveur (auth et DB mockées, aucun accès réseau) + câblage de l'affichage.
 */

const requireCompanyMember = vi.fn()
let dbRows: Record<number, unknown> = {}
const selectWheres: unknown[] = []
const updateWheres: unknown[] = []
let captured: Record<string, unknown> | null = null
let lockedRead = false

vi.mock("@/lib/admin", () => ({ requireCompanyMember: (...a: unknown[]) => requireCompanyMember(...a) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/booking/location", () => ({ saveLocationConfig: vi.fn() }))
vi.mock("@/lib/db/schema", () => ({ companies: { id: "companies.id", siteContent: "companies.siteContent" }, settings: {} }))
vi.mock("drizzle-orm", () => ({ eq: (a: unknown, b: unknown) => ({ eq: [a, b] }), and: (...a: unknown[]) => ({ and: a }) }))
vi.mock("@/lib/db", () => {
  const idOf = (w: unknown) => (w as { eq: [string, number] }).eq[1]
  const select = () => {
    let where: unknown
    const c: Record<string, unknown> = {}
    c.from = () => c
    c.where = (w: unknown) => {
      where = w
      selectWheres.push(w)
      return c
    }
    c.limit = () => c
    c.for = (mode: string) => {
      lockedRead = mode === "update"
      return c
    }
    c.then = (res: (v: unknown) => unknown) => {
      const id = idOf(where)
      return Promise.resolve(id in dbRows ? [{ siteContent: dbRows[id] }] : []).then(res)
    }
    return c
  }
  const update = () => ({
    set: (v: Record<string, unknown>) => ({
      where: (w: unknown) => {
        captured = v
        updateWheres.push(w)
        return Promise.resolve()
      },
    }),
  })
  return { db: { transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ select, update }) } }
})

import {
  DEFAULT_LOCATION_LABELS,
  resolveLocationLabels,
  sanitizeLocationLabels,
} from "@/lib/booking/location-shared"
import { saveLocationLabels } from "@/app/admin/(dashboard)/parametres/location-actions"

function member(id: number) {
  requireCompanyMember.mockResolvedValue({ user: { id: "u" }, tenant: { id, siteContent: dbRows[id] ?? null }, role: "STAFF" })
}

beforeEach(() => {
  requireCompanyMember.mockReset()
  dbRows = {}
  selectWheres.length = 0
  updateWheres.length = 0
  captured = null
  lockedRead = false
})

describe("sanitizeLocationLabels", () => {
  it("rogne les espaces et supprime les champs et modes vides", () => {
    const r = sanitizeLocationLabels({ client: { title: "  Service clé en main  ", text: "   " }, workshop: { title: "", text: "" } })
    expect(r).toEqual({ ok: true, value: { client: { title: "Service clé en main" } } })
  })

  it("accepte 40/90 caractères pile, refuse 41/91 sans tronquer", () => {
    expect(sanitizeLocationLabels({ client: { title: "a".repeat(40), text: "b".repeat(90) } })).toEqual({
      ok: true,
      value: { client: { title: "a".repeat(40), text: "b".repeat(90) } },
    })
    const t = sanitizeLocationLabels({ client: { title: "a".repeat(41) } })
    expect(t.ok).toBe(false)
    if (!t.ok) expect(t.error).toContain("40")
    const d = sanitizeLocationLabels({ workshop: { text: "b".repeat(91) } })
    expect(d.ok).toBe(false)
    if (!d.ok) expect(d.error).toContain("90")
  })

  it("refuse le HTML et les caractères de contrôle", () => {
    expect(sanitizeLocationLabels({ client: { title: "<b>x</b>" } }).ok).toBe(false)
    expect(sanitizeLocationLabels({ client: { text: "a > b" } }).ok).toBe(false)
    expect(sanitizeLocationLabels({ workshop: { title: "a\u0007b" } }).ok).toBe(false)
    expect(sanitizeLocationLabels({ workshop: { text: "a\nb" } }).ok).toBe(false)
  })

  it("ignore les clés inconnues et les valeurs non-chaîne", () => {
    const r = sanitizeLocationLabels({
      companyId: 1,
      other: { title: "x" },
      client: { title: 12, text: "Ok", extra: "y" },
      workshop: "nope",
    })
    expect(r).toEqual({ ok: true, value: { client: { text: "Ok" } } })
    expect(sanitizeLocationLabels(null)).toEqual({ ok: true, value: {} })
    expect(sanitizeLocationLabels([1])).toEqual({ ok: true, value: {} })
  })
})

describe("resolveLocationLabels", () => {
  it("absent → textes actuels", () => {
    expect(resolveLocationLabels(undefined)).toEqual(DEFAULT_LOCATION_LABELS)
    expect(DEFAULT_LOCATION_LABELS).toEqual({
      client: { title: "Chez vous", text: "Le professionnel vient à votre adresse." },
      workshop: { title: "À l'atelier", text: "Vous vous rendez directement à l'atelier." },
    })
  })

  it("repli champ par champ : titre seul → description par défaut", () => {
    const r = resolveLocationLabels({ client: { title: "Service clé en main" } })
    expect(r.client).toEqual({ title: "Service clé en main", text: DEFAULT_LOCATION_LABELS.client.text })
    expect(r.workshop).toEqual(DEFAULT_LOCATION_LABELS.workshop)
  })

  it("valeur stockée invalide (trop longue, HTML, non-chaîne) → défaut", () => {
    const r = resolveLocationLabels({ client: { title: "a".repeat(41), text: "<script>" }, workshop: { title: 3, text: "  Ok  " } })
    expect(r.client).toEqual(DEFAULT_LOCATION_LABELS.client)
    expect(r.workshop).toEqual({ title: DEFAULT_LOCATION_LABELS.workshop.title, text: "Ok" })
  })
})

describe("saveLocationLabels", () => {
  it("écrit locationLabels sous verrou en préservant les autres clés de siteContent", async () => {
    dbRows[2] = { customRequests: { enabled: true }, gallery: { title: "G" }, locationLabels: { workshop: { title: "Vieux" } } }
    member(2)
    const res = await saveLocationLabels({ client: { title: " Service clé en main " } })
    expect(res).toEqual({ ok: true })
    expect(lockedRead).toBe(true)
    expect(captured!.siteContent).toEqual({
      customRequests: { enabled: true },
      gallery: { title: "G" },
      locationLabels: { client: { title: "Service clé en main" } },
    })
  })

  it("tout vider supprime locationLabels sans toucher le reste", async () => {
    dbRows[2] = { gallery: { title: "G" }, locationLabels: { client: { title: "X" } } }
    member(2)
    expect(await saveLocationLabels({ client: { title: "" } })).toEqual({ ok: true })
    expect(captured!.siteContent).toEqual({ gallery: { title: "G" } })
  })

  it("refuse une entrée invalide sans rien lire ni écrire", async () => {
    dbRows[2] = {}
    member(2)
    const res = await saveLocationLabels({ client: { title: "<b>x</b>" } })
    expect(res.ok).toBe(false)
    expect(captured).toBeNull()
    expect(selectWheres).toHaveLength(0)
  })

  it("tenant B : un companyId forgé de A est ignoré, seul B est lu et écrit", async () => {
    dbRows[1] = { locationLabels: { client: { title: "Libellé de A" } }, gallery: { title: "A" } }
    dbRows[2] = {}
    member(2)
    const res = await saveLocationLabels({ companyId: 1, tenantId: 1, client: { title: "Pirate" } })
    expect(res).toEqual({ ok: true })
    expect(selectWheres).toEqual([{ eq: ["companies.id", 2] }])
    expect(updateWheres).toEqual([{ eq: ["companies.id", 2] }])
    expect(captured!.siteContent).toEqual({ locationLabels: { client: { title: "Pirate" } } })
    expect(dbRows[1]).toEqual({ locationLabels: { client: { title: "Libellé de A" } }, gallery: { title: "A" } })
  })

  it("entreprise introuvable → échec, rien n'est écrit", async () => {
    member(9)
    const res = await saveLocationLabels({ client: { title: "X" } })
    expect(res.ok).toBe(false)
    expect(captured).toBeNull()
  })
})

describe("affichage (C1)", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

  it("step-datetime affiche location.labels avec repli sur les textes actuels, en texte brut", () => {
    const src = read("components/booking-v2/step-datetime.tsx")
    expect(src).toContain("location.labels ?? DEFAULT_LOCATION_LABELS")
    expect(src).toContain("labels.client.title")
    expect(src).toContain("labels.workshop.text")
    expect(src).not.toContain('title="Chez vous"')
    expect(src).not.toContain("dangerouslySetInnerHTML")
  })

  it("reservation/page passe les libellés résolus du tenant de la requête", () => {
    const src = read("app/(site)/reservation/page.tsx")
    expect(src).toMatch(/labels:\s*resolveLocationLabels\(\s*\(tenant\?\.siteContent/)
  })
})
