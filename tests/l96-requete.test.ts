import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { PgDialect } from "drizzle-orm/pg-core"
import type { SQL } from "drizzle-orm"

/**
 * L96 — la requête groupée de l'accueil sur une VRAIE base PostgreSQL en mémoire :
 * un seul appel base par chargement, et le tenant B n'est jamais visible par A.
 */
vi.mock("server-only", () => ({}))
const { holder } = vi.hoisted(() => ({
  holder: { calls: 0, pg: null as null | { query: (q: string, p: unknown[]) => Promise<{ rows: unknown[] }> } },
}))
vi.mock("@/lib/db", () => {
  const dialect = new PgDialect()
  return {
    db: {
      execute: async (q: SQL) => {
        holder.calls++
        const r = dialect.sqlToQuery(q)
        return holder.pg!.query(r.sql, r.params as unknown[])
      },
    },
  }
})

import { loadTodayData } from "@/lib/admin/today-query"

const A = 1
const B = 2
const NOW = new Date("2026-11-27T10:00:00Z")
const opts = { timezone: "Europe/Paris", canStats: true, canLeads: true, now: NOW }
let pg: PGlite

const SCHEMA = `
  CREATE TABLE settings ("companyId" int, "businessName" text, "businessPhone" text, "businessAddress" text, "billingProfileConfirmedAt" timestamp);
  CREATE TABLE services (id serial, "companyId" int, visible boolean DEFAULT true);
  CREATE TABLE vehicle_types (id serial, "companyId" int, active boolean DEFAULT true);
  CREATE TABLE business_hours (id serial, "companyId" int, "isOpen" boolean);
  CREATE TABLE public_page_config (id serial, "companyId" int, "publishedAt" timestamp);
  CREATE TABLE bookings (id int PRIMARY KEY, "companyId" int, "isDemoData" boolean DEFAULT false, "customerName" text, "customerEmail" text,
    "customerPhone" text, address text, date date, "startTime" text, status text, "totalCents" int DEFAULT 0, "depositCents" int DEFAULT 0);
  CREATE TABLE booking_items (id serial, "bookingId" int, "serviceName" text, "vehicleTypeName" text, "vehicleBrand" text, "vehicleModel" text);
  CREATE TABLE invoices (id int PRIMARY KEY, "companyId" int, "bookingId" int, "originalInvoiceId" int, "documentType" text DEFAULT 'invoice',
    status text, "currencyCode" text, "serviceDate" date, "issueDate" date, "createdAt" timestamp DEFAULT now(), "totalCents" int, "balanceCents" int DEFAULT 0);
  CREATE TABLE payments (id serial, "companyId" int, "bookingId" int, status text, "grossAmountCents" int, "refundedAmountCents" int DEFAULT 0, "paidAt" timestamp, "refundedAt" timestamp);
  CREATE TABLE custom_requests (id int PRIMARY KEY, "companyId" int, status text, "createdAt" timestamp DEFAULT now());
  CREATE TABLE leads (id serial, "companyId" int, status text, "nextFollowUpAt" timestamp);
  CREATE TABLE maintenance_subscription_requests (id serial, "companyId" int, status text, "expiresAt" timestamp);
  CREATE TABLE maintenance_cancellation_requests (id serial, "companyId" int, status text);
  CREATE TABLE tenant_analytics_daily (id serial, "companyId" int, date text, "uniqueVisitors" int);
`

