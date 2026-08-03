import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { and, eq, sql } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import { db, pool } from "@/lib/db"
import {
  companies,
  companyMembers,
  settings as settingsTable,
  businessHours,
  timeOff,
  vehicleTypes,
  serviceCategories,
  services,
  servicePrices,
  options,
  bookings,
  bookingItems,
  bookingItemOptions,
  invoices,
  invoiceItems,
  invoicePayments,
  invoiceEvents,
  user as userTable,
  account as accountTable,
  session as sessionTable,
} from "@/lib/db/schema"

/**
 * Test d'intégration : suppression DÉFINITIVE et complète d'une entreprise.
 *
 * On remplit une entreprise A dans TOUTES les tables liées (y compris les
 * petits-enfants sans FK), plus une entreprise B qui doit rester intacte, un
 * super-admin membre de A (à conserver) et un utilisateur partagé A+B (à
 * conserver). Après suppression, on vérifie qu'il ne reste AUCUNE donnée de A,
 * qu'aucun orphelin ne subsiste, et que l'isolation de B est respectée.
 */

// Blob mocké : on compte les suppressions sans appel réseau.
const delMock = vi.fn(async () => {})
vi.mock("@vercel/blob", () => ({
  del: (...args: unknown[]) => delMock(...(args as [])),
}))
vi.mock("next/cache", () => ({ revalidatePath: () => {} }))

const { deleteCompanyCompletely } = await import("@/lib/company/provision")

const RUN = Boolean(process.env.DATABASE_URL)
const d = RUN ? describe : describe.skip

