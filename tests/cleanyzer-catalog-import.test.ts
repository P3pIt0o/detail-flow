import { PGlite } from "@electric-sql/pglite"
import { beforeEach, describe, expect, it } from "vitest"
import { OPTIONS, SERVICES, formatReport, runCleanyzerImport } from "../scripts/cleanyzer-catalog-import.mjs"

/**
 * Import Cleanyzer contre un Postgres EN MÉMOIRE (PGlite) reproduisant les
 * colonnes / contraintes / défauts réels. Aucun accès à une base distante.
 */

const SCHEMA = `
CREATE TABLE companies (id serial PRIMARY KEY, name text NOT NULL, slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'BETA', "siteContent" jsonb, "updatedAt" timestamp NOT NULL DEFAULT now());
CREATE TABLE vehicle_types (id serial PRIMARY KEY, "companyId" integer NOT NULL REFERENCES companies(id),
  name text NOT NULL, active boolean NOT NULL DEFAULT true, "sortOrder" integer NOT NULL DEFAULT 0);
CREATE TABLE service_categories (id serial PRIMARY KEY, "companyId" integer NOT NULL REFERENCES companies(id),
  name text NOT NULL, slug text NOT NULL, "sortOrder" integer NOT NULL DEFAULT 0, UNIQUE ("companyId", slug));
CREATE TABLE services (id serial PRIMARY KEY, "companyId" integer NOT NULL REFERENCES companies(id),
  "categoryId" integer, name text NOT NULL, slug text NOT NULL, description text, image text,
  "basePriceCents" integer NOT NULL DEFAULT 0, "durationMin" integer NOT NULL DEFAULT 60,
  "sortOrder" integer NOT NULL DEFAULT 0, visible boolean NOT NULL DEFAULT true,
  "createdAt" timestamp NOT NULL DEFAULT now(), UNIQUE ("companyId", slug));
CREATE TABLE service_prices (id serial PRIMARY KEY, "serviceId" integer NOT NULL, "vehicleTypeId" integer NOT NULL,
  "priceCents" integer NOT NULL DEFAULT 0, "durationMin" integer NOT NULL DEFAULT 60);
CREATE TABLE options (id serial PRIMARY KEY, "companyId" integer NOT NULL REFERENCES companies(id),
  name text NOT NULL, slug text NOT NULL, description text, "priceCents" integer NOT NULL DEFAULT 0,
  "durationMin" integer NOT NULL DEFAULT 0, "sortOrder" integer NOT NULL DEFAULT 0,
  visible boolean NOT NULL DEFAULT true, UNIQUE ("companyId", slug));
`

let db: PGlite
let cleanyzerId: number
let otherId: number

async function snapshotOther(id: number) {
  const q = async (text: string) => (await db.query(text, [id])).rows
  return JSON.stringify([
    await q(`SELECT * FROM companies WHERE id = $1`),
    await q(`SELECT * FROM services WHERE "companyId" = $1 ORDER BY id`),
    await q(`SELECT * FROM options WHERE "companyId" = $1 ORDER BY id`),
    await q(`SELECT * FROM service_categories WHERE "companyId" = $1 ORDER BY id`),
    await q(`SELECT sp.* FROM service_prices sp JOIN services s ON s.id = sp."serviceId" WHERE s."companyId" = $1 ORDER BY sp.id`),
  ])
}

// Durées de TEST uniquement (fournies à l'exécution) : aucune durée n'est codée dans le script.
const DURATIONS: Record<string, number> = Object.fromEntries(SERVICES.map((s, i) => [s.slug, 100 + i]))
const run = (apply: boolean, durations: Record<string, number> = DURATIONS) =>
  runCleanyzerImport(db, { apply, durations })

const one = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
  (await db.query<T>(text, params)).rows[0]