/** Un jeu complet par entreprise ; `k` distingue identifiants, noms et montants. */
function seed(c: number, k: number) {
  const id = (n: number) => k * 1000 + n
  return `
    INSERT INTO settings VALUES (${c}, 'Ent ${c}', '060000000${c}', 'rue ${c}', now());
    ${"INSERT INTO services(\"companyId\") VALUES (" + c + ");".repeat(1)}
    ${`INSERT INTO services("companyId") VALUES (${c});`.repeat(k - 1)}
    ${`INSERT INTO vehicle_types("companyId") VALUES (${c});`.repeat(k)}
    ${`INSERT INTO business_hours("companyId", "isOpen") VALUES (${c}, true);`.repeat(k)}
    INSERT INTO public_page_config("companyId", "publishedAt") VALUES (${c}, ${c === 1 ? "now()" : "NULL"});
    INSERT INTO bookings(id, "companyId", "customerName", "customerEmail", "customerPhone", address, date, "startTime", status, "totalCents") VALUES
      (${id(1)}, ${c}, 'Jour ${c}', 'jour${c}@x.fr', '1', 'a, 1', '2026-11-27', '09:00', 'confirmed', ${k * 100}),
      (${id(2)}, ${c}, 'Annule ${c}', 'ann${c}@x.fr', '1', 'a, 1', '2026-11-27', '10:00', 'cancelled', 500),
      (${id(3)}, ${c}, 'Suite ${c}', 'suite${c}@x.fr', '1', 'a, 1', '2026-12-0${k}', '09:00', 'pending_deposit', 100),
      (${id(4)}, ${c}, 'Perdu ${c}', 'perdu@x.fr', '1', 'a, 1', '2026-09-0${k}', '09:00', 'completed', 100),
      (${id(5)}, ${c}, 'Octobre ${c}', 'oct${c}@x.fr', '1', 'a, 1', '2026-10-15', '09:00', 'completed', 100);
    INSERT INTO booking_items("bookingId", "serviceName", "vehicleTypeName") VALUES (${id(1)}, 'Lavage ${c}', 'Citadine');
    INSERT INTO invoices(id, "companyId", status, "serviceDate", "totalCents", "balanceCents") VALUES
      (${id(1)}, ${c}, 'paid', '2026-11-10', ${k * 1000}, 0),
      (${id(2)}, ${c}, 'paid', '2026-10-10', ${k * 700}, 0),
      (${id(3)}, ${c}, 'issued', '2026-11-11', ${k * 300}, ${k * 300});
    INSERT INTO payments("companyId", status, "grossAmountCents", "paidAt") VALUES (${c}, 'paid', ${k * 50}, '2026-11-12'), (${c}, 'pending', 999, '2026-11-12');
    ${`INSERT INTO custom_requests(id, "companyId", status) VALUES (${id(1)}, ${c}, 'new'), (${id(2)}, ${c}, 'proposal_sent');`}
    ${`INSERT INTO leads("companyId", status, "nextFollowUpAt") VALUES (${c}, 'NEW', '2026-11-20');`.repeat(k)}
    ${`INSERT INTO maintenance_subscription_requests("companyId", status) VALUES (${c}, 'pending');`.repeat(k)}
    ${`INSERT INTO maintenance_cancellation_requests("companyId", status) VALUES (${c}, 'pending');`.repeat(k)}
    INSERT INTO tenant_analytics_daily("companyId", date, "uniqueVisitors") VALUES (${c}, '2026-11-20', ${k * 10}), (${c}, '2026-09-01', 999);
  `
}

beforeAll(async () => {
  pg = new PGlite()
  await pg.exec(SCHEMA)
  await pg.exec(seed(A, 1))
  await pg.exec(seed(B, 2))
  holder.pg = pg as never
})
beforeEach(() => {
  holder.calls = 0
})