const RUN_ID = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`
const SLUG_A = `test-del-a-${RUN_ID}`
const SLUG_B = `test-del-b-${RUN_ID}`

const ctx = {} as {
  aId: number
  bId: number
  uOwner: string // membre exclusif de A -> supprimé
  uSuper: string // super-admin membre de A -> conservé
  uShared: string // membre de A ET B -> conservé
  bookingId: number
  bookingItemId: number
  invoiceId: number
  serviceId: number
  vehicleTypeId: number
}

async function makeUser(name: string, superAdmin = false): Promise<string> {
  const id = randomUUID()
  await db.insert(userTable).values({
    id,
    name,
    email: `${name}-${RUN_ID}@example.com`,
    emailVerified: true,
    superAdmin,
  })
  await db.insert(accountTable).values({
    id: randomUUID(),
    accountId: id,
    providerId: "credential",
    userId: id,
    password: "x",
  })
  await db.insert(sessionTable).values({
    id: randomUUID(),
    token: `tok-${id}`,
    userId: id,
    expiresAt: new Date(Date.now() + 3600_000),
  })
  return id
}

beforeAll(async () => {
  if (!RUN) return
  await pool.query("DELETE FROM companies WHERE slug LIKE 'test-del-%'")

  // Entreprises A (à supprimer) et B (à conserver).
  const [a] = await db
    .insert(companies)
    .values({ name: "Entreprise Test A", slug: SLUG_A, status: "ACTIVE", logoUrl: "company-logo/a.png", faviconUrl: "company-logo/fav-a.png" })
    .returning({ id: companies.id })
  const [b] = await db
    .insert(companies)
    .values({ name: "Entreprise Test B", slug: SLUG_B, status: "ACTIVE" })
    .returning({ id: companies.id })
  ctx.aId = a.id
  ctx.bId = b.id

  // Utilisateurs.
  ctx.uOwner = await makeUser("owner")
  ctx.uSuper = await makeUser("super", true)
  ctx.uShared = await makeUser("shared")

  await db.insert(companyMembers).values([
    { companyId: ctx.aId, userId: ctx.uOwner, role: "OWNER" },
    { companyId: ctx.aId, userId: ctx.uSuper, role: "ADMIN" },
    { companyId: ctx.aId, userId: ctx.uShared, role: "EMPLOYEE" },
    { companyId: ctx.bId, userId: ctx.uShared, role: "OWNER" },
  ])

  // Réglages (avec logo de facture Blob), horaires, congés.
  await db.insert(settingsTable).values({ companyId: ctx.aId, businessName: "A", invoiceLogoPathname: "invoice-logo/a.png" })
  await db.insert(businessHours).values([
    { companyId: ctx.aId, dayOfWeek: 1, isOpen: true },
    { companyId: ctx.aId, dayOfWeek: 2, isOpen: true },
  ])
  await db.insert(timeOff).values({ companyId: ctx.aId, startDate: "2026-01-01", endDate: "2026-01-05", reason: "congés" })

  // Catalogue.
  const [vt] = await db.insert(vehicleTypes).values({ companyId: ctx.aId, name: "Berline", slug: "berline" }).returning({ id: vehicleTypes.id })
  const [cat] = await db.insert(serviceCategories).values({ companyId: ctx.aId, name: "Cat", slug: "cat" }).returning({ id: serviceCategories.id })
  const [svc] = await db
    .insert(services)
    .values({ companyId: ctx.aId, categoryId: cat.id, name: "Lavage", slug: "lavage", image: "https://blob.example/service-a.png" })
    .returning({ id: services.id })
  ctx.vehicleTypeId = vt.id
  ctx.serviceId = svc.id
  await db.insert(servicePrices).values({ serviceId: svc.id, vehicleTypeId: vt.id, priceCents: 5000, durationMin: 60 })
  await db.insert(options).values({ companyId: ctx.aId, name: "Cuir", slug: "cuir", priceCents: 2000 })

  // Réservation + ligne + option de ligne.
  const [bk] = await db
    .insert(bookings)
    .values({
      companyId: ctx.aId,
      reference: `TESTDEL-${RUN_ID}`,
      customerName: "Client",
      customerEmail: "c@example.com",
      customerPhone: "0600000000",
      address: "1 rue Test",
      date: "2026-02-01",
      startTime: "10:00",
      endTime: "11:00",
    })
    .returning({ id: bookings.id })
  ctx.bookingId = bk.id
  const [bi] = await db
    .insert(bookingItems)
    .values({ bookingId: bk.id, serviceName: "Lavage", vehicleTypeName: "Berline", priceCents: 5000 })
    .returning({ id: bookingItems.id })
  ctx.bookingItemId = bi.id
  await db.insert(bookingItemOptions).values({ bookingItemId: bi.id, optionName: "Cuir", priceCents: 2000 })

  // Facture + lignes + paiement + événement (avec pathnames Blob).
  const [inv] = await db
    .insert(invoices)
    .values({
      companyId: ctx.aId,
      bookingId: bk.id,
      number: `FAC-${RUN_ID}`,
      status: "issued",
      customerName: "Client",
      issuerLogoPathname: "invoice-logo/issuer-a.png",
      pdfPathname: "invoices/a.pdf",
    })
    .returning({ id: invoices.id })
  ctx.invoiceId = inv.id
  await db.insert(invoiceItems).values({ invoiceId: inv.id, label: "Lavage", unitPriceCents: 5000 })
  await db.insert(invoicePayments).values({ invoiceId: inv.id, amountCents: 5000, method: "transfer", paidAt: "2026-02-02" })
  await db.insert(invoiceEvents).values({ invoiceId: inv.id, type: "issued", message: "émise" })
})

afterAll(async () => {
  if (!RUN) return
  // Nettoyage défensif (au cas où le test échoue avant la suppression).
  await pool.query("DELETE FROM companies WHERE slug LIKE 'test-del-%'")
  for (const uid of [ctx.uOwner, ctx.uSuper, ctx.uShared]) {
    if (uid) await db.delete(userTable).where(eq(userTable.id, uid))
  }
  await pool.end()
})

async function countWhere(table: string, column: string, value: number): Promise<number> {
  const res = await pool.query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE "${column}" = $1`, [value])
  return res.rows[0].n as number
}