beforeEach(async () => {
  db = new PGlite()
  await db.exec(SCHEMA)
  cleanyzerId = (await one<{ id: number }>(`INSERT INTO companies (name, slug, status) VALUES ('Cleanyzer', 'cleanyzer', 'ACTIVE') RETURNING id`)).id
  otherId = (await one<{ id: number }>(`INSERT INTO companies (name, slug, status) VALUES ('Spirit ACS', 'spirit-acs', 'ACTIVE') RETURNING id`)).id
  for (const [i, name] of ["Citadine", "Berline", "SUV"].entries()) {
    await db.query(`INSERT INTO vehicle_types ("companyId", name, "sortOrder") VALUES ($1, $2, $3)`, [cleanyzerId, name, i])
    await db.query(`INSERT INTO vehicle_types ("companyId", name, "sortOrder") VALUES ($1, $2, $3)`, [otherId, name, i])
  }
  // Autre tenant avec les MÊMES slugs : doit rester intact.
  const svc = await one<{ id: number }>(
    `INSERT INTO services ("companyId", name, slug, "basePriceCents", "durationMin") VALUES ($1, 'Autre Éco', 'interieur-eco', 1234, 45) RETURNING id`,
    [otherId],
  )
  await db.query(`INSERT INTO service_prices ("serviceId", "vehicleTypeId", "priceCents") VALUES ($1, 1, 1234)`, [svc.id])
  await db.query(`INSERT INTO options ("companyId", name, slug, "priceCents") VALUES ($1, 'Ozone autre', 'ozone', 999)`, [otherId])
})

