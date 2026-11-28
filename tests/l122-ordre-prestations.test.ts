import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"

/**
 * L122 — ordre des prestations : action admin, nouvelle prestation, page de
 * réservation, sur une VRAIE base PostgreSQL en mémoire (aucune base externe).
 */
const { holder } = vi.hoisted(() => ({ holder: { db: null as unknown, companyId: 1 } }))

vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({
  get db() {
    return holder.db
  },
}))
vi.mock("next/cache", () => ({ revalidatePath: () => {} }))
vi.mock("@vercel/blob", () => ({ del: async () => {} }))
vi.mock("@/lib/admin", () => ({
  requireCompanyMember: async () => ({ tenant: { id: holder.companyId } }),
}))
vi.mock("@/lib/tenant", () => ({
  requireCompanyId: async () => holder.companyId,
  getCompanyIdOrNull: async () => holder.companyId,
}))

import * as schema from "@/lib/db/schema"
import { reorderServices, saveService } from "@/app/admin/(dashboard)/prestations/actions"
import { getServices } from "@/lib/booking/queries"
import { ServicesManager } from "@/components/admin/services-manager"

const A = 1
const B = 2
let pg: PGlite

beforeAll(async () => {
  pg = new PGlite()
  await pg.exec(`
    CREATE TABLE services (id serial PRIMARY KEY, "companyId" int NOT NULL, "categoryId" int, name text NOT NULL, slug text NOT NULL,
      description text, image text, "basePriceCents" int NOT NULL DEFAULT 0, "durationMin" int NOT NULL DEFAULT 60,
      "sortOrder" int NOT NULL DEFAULT 0, visible boolean NOT NULL DEFAULT true, "createdAt" timestamp NOT NULL DEFAULT now());
  `)
  holder.db = drizzle(pg, { schema })
})

// Ids fixes : A = 1, 2, 3 (3 masquée) ; B = 11, 12. Tous à sortOrder 0, comme en production.
beforeEach(async () => {
  holder.companyId = A
  await pg.exec(`
    DELETE FROM services;
    INSERT INTO services (id, "companyId", name, slug, visible) VALUES
      (2, 1, 'A2', 'a2', true), (1, 1, 'A1', 'a1', true), (3, 1, 'A3', 'a3', false),
      (11, 2, 'B1', 'b1', true), (12, 2, 'B2', 'b2', true);
    SELECT setval('services_id_seq', 100);
  `)
})

const orders = async (companyId: number) =>
  (
    await pg.query<{ id: number; sortOrder: number }>(
      `SELECT id, "sortOrder" FROM services WHERE "companyId" = $1 ORDER BY id`,
      [companyId],
    )
  ).rows.map((r) => [r.id, r.sortOrder])

const publicIds = async (companyId: number) => (await getServices(companyId)).map((s) => s.id)

const input = (name: string) => ({
  name,
  description: "",
  categoryId: null,
  basePriceCents: 1000,
  durationMin: 60,
  visible: true,
})

describe("L122 — page de réservation", () => {
  it("à égalité de sortOrder, départage par id (même après une mise à jour de ligne)", async () => {
    await pg.exec(`UPDATE services SET name = 'A1 bis' WHERE id = 1`)
    expect(await publicIds(A)).toEqual([1, 2])
  })

  it("suit l'ordre choisi ; la prestation masquée est absente mais garde son rang", async () => {
    expect(await reorderServices([2, 3, 1])).toEqual({ ok: true })
    expect(await orders(A)).toEqual([[1, 3], [2, 1], [3, 2]])
    expect(await publicIds(A)).toEqual([2, 1])
    await pg.exec(`UPDATE services SET visible = true WHERE id = 3`)
    expect(await publicIds(A)).toEqual([2, 3, 1])
  })

  it("liste d'un seul élément", async () => {
    await pg.exec(`DELETE FROM services WHERE "companyId" = 1 AND id <> 1`)
    expect(await reorderServices([1])).toEqual({ ok: true })
    expect(await orders(A)).toEqual([[1, 1]])
  })
})