describe("L96 — requête groupée de l'accueil", () => {
  it("un seul appel base, et chaque bloc ne contient que les données du tenant", async () => {
    for (const [c, k, other] of [[A, 1, B], [B, 2, A]]) {
      holder.calls = 0
      const d = await loadTodayData(c, opts)
      expect(holder.calls).toBe(1)
      expect(d.today).toBe("2026-11-27")
      expect(d.settings).toMatchObject({ businessName: `Ent ${c}`, billingConfirmed: true, mobileEnabled: true })
      expect([d.serviceCount, d.vehicleTypeCount, d.openDayCount]).toEqual([k, k, k])
      expect(d.publishedPage).toBe(c === A)
      expect(d.hasBooking).toBe(true)
      expect(d.todayBookings.map((b) => b.customerName)).toEqual([`Jour ${c}`])
      expect(d.todayBookings[0].items.map((i) => i.service)).toEqual([`Lavage ${c}`])
      expect(d.nextBooking).toEqual({ date: `2026-12-0${k}`, startTime: "09:00" })
      expect(d.lapsed).toEqual({ name: `Perdu ${c}`, bookingId: k * 1000 + 4, lastDate: `2026-09-0${k}` })
      expect(d.pendingDeposit).toBe(1)
      expect(d.requests).toEqual({ newCount: 1, acceptedCount: 0, quoteSentCount: 1, firstActionId: k * 1000 + 1 })
      expect(d.unpaid).toEqual({ count: 1, cents: k * 300, currencies: ["EUR"], firstId: k * 1000 + 3 })
      expect([d.subscriptionRequests, d.cancellationRequests, d.leadsDue]).toEqual([k, k, k])
      expect(d.figures).toMatchObject({ revenueCents: k * 1000, prevRevenueCents: k * 700, bookings: 1, prevBookings: 1, visits30: k * 10 })
      expect(d.figures?.payments.map((p) => p.grossAmountCents)).toEqual([k * 50])
      expect(JSON.stringify(d)).not.toContain(`Jour ${other}`)
      expect(JSON.stringify(d)).not.toContain(`Perdu ${other}`)
    }
  })

  it("paiement en ligne d'une réservation : reçu moins remboursé, jamais celui d'un autre tenant", async () => {
    await pg.exec(`INSERT INTO payments(id, "companyId", "bookingId", status, "grossAmountCents", "refundedAmountCents") VALUES
      (9100, 1, 1001, 'partially_refunded', 100, 40), (9101, 1, 1001, 'pending', 500, 0), (9102, 2, 1001, 'paid', 777, 0)`)
    expect((await loadTodayData(A, opts)).todayBookings[0]).toMatchObject({ paidOnlineCents: 60, isDemo: false })
    expect((await loadTodayData(B, opts)).todayBookings[0].paidOnlineCents).toBe(0)
    await pg.exec(`DELETE FROM payments WHERE id >= 9100`)
  })

  it("lieu : réglages lus pour l'étape de démarrage, colonnes absentes tolérées", async () => {
    expect((await loadTodayData(A, opts)).settings).toMatchObject({
      workshopEnabled: false,
      workshopAddress: "",
      hasBaseLocation: false,
      vatEnabled: false,
    })
    await pg.exec(`ALTER TABLE settings ADD COLUMN "vatEnabled" boolean; UPDATE settings SET "vatEnabled" = true WHERE "companyId" = 1`)
    expect((await loadTodayData(A, opts)).settings.vatEnabled).toBe(true)
    expect((await loadTodayData(B, opts)).settings.vatEnabled).toBe(false)
    await pg.exec(`ALTER TABLE settings DROP COLUMN "vatEnabled"`)
  })

  it("une entreprise sans aucune donnée ne voit rien des autres", async () => {
    const d = await loadTodayData(99, opts)
    expect(d.todayBookings).toEqual([])
    expect([d.nextBooking, d.lapsed, d.hasBooking, d.publishedPage]).toEqual([null, null, false, false])
    expect(d.requests.newCount + d.unpaid.count + d.pendingDeposit + d.leadsDue + d.subscriptionRequests).toBe(0)
    expect(d.figures).toMatchObject({ revenueCents: 0, bookings: 0, visits30: 0, payments: [] })
  })

  it("sans business_stats ni leads_crm : ni chiffres ni prospects lus", async () => {
    const d = await loadTodayData(A, { ...opts, canStats: false, canLeads: false })
    expect(d.figures).toBeNull()
    expect(d.leadsDue).toBe(0)
  })

  it("client revenu depuis (rendez-vous à venir) : pas de relance", async () => {
    await pg.exec(`INSERT INTO bookings(id, "companyId", "customerName", "customerEmail", "customerPhone", address, date, "startTime", status)
      VALUES (9001, 1, 'Perdu 1', 'PERDU@x.fr', '1', 'a, 1', '2026-12-20', '09:00', 'confirmed')`)
    expect((await loadTodayData(A, opts)).lapsed).toBeNull()
    expect((await loadTodayData(B, opts)).lapsed?.name).toBe("Perdu 2")
    await pg.exec(`DELETE FROM bookings WHERE id = 9001`)
  })

  it("facture soldée par un avoir : plus à encaisser", async () => {
    await pg.exec(`INSERT INTO invoices(id, "companyId", "originalInvoiceId", "documentType", status, "totalCents") VALUES (9002, 1, 1003, 'credit_note', 'issued', 300)`)
    expect((await loadTodayData(A, opts)).unpaid.count).toBe(0)
    await pg.exec(`DELETE FROM invoices WHERE id = 9002`)
  })

  it("« aujourd'hui » et le mois suivent le fuseau de l'entreprise ; fuseau invalide toléré", async () => {
    const lateUtc = new Date("2026-11-30T23:30:00Z")
    expect((await loadTodayData(A, { ...opts, now: lateUtc })).figures?.monthStart).toBe("2026-12-01")
    expect((await loadTodayData(A, { ...opts, timezone: "America/Martinique", now: lateUtc })).today).toBe("2026-11-30")
    expect((await loadTodayData(A, { ...opts, timezone: "Pas/UnFuseau" })).today).toBe("2026-11-27")
  })

  it("table optionnelle absente (42P01) : second essai sans ces blocs, pas d'erreur", async () => {
    await pg.exec(`ALTER TABLE leads RENAME TO leads_absente`)
    try {
      const d = await loadTodayData(A, opts)
      expect(holder.calls).toBe(2)
      expect(d.leadsDue).toBe(0)
      expect(d.todayBookings).toHaveLength(1)
    } finally {
      await pg.exec(`ALTER TABLE leads_absente RENAME TO leads`)
    }
  })
})