describe("import Cleanyzer", () => {
  it("dry-run : rapport complet, SAFE TO APPLY YES, aucune écriture", async () => {
    const r = await run(false)
    expect(r.safe).toBe(true)
    expect(r.committed).toBe(false)
    expect(r.services.toCreate).toHaveLength(SERVICES.length)
    expect(r.options.toCreate).toHaveLength(OPTIONS.length)
    expect((await one<{ n: number }>(`SELECT count(*)::int AS n FROM services WHERE "companyId" = $1`, [cleanyzerId])).n).toBe(0)
    const text = formatReport(r)
    expect(text).toContain(`company_id : ${cleanyzerId}`)
    expect(text).toContain("AUTRES COMPANY_ID TOUCHÉS : 0")
    expect(text).toContain("données existantes écrasées : 0")
    expect(text).toContain("tenant créé : NON")
    expect(text).toContain("SAFE TO APPLY: YES")
  })

  it("1re exécution : catalogue créé, sans faux prix ni faux calcul, autres tenants intacts", async () => {
    const before = await snapshotOther(otherId)
    const r = await run(true)
    expect(r.safe).toBe(true)
    expect(r.committed).toBe(true)
    expect(r.protections).toEqual({ overwritten: 0, otherCompaniesTouched: 0, tenantCreated: false, deleted: 0 })

    const services = (await db.query<{ slug: string; visible: boolean; basePriceCents: number }>(
      `SELECT slug, visible, "basePriceCents" FROM services WHERE "companyId" = $1`, [cleanyzerId])).rows
    expect(services).toHaveLength(8)
    expect(services.some((s) => s.slug.includes("diamond"))).toBe(false)
    for (const [slug, cents] of [["canape-2-3-places", 8000], ["canape-3-4-places", 11000], ["canape-5-places-et-plus", 15000]] as const) {
      expect(services.find((s) => s.slug === slug)).toMatchObject({ visible: true, basePriceCents: cents })
    }
    const durs = (await db.query<{ slug: string; durationMin: number }>(
      `SELECT slug, "durationMin" FROM services WHERE "companyId" = $1`, [cleanyzerId])).rows
    for (const d of durs) expect(d.durationMin).toBe(DURATIONS[d.slug])
    const prices = (await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM service_prices sp JOIN services s ON s.id = sp."serviceId" WHERE s."companyId" = $1`, [cleanyzerId])).n
    expect(prices).toBe(15)

    const opts = (await db.query<{ slug: string; visible: boolean; priceCents: number; description: string | null }>(
      `SELECT slug, visible, "priceCents", description FROM options WHERE "companyId" = $1`, [cleanyzerId])).rows
    const bySlug = Object.fromEntries(opts.map((o) => [o.slug, o]))
    for (const slug of ["demontage-sieges", "vehicule-sale", "incruste", "capote", "duo-capote", "ceramique-hybride", "plastiques", "optiques", "revernissage"]) {
      expect(bySlug[slug]).toBeUndefined()
    }
    expect(opts).toHaveLength(14)
    for (const slug of ["tapis", "sieges"]) {
      expect(bySlug[slug].visible).toBe(false)
      expect(bySlug[slug].description).toMatch(/quantité/)
    }
    expect(bySlug.ozone).toMatchObject({ visible: true, priceCents: 4900 })
    // Aucune option visible à 0 € : aucun faux prix public.
    expect(opts.filter((o) => o.visible && o.priceCents <= 0)).toHaveLength(0)

    for (const slug of ["textile-cuir", "textile-impermeabilisation"]) {
      expect(bySlug[slug].visible).toBe(false)
      expect(bySlug[slug].description).toMatch(/quantité/)
    }
    // Textile = prestations BookingV2 normales : la ligne companies n'est pas modifiée.
    const company = await one<{ siteContent: unknown }>(`SELECT "siteContent" FROM companies WHERE id = $1`, [cleanyzerId])
    expect(company.siteContent).toBeNull()

    expect(await snapshotOther(otherId)).toBe(before)
  })

  it("2e exécution : les modifications de Tom sont CONSERVÉES", async () => {
    await run(true)
    await db.query(
      `UPDATE services SET name = 'Éco by Tom', "basePriceCents" = 5500, "durationMin" = 95, visible = false, description = 'Texte Tom'
       WHERE "companyId" = $1 AND slug = 'interieur-eco'`, [cleanyzerId])
    await db.query(
      `UPDATE service_prices SET "priceCents" = 7777, "durationMin" = 120
       WHERE "serviceId" = (SELECT id FROM services WHERE "companyId" = $1 AND slug = 'interieur-eco')`, [cleanyzerId])
    await db.query(`UPDATE options SET "priceCents" = 5900, visible = false, name = 'Ozone Tom' WHERE "companyId" = $1 AND slug = 'ozone'`, [cleanyzerId])
    await db.query(`UPDATE options SET "priceCents" = 8000, visible = true WHERE "companyId" = $1 AND slug = 'tapis'`, [cleanyzerId])
    await db.query(`UPDATE services SET "basePriceCents" = 9000 WHERE "companyId" = $1 AND slug = 'canape-2-3-places'`, [cleanyzerId])
    const before = await snapshotOther(otherId)

    const r = await run(true)
    expect(r.safe).toBe(true)
    expect(r.services.toCreate).toHaveLength(0)
    expect(r.options.toCreate).toHaveLength(0)
    expect(r.categories.toCreate).toHaveLength(0)
    expect(r.services.preserved).toHaveLength(8)
    expect(r.totalRows).toBe(0)
    expect(r.protections).toEqual({ overwritten: 0, otherCompaniesTouched: 0, tenantCreated: false, deleted: 0 })

    expect(await one(`SELECT name, "basePriceCents", "durationMin", visible, description FROM services WHERE "companyId" = $1 AND slug = 'interieur-eco'`, [cleanyzerId]))
      .toEqual({ name: "Éco by Tom", basePriceCents: 5500, durationMin: 95, visible: false, description: "Texte Tom" })
    const tomPrices = (await db.query<{ priceCents: number; durationMin: number }>(
      `SELECT "priceCents", "durationMin" FROM service_prices WHERE "serviceId" = (SELECT id FROM services WHERE "companyId" = $1 AND slug = 'interieur-eco')`, [cleanyzerId])).rows
    expect(tomPrices).toHaveLength(3)
    expect(tomPrices.every((p) => p.priceCents === 7777 && p.durationMin === 120)).toBe(true)
    expect(await one(`SELECT name, "priceCents", visible FROM options WHERE "companyId" = $1 AND slug = 'ozone'`, [cleanyzerId]))
      .toEqual({ name: "Ozone Tom", priceCents: 5900, visible: false })
    expect(await one(`SELECT "priceCents", visible FROM options WHERE "companyId" = $1 AND slug = 'tapis'`, [cleanyzerId]))
      .toEqual({ priceCents: 8000, visible: true })
    expect(await one(`SELECT "basePriceCents" FROM services WHERE "companyId" = $1 AND slug = 'canape-2-3-places'`, [cleanyzerId]))
      .toEqual({ basePriceCents: 9000 })
    expect(await snapshotOther(otherId)).toBe(before)
  })

  it("idempotence : 2e passage sans modification => 0 création, 0 modification, 0 doublon", async () => {
    await run(true)
    const snapshotAll = async () => JSON.stringify([await snapshotOther(cleanyzerId), await snapshotOther(otherId)])
    const before = await snapshotAll()
    const r = await run(true)
    expect(r.safe).toBe(true)
    expect(r.totalRows).toBe(0)
    expect(r.servicePricesToCreate).toBe(0)
    expect(r.categories.toCreate.length + r.services.toCreate.length + r.options.toCreate.length).toBe(0)
    expect(r.protections).toEqual({ overwritten: 0, otherCompaniesTouched: 0, tenantCreated: false, deleted: 0 })
    expect(await snapshotAll()).toBe(before)
    const dup = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM (SELECT "serviceId", "vehicleTypeId" FROM service_prices GROUP BY 1, 2 HAVING count(*) > 1) d`)
    expect(dup.n).toBe(0)
  })

  it("prestation supprimée par Tom : seule la ligne manquante est recréée, le reste est préservé", async () => {
    await run(true)
    await db.query(`DELETE FROM options WHERE "companyId" = $1 AND slug = 'vitres'`, [cleanyzerId])
    const r = await run(true)
    expect(r.options.toCreate).toEqual(["Vitres"])
    expect(r.protections.overwritten).toBe(0)
  })

  it("durée invalide => NO, rien d'écrit ; sans surcharge, les durées initiales validées s'appliquent", async () => {
    const r = await run(true, { ...DURATIONS, "canape-2-3-places": 0 })
    expect(r.safe).toBe(false)
    expect(r.committed).toBe(false)
    expect(r.blockers.join(" ")).toContain("canape-2-3-places")
    expect((await one<{ n: number }>(`SELECT count(*)::int AS n FROM services WHERE "companyId" = $1`, [cleanyzerId])).n).toBe(0)

    const defaults = await run(true, {})
    expect(defaults.safe).toBe(true)
    const durs = (await db.query<{ slug: string; durationMin: number }>(
      `SELECT slug, "durationMin" FROM services WHERE "companyId" = $1`, [cleanyzerId])).rows
    expect(Object.fromEntries(durs.map((d) => [d.slug, d.durationMin]))).toEqual({
      "interieur-eco": 90, "interieur-premium": 120, "interieur-excellence": 180,
      "exterieur-eco": 60, "exterieur-excellence": 90,
      "canape-2-3-places": 90, "canape-3-4-places": 120, "canape-5-places-et-plus": 150,
    })
  })

  it("tenant introuvable => SAFE TO APPLY NO, aucun tenant créé", async () => {
    await db.query(`UPDATE companies SET slug = 'cleanyzer-old' WHERE id = $1`, [cleanyzerId])
    const r = await run(true)
    expect(r.safe).toBe(false)
    expect(r.committed).toBe(false)
    expect((await one<{ n: number }>(`SELECT count(*)::int AS n FROM companies`)).n).toBe(2)
    expect(formatReport(r)).toContain("SAFE TO APPLY: NO")
  })

  it("plusieurs entreprises correspondantes => NO", async () => {
    await db.query(`INSERT INTO companies (name, slug) VALUES ('Clone', 'CLEANYZER')`)
    const r = await run(true)
    expect(r.safe).toBe(false)
  })

  it("gabarits incohérents => NO, rien d'écrit", async () => {
    await db.query(`UPDATE vehicle_types SET active = false WHERE "companyId" = $1 AND name = 'SUV'`, [cleanyzerId])
    const r = await run(true)
    expect(r.safe).toBe(false)
    expect((await one<{ n: number }>(`SELECT count(*)::int AS n FROM services WHERE "companyId" = $1`, [cleanyzerId])).n).toBe(0)
  })

  it("doublon ambigu (même nom, autre slug) => NO, rien d'écrit", async () => {
    await db.query(`INSERT INTO options ("companyId", name, slug, "priceCents") VALUES ($1, 'Ozone', 'ozone-tom', 4500)`, [cleanyzerId])
    const r = await run(true)
    expect(r.safe).toBe(false)
    expect(r.committed).toBe(false)
    expect((await one<{ n: number }>(`SELECT count(*)::int AS n FROM services WHERE "companyId" = $1`, [cleanyzerId])).n).toBe(0)
  })
})