d("Suppression définitive d'une entreprise", () => {
  it("supprime toutes les données liées, sans orphelin, et préserve l'isolation", async () => {
    const result = await deleteCompanyCompletely(ctx.aId)

    // Résultat renvoyé.
    expect(result.slug).toBe(SLUG_A)
    expect(result.deletedUsers).toBe(1) // seul l'owner exclusif est supprimé

    // 1) L'entreprise A n'existe plus.
    const aRows = await db.select({ id: companies.id }).from(companies).where(eq(companies.id, ctx.aId))
    expect(aRows.length).toBe(0)

    // 2) Aucune donnée enfant scopée companyId.
    for (const t of [
      "settings",
      "business_hours",
      "time_off",
      "vehicle_types",
      "service_categories",
      "services",
      "options",
      "bookings",
      "invoices",
      "company_members",
    ]) {
      expect(await countWhere(t, "companyId", ctx.aId), `${t} orphelin`).toBe(0)
    }

    // 3) Petits-enfants sans FK : aucun orphelin.
    const bio = await db.select().from(bookingItemOptions).where(eq(bookingItemOptions.bookingItemId, ctx.bookingItemId))
    const bi = await db.select().from(bookingItems).where(eq(bookingItems.bookingId, ctx.bookingId))
    const ii = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, ctx.invoiceId))
    const ip = await db.select().from(invoicePayments).where(eq(invoicePayments.invoiceId, ctx.invoiceId))
    const ie = await db.select().from(invoiceEvents).where(eq(invoiceEvents.invoiceId, ctx.invoiceId))
    const sp = await db
      .select()
      .from(servicePrices)
      .where(sql`${servicePrices.serviceId} = ${ctx.serviceId} OR ${servicePrices.vehicleTypeId} = ${ctx.vehicleTypeId}`)
    expect(bio.length, "booking_item_options orphelin").toBe(0)
    expect(bi.length, "booking_items orphelin").toBe(0)
    expect(ii.length, "invoice_items orphelin").toBe(0)
    expect(ip.length, "invoice_payments orphelin").toBe(0)
    expect(ie.length, "invoice_events orphelin").toBe(0)
    expect(sp.length, "service_prices orphelin").toBe(0)

    // 4) Utilisateur exclusif supprimé (+ account + session en cascade).
    const owner = await db.select().from(userTable).where(eq(userTable.id, ctx.uOwner))
    const ownerAcc = await db.select().from(accountTable).where(eq(accountTable.userId, ctx.uOwner))
    const ownerSess = await db.select().from(sessionTable).where(eq(sessionTable.userId, ctx.uOwner))
    expect(owner.length, "owner supprimé").toBe(0)
    expect(ownerAcc.length, "account owner supprimé").toBe(0)
    expect(ownerSess.length, "session owner supprimée").toBe(0)

    // 5) Super-admin et utilisateur partagé conservés.
    const superRow = await db.select().from(userTable).where(eq(userTable.id, ctx.uSuper))
    const sharedRow = await db.select().from(userTable).where(eq(userTable.id, ctx.uShared))
    expect(superRow.length, "super-admin conservé").toBe(1)
    expect(sharedRow.length, "utilisateur partagé conservé").toBe(1)

    // 6) Entreprise B intacte + appartenance de l'utilisateur partagé conservée.
    const bRow = await db.select({ id: companies.id }).from(companies).where(eq(companies.id, ctx.bId))
    const bMember = await db
      .select()
      .from(companyMembers)
      .where(and(eq(companyMembers.companyId, ctx.bId), eq(companyMembers.userId, ctx.uShared)))
    expect(bRow.length, "entreprise B intacte").toBe(1)
    expect(bMember.length, "membre B conservé").toBe(1)

    // 7) Fichiers Blob : 6 cibles supprimées (logo, favicon, logo facture,
    //    logo émetteur, PDF facture, image de prestation publique).
    expect(delMock).toHaveBeenCalledTimes(6)
    const deleted = delMock.mock.calls.map((c) => c[0])
    for (const target of [
      "company-logo/a.png",
      "company-logo/fav-a.png",
      "invoice-logo/a.png",
      "invoice-logo/issuer-a.png",
      "invoices/a.pdf",
      "https://blob.example/service-a.png",
    ]) {
      expect(deleted, `Blob supprimé: ${target}`).toContain(target)
    }
  })
})