describe("L122 — isolation et refus sans écriture", () => {
  const untouched = async () => {
    expect(await orders(A)).toEqual([[1, 0], [2, 0], [3, 0]])
    expect(await orders(B)).toEqual([[11, 0], [12, 0]])
  }

  it("le tenant B ne réordonne pas les prestations du tenant A", async () => {
    holder.companyId = B
    expect((await reorderServices([3, 2, 1])).ok).toBe(false)
    await untouched()
  })

  it.each([
    ["liste mêlant A et B", [3, 2, 1, 11]],
    ["id étranger à la place d'un id de A", [3, 2, 11]],
    ["doublon", [1, 2, 2]],
    ["doublon en plus", [1, 2, 3, 3]],
    ["liste incomplète", [2, 1]],
    ["liste vide", []],
    ["valeur non entière", [1, 2, 3.5]],
  ])("%s : refus", async (_label, ids) => {
    const res = await reorderServices(ids as number[])
    expect(res.ok).toBe(false)
    expect(res.error).toBeTruthy()
    await untouched()
  })

  it("autre chose qu'une liste : refus", async () => {
    expect((await reorderServices(null as unknown as number[])).ok).toBe(false)
    await untouched()
  })
})

describe("L122 — nouvelle prestation", () => {
  it("arrive en dernier, sans tenir compte des autres entreprises", async () => {
    await reorderServices([2, 1, 3])
    await pg.exec(`UPDATE services SET "sortOrder" = 50 WHERE "companyId" = 2`)
    expect(await saveService(input("Nouvelle"))).toEqual({ ok: true })
    const rows = await getServices(A)
    expect(rows.at(-1)).toMatchObject({ name: "Nouvelle", sortOrder: 4 })
  })

  it("première prestation d'une entreprise", async () => {
    holder.companyId = 7
    expect(await saveService(input("Première"))).toEqual({ ok: true })
    expect((await getServices(7)).map((s) => s.sortOrder)).toEqual([1])
  })

  it("modifier une prestation ne change pas son rang", async () => {
    await reorderServices([2, 1, 3])
    await saveService({ ...input("Renommée"), id: 2 })
    expect(await orders(A)).toEqual([[1, 2], [2, 1], [3, 3]])
  })
})

describe("L122 — boutons Monter / Descendre", () => {
  const service = (id: number, name: string) => ({
    id,
    name,
    description: null,
    categoryId: null,
    image: null,
    basePriceCents: 1000,
    durationMin: 60,
    visible: true,
    highlightKind: null,
    highlightLabel: null,
  })
  const html = (list: ReturnType<typeof service>[]) =>
    renderToStaticMarkup(createElement(ServicesManager, { services: list, companyId: A, slug: "a" }))
  const button = (markup: string, label: string) => {
    const tag = markup.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))?.[0]
    expect(tag, label).toBeTruthy()
    return { tag: tag!, disabled: /\sdisabled=""/.test(tag!) }
  }

  it("libellés avec le nom, cibles de 44 px, désactivés aux extrémités, texte d'aide", () => {
    const markup = html([service(1, "Un"), service(2, "Deux"), service(3, "Trois")])
    expect(button(markup, "Monter Un").disabled).toBe(true)
    expect(button(markup, "Descendre Un").disabled).toBe(false)
    expect(button(markup, "Monter Deux").disabled).toBe(false)
    expect(button(markup, "Descendre Deux").disabled).toBe(false)
    expect(button(markup, "Monter Trois").disabled).toBe(false)
    expect(button(markup, "Descendre Trois").disabled).toBe(true)
    expect(button(markup, "Monter Un").tag).toContain("size-11")
    expect(markup).toContain("L&#x27;ordre ici est celui de votre page de réservation.")
  })

  it("liste d'un seul élément : les deux boutons sont désactivés", () => {
    const markup = html([service(1, "Seule")])
    expect(button(markup, "Monter Seule").disabled).toBe(true)
    expect(button(markup, "Descendre Seule").disabled).toBe(true)
  })
})
