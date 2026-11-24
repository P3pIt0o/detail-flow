import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { eq } from "drizzle-orm"

/**
 * L75 — Tests d'INTÉGRATION (base réelle, branche de DEV uniquement).
 * Ignorés sans DATABASE_URL : jamais comptés « réussis » s'ils sont ignorés.
 * Lancés par le développeur via `node .claude/hooks/dfguard.mjs check L75`.
 * Aucune migration jouée : si la colonne fixedStartTimes est absente, on vérifie
 * la lecture/écriture tolérante ; si elle est présente, l'isolation tenant A/B.
 */

const state = vi.hoisted(() => ({ tenantId: 0 }))
vi.mock("next/cache", () => ({ revalidatePath: () => {} }))
vi.mock("@/lib/booking/travel", () => ({ geocodeAddress: async () => null }))
vi.mock("@/lib/admin", () => ({
  requireCompanyMember: async () => ({
    user: { id: "u", email: "x@x.fr", name: "X" },
    tenant: { id: state.tenantId },
    role: "OWNER",
    isSuperAdmin: false,
  }),
}))

import { db, pool } from "@/lib/db"
import { companies, businessHours } from "@/lib/db/schema"
import { getBusinessHours } from "@/lib/booking/queries"
import { businessHoursFixedStarts } from "@/lib/booking/slot-times"
import { saveBusinessHours } from "@/app/admin/(dashboard)/parametres/actions"

const RUN_ID = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`
const ctx = {} as { aId: number; bId: number; columnPresent: boolean }

const d = process.env.DATABASE_URL ? describe : describe.skip

d("L75 — heures fixes : intégration DB", () => {
  beforeAll(async () => {
    const [a] = await db
      .insert(companies)
      .values({ name: `l75-a-${RUN_ID}`, slug: `l75-a-${RUN_ID}`, status: "ACTIVE" })
      .returning({ id: companies.id })
    const [b] = await db
      .insert(companies)
      .values({ name: `l75-b-${RUN_ID}`, slug: `l75-b-${RUN_ID}`, status: "ACTIVE" })
      .returning({ id: companies.id })
    ctx.aId = a.id
    ctx.bId = b.id
    // Insertion via la table historique : doit fonctionner avec ou sans migration.
    await db.insert(businessHours).values([
      { companyId: a.id, dayOfWeek: 6, isOpen: true, openTime: "08:00", closeTime: "18:00" },
      { companyId: b.id, dayOfWeek: 6, isOpen: true, openTime: "09:00", closeTime: "17:00" },
    ])
    try {
      await db.select({ f: businessHoursFixedStarts.fixedStartTimes }).from(businessHoursFixedStarts).limit(1)
      ctx.columnPresent = true
    } catch {
      ctx.columnPresent = false
    }
  })

  afterAll(async () => {
    if (ctx.aId) await db.delete(companies).where(eq(companies.id, ctx.aId))
    if (ctx.bId) await db.delete(companies).where(eq(companies.id, ctx.bId))
    await pool.end().catch(() => {})
  })

  it("select complet sur la table historique fonctionne (export)", async () => {
    const rows = await db.select().from(businessHours).where(eq(businessHours.companyId, ctx.aId))
    expect(rows).toHaveLength(1)
  })

  it("lecture tolérante : getBusinessHours renvoie les horaires", async () => {
    const rows = await getBusinessHours(ctx.aId)
    expect(rows).toHaveLength(1)
    expect(rows[0].openTime).toBe("08:00")
    if (!ctx.columnPresent) expect(rows[0].fixedStartTimes).toBeNull()
  })

  it("tenant A enregistre ses heures fixes ; tenant B ne les voit ni ne les modifie", async () => {
    state.tenantId = ctx.aId
    const resA = await saveBusinessHours([
      { dayOfWeek: 6, isOpen: true, openTime: "08:00", closeTime: "18:00", fixedStartTimes: ["13:00", "08:00"] },
    ])
    if (!ctx.columnPresent) {
      expect(resA.ok).toBe(false)
      return
    }
    expect(resA.ok).toBe(true)
    expect((await getBusinessHours(ctx.aId))[0].fixedStartTimes).toBe("08:00,13:00")
    expect((await getBusinessHours(ctx.bId))[0].fixedStartTimes).toBeNull()

    state.tenantId = ctx.bId
    const forged = {
      dayOfWeek: 6,
      isOpen: false,
      openTime: "00:00",
      closeTime: "01:00",
      fixedStartTimes: ["10:00"],
      companyId: ctx.aId,
    }
    const resB = await saveBusinessHours([forged])
    expect(resB.ok).toBe(true)
    const a = (await getBusinessHours(ctx.aId))[0]
    expect(a).toMatchObject({ isOpen: true, openTime: "08:00", fixedStartTimes: "08:00,13:00" })
    expect((await getBusinessHours(ctx.bId))[0]).toMatchObject({ isOpen: false, fixedStartTimes: "10:00" })
  })
})
