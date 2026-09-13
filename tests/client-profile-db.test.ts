import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { db, pool } from "@/lib/db"
import { companies, clients, bookings } from "@/lib/db/schema"
import { getClientProfileByBookingId, getClientProfileByClientId } from "@/lib/admin/client-profile"

/**
 * Tests d'INTÉGRATION (base réelle) de la fiche client calculée.
 *
 * Couvre l'isolation multi-tenant (anti-IDOR), le rapprochement email/téléphone,
 * la non-fusion des coordonnées contradictoires, le « Montant réservé » (exclut
 * annulées + démo) et l'absence de fuite des notes internes. Ne s'exécute que si
 * DATABASE_URL est défini ; aucune migration n'est jouée par le test.
 */

const RUN = Boolean(process.env.DATABASE_URL)
const d = RUN ? describe : describe.skip
const RUN_ID = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`

const ctx = {} as {
  aId: number
  bId: number
  clientJean: number
  clientPaul: number
  clientContra: number
  bookingMarc: number
}

async function seedCompany(slug: string) {
  const [c] = await db
    .insert(companies)
    .values({ name: slug, slug, status: "ACTIVE" })
    .returning({ id: companies.id })
  return c.id
}

let bkSeq = 0
async function insertBooking(companyId: number, o: {
  email: string
  phone: string
  name?: string
  status?: string
  totalCents?: number
  isDemoData?: boolean
  date?: string
}) {
  bkSeq += 1
  const [b] = await db
    .insert(bookings)
    .values({
      companyId,
      reference: `TEST-CRM-${RUN_ID}-${bkSeq}`,
      customerName: o.name ?? "Client Test",
      customerEmail: o.email,
      customerPhone: o.phone,
      address: "1 rue du test, 75000 Paris",
      date: o.date ?? "2026-01-10",
      startTime: "10:00",
      endTime: "11:00",
      totalDurationMin: 60,
      totalCents: o.totalCents ?? 0,
      status: o.status ?? "confirmed",
      isDemoData: o.isDemoData ?? false,
    })
    .returning({ id: bookings.id })
  return b.id
}

async function insertClient(companyId: number, o: { name: string; email: string | null; phone: string | null; notes?: string | null }) {
  const [row] = await db
    .insert(clients)
    .values({ companyId, name: o.name, email: o.email, phone: o.phone, notes: o.notes ?? null, updatedAt: new Date() })
    .returning({ id: clients.id })
  return row.id
}

beforeAll(async () => {
  if (!RUN) return
  await pool.query("DELETE FROM companies WHERE slug LIKE 'test-crm-%'")
  ctx.aId = await seedCompany(`test-crm-a-${RUN_ID}`)
  ctx.bId = await seedCompany(`test-crm-b-${RUN_ID}`)

  // --- Entreprise A ---
  // Jean : fiche manuelle + 4 réservations (email identique).
  ctx.clientJean = await insertClient(ctx.aId, {
    name: "Jean Dupont",
    email: "jean@a.fr",
    phone: "0611111111",
    notes: "Note interne A",
  })
  await insertBooking(ctx.aId, { email: "jean@a.fr", phone: "0611111111", status: "completed", totalCents: 10000, date: "2026-02-01" })
  await insertBooking(ctx.aId, { email: "jean@a.fr", phone: "0611111111", status: "cancelled", totalCents: 4000 })
  await insertBooking(ctx.aId, { email: "jean@a.fr", phone: "0611111111", status: "confirmed", totalCents: 3000, isDemoData: true })
  await insertBooking(ctx.aId, { email: "jean@a.fr", phone: "0611111111", status: "confirmed", totalCents: 5000 })

  // Paul : fiche manuelle SANS email, rapprochement par téléphone.
  ctx.clientPaul = await insertClient(ctx.aId, { name: "Paul Martin", email: null, phone: "0633333333" })
  await insertBooking(ctx.aId, { email: "paul-booking@a.fr", phone: "0633333333", status: "confirmed", totalCents: 2000 })

  // Contra : même téléphone qu'une réservation MAIS email différent (à vérifier).
  ctx.clientContra = await insertClient(ctx.aId, { name: "Contra", email: "contra@a.fr", phone: "0644444444" })
  await insertBooking(ctx.aId, { email: "autre@b.fr", phone: "0644444444", status: "confirmed", totalCents: 9000 })

  // Marc : client issu UNIQUEMENT d'une réservation (aucune fiche manuelle).
  ctx.bookingMarc = await insertBooking(ctx.aId, { email: "marc@a.fr", phone: "0622222222", name: "Marc", status: "confirmed", totalCents: 7000 })

  // --- Entreprise B (isolation) : même email que Jean, mais tenant différent. ---
  await insertBooking(ctx.bId, { email: "jean@a.fr", phone: "0611111111", status: "completed", totalCents: 99999 })
})

afterAll(async () => {
  if (!RUN) return
  if (ctx.aId) await db.delete(companies).where(eq(companies.id, ctx.aId))
  if (ctx.bId) await db.delete(companies).where(eq(companies.id, ctx.bId))
  await pool.end().catch(() => {})
})

d("Fiche client — accès et isolation tenant", () => {
  it("accès normal à une fiche du tenant courant", async () => {
    const p = await getClientProfileByClientId(ctx.clientJean, ctx.aId)
    expect(p).not.toBeNull()
    expect(p!.clientId).toBe(ctx.clientJean)
    expect(p!.hasManualRecord).toBe(true)
    expect(p!.source).toBe("both")
  })

  it("refuse un clientId appartenant à un autre tenant (résultat neutre)", async () => {
    const p = await getClientProfileByClientId(ctx.clientJean, ctx.bId)
    expect(p).toBeNull()
  })

  it("ouvre une fiche virtuelle depuis une réservation du tenant", async () => {
    const p = await getClientProfileByBookingId(ctx.bookingMarc, ctx.aId)
    expect(p).not.toBeNull()
    expect(p!.clientId).toBeNull()
    expect(p!.source).toBe("booking")
  })

  it("refuse un bookingId virtuel appartenant à un autre tenant", async () => {
    const p = await getClientProfileByBookingId(ctx.bookingMarc, ctx.bId)
    expect(p).toBeNull()
  })
})

d("Fiche client — rapprochement & indicateurs", () => {
  it("rapproche toutes les réservations du même email (isolé du tenant B)", async () => {
    const p = await getClientProfileByClientId(ctx.clientJean, ctx.aId)
    expect(p!.stats.bookingsCount).toBe(4)
    expect(p!.stats.completedCount).toBe(1)
  })

  it("« Montant réservé » exclut les annulées et les données de démonstration", async () => {
    const p = await getClientProfileByClientId(ctx.clientJean, ctx.aId)
    // 10000 (terminée) + 5000 (confirmée). Exclut 4000 (annulée) et 3000 (démo).
    expect(p!.stats.reservedCents).toBe(15000)
  })

  it("repli par téléphone quand la fiche n'a pas d'email", async () => {
    const p = await getClientProfileByClientId(ctx.clientPaul, ctx.aId)
    expect(p!.stats.bookingsCount).toBe(1)
    expect(p!.stats.reservedCents).toBe(2000)
  })

  it("ne fusionne pas des coordonnées contradictoires (téléphone identique, email différent)", async () => {
    const p = await getClientProfileByClientId(ctx.clientContra, ctx.aId)
    expect(p!.stats.bookingsCount).toBe(0)
    expect(p!.needsReview).toBe(true)
  })
})

d("Fiche client — notes internes", () => {
  it("expose les notes d'une fiche manuelle", async () => {
    const p = await getClientProfileByClientId(ctx.clientJean, ctx.aId)
    expect(p!.notes).toBe("Note interne A")
  })

  it("ne fabrique jamais de notes pour un client issu des réservations", async () => {
    const p = await getClientProfileByBookingId(ctx.bookingMarc, ctx.aId)
    expect(p!.notes).toBeNull()
    expect(p!.hasManualRecord).toBe(false)
  })
})
