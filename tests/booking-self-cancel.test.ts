import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { eq } from "drizzle-orm"
import { db, pool } from "@/lib/db"
import { companies, bookings } from "@/lib/db/schema"
import { cancelBookingByToken, isCancellableNow } from "@/lib/booking/cancel"
import { getBookingByManageToken, BLOCKING_STATUSES } from "@/lib/booking/queries"

/**
 * Tests de l'AUTO-ANNULATION d'un rendez-vous par le client final (jeton public).
 *
 * Deux niveaux :
 *  - assertions PURES (toujours exécutées) : prédicat d'annulabilité, statut
 *    d'annulation non bloquant (le créneau se libère), garde email non bloquante ;
 *  - assertions DB (si DATABASE_URL) : isolation multi-tenant du jeton, cycle
 *    d'annulation, non-suppression, double annulation refusée, RDV passé refusé.
 */

/* --------------------------- Assertions pures --------------------------- */

describe("Auto-annulation — règles pures", () => {
  const future = "2999-01-01"
  const past = "2000-01-01"

  it("annulable si actif et à venir", () => {
    expect(isCancellableNow({ status: "confirmed", date: future, startTime: "10:00" })).toBe(true)
    expect(isCancellableNow({ status: "pending_deposit", date: future, startTime: "10:00" })).toBe(true)
  })

  it("non annulable si déjà annulé / terminé / passé", () => {
    expect(isCancellableNow({ status: "cancelled", date: future, startTime: "10:00" })).toBe(false)
    expect(isCancellableNow({ status: "completed", date: future, startTime: "10:00" })).toBe(false)
    expect(isCancellableNow({ status: "confirmed", date: past, startTime: "10:00" })).toBe(false)
  })

  it("le statut 'cancelled' n'est PAS bloquant => le créneau redevient disponible", () => {
    expect(BLOCKING_STATUSES).not.toContain("cancelled")
  })

  it("l'action publique ne renvoie jamais companyId au navigateur (résolution serveur)", () => {
    const src = readFileSync(join(process.cwd(), "app/(site)/reservation/gerer/actions.ts"), "utf8")
    // companyId provient de resolveRequestTenant, jamais d'un argument client.
    expect(src).toContain("resolveRequestTenant()")
    expect(src).not.toMatch(/function cancelMyBookingAction\([^)]*companyId/)
  })

  it("l'envoi d'email d'annulation est encapsulé (échec non bloquant)", () => {
    const src = readFileSync(join(process.cwd(), "lib/email/notifications.ts"), "utf8")
    // La fonction dédiée existe et avale ses erreurs (try/catch + console.log).
    expect(src).toContain("export async function sendCustomerCancellationEmails")
    expect(src).toContain("sendCustomerCancellationEmails a échoué")
  })
})

/* ----------------------------- Assertions DB ----------------------------- */

const RUN = Boolean(process.env.DATABASE_URL)
const d = RUN ? describe : describe.skip

const RUN_ID = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`
const SLUG_A = `test-cancel-a-${RUN_ID}`
const SLUG_B = `test-cancel-b-${RUN_ID}`

type Ctx = {
  aId: number
  bId: number
  aToken: string
  bToken: string
  aBookingId: number
  pastToken: string
}
const ctx = {} as Ctx

async function seedBooking(companyId: number, ref: string, token: string, date: string, status = "confirmed") {
  const [b] = await db
    .insert(bookings)
    .values({
      companyId,
      reference: ref,
      manageToken: token,
      customerName: "Client Test",
      customerEmail: "client@example.test",
      customerPhone: "+32470000000",
      address: "1 rue Test",
      date,
      startTime: "10:00",
      endTime: "11:00",
      totalDurationMin: 60,
      status,
    })
    .returning({ id: bookings.id })
  return b.id
}

beforeAll(async () => {
  if (!RUN) return
  await pool.query("DELETE FROM companies WHERE slug LIKE 'test-cancel-%'")
  const [a] = await db.insert(companies).values({ name: SLUG_A, slug: SLUG_A, status: "ACTIVE" }).returning({ id: companies.id })
  const [b] = await db.insert(companies).values({ name: SLUG_B, slug: SLUG_B, status: "ACTIVE" }).returning({ id: companies.id })
  ctx.aId = a.id
  ctx.bId = b.id
  ctx.aToken = `tok-a-${RUN_ID}`
  ctx.bToken = `tok-b-${RUN_ID}`
  ctx.pastToken = `tok-past-${RUN_ID}`
  ctx.aBookingId = await seedBooking(a.id, `${SLUG_A}-B1`, ctx.aToken, "2999-01-01")
  await seedBooking(b.id, `${SLUG_B}-B1`, ctx.bToken, "2999-01-01")
  await seedBooking(a.id, `${SLUG_A}-PAST`, ctx.pastToken, "2000-01-01")
})

afterAll(async () => {
  if (!RUN) return
  if (ctx.aId) await db.delete(companies).where(eq(companies.id, ctx.aId))
  if (ctx.bId) await db.delete(companies).where(eq(companies.id, ctx.bId))
  await pool.end()
})

d("Auto-annulation — isolation & cycle (DB)", () => {
  it("le jeton n'affiche que le bon booking (scopé tenant)", async () => {
    const found = await getBookingByManageToken(ctx.aToken, ctx.aId)
    expect(found?.booking.id).toBe(ctx.aBookingId)
  })

  it("tenant A ne peut pas accéder au booking B via le jeton de B", async () => {
    // Jeton de B présenté dans le contexte du tenant A => rien.
    const cross = await getBookingByManageToken(ctx.bToken, ctx.aId)
    expect(cross).toBeNull()
  })

  it("annulation A refusée avec le companyId de B (anti inter-tenant)", async () => {
    const res = await cancelBookingByToken(ctx.aToken, ctx.bId)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe("not_found")
    // Le booking A reste intact.
    const [row] = await db.select({ status: bookings.status }).from(bookings).where(eq(bookings.id, ctx.aBookingId))
    expect(row.status).toBe("confirmed")
  })

  it("RDV passé non annulable", async () => {
    const res = await cancelBookingByToken(ctx.pastToken, ctx.aId)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe("past")
  })

  it("annulation fonctionne, le booking reste en DB (jamais supprimé)", async () => {
    const res = await cancelBookingByToken(ctx.aToken, ctx.aId)
    expect(res.ok).toBe(true)
    const [row] = await db
      .select({ status: bookings.status })
      .from(bookings)
      .where(eq(bookings.id, ctx.aBookingId))
    expect(row).toBeDefined()
    expect(row.status).toBe("cancelled")
  })

  it("seconde annulation refusée proprement (already_cancelled)", async () => {
    const res = await cancelBookingByToken(ctx.aToken, ctx.aId)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe("already_cancelled")
  })
})
