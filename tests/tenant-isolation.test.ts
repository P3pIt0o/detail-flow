import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { and, eq } from "drizzle-orm"
import { db, pool } from "@/lib/db"
import {
  companies,
  serviceCategories,
  services,
  vehicleTypes,
  bookings,
  invoices,
  settings as settingsTable,
} from "@/lib/db/schema"
import { getAdminServices, getPriceMatrix } from "@/lib/admin/catalog-queries"
import { getBookingDetail } from "@/lib/admin/queries"
import { getInvoiceDetail, getInvoiceList } from "@/lib/invoice/queries"
import { buildCompanyExport } from "@/lib/export/build"

/**
 * Tests d'ISOLATION MULTI-TENANT (safeguard critique).
 *
 * On crée deux entreprises jetables (A et B), on y insère des données, puis on
 * vérifie qu'aucune requête scopée par `companyId` ne laisse fuiter les données
 * d'une entreprise vers l'autre. Toutes les données de test sont marquées par un
 * slug préfixé `test-iso-` et supprimées en fin de suite.
 */

const RUN = Boolean(process.env.DATABASE_URL)
const d = RUN ? describe : describe.skip

// Suffixe unique par exécution pour éviter les collisions de slug si un run
// précédent s'est interrompu avant le nettoyage.
const RUN_ID = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`
const SLUG_A = `test-iso-a-${RUN_ID}`
const SLUG_B = `test-iso-b-${RUN_ID}`

type Ctx = { aId: number; bId: number; aServiceId: number; bServiceId: number; aInvoiceId: number; bInvoiceId: number }
const ctx = {} as Ctx

async function seedCompany(slug: string) {
  const [c] = await db
    .insert(companies)
    .values({ name: slug, slug, status: "ACTIVE" })
    .returning({ id: companies.id })
  const companyId = c.id

  await db.insert(settingsTable).values({ companyId, businessName: `${slug} SARL` })
  const [cat] = await db
    .insert(serviceCategories)
    .values({ companyId, name: "Cat", slug: `${slug}-cat` })
    .returning({ id: serviceCategories.id })
  const [svc] = await db
    .insert(services)
    .values({ companyId, categoryId: cat.id, name: "Lavage", slug: `${slug}-lavage`, basePriceCents: 5000, durationMin: 60 })
    .returning({ id: services.id })
  const [vt] = await db
    .insert(vehicleTypes)
    .values({ companyId, name: "Berline", slug: `${slug}-berline` })
    .returning({ id: vehicleTypes.id })
  const [inv] = await db
    .insert(invoices)
    .values({
      companyId,
      number: `${slug}-F001`,
      status: "draft",
      customerName: `Client ${slug}`,
      itemsTotalCents: 5000,
      netCents: 5000,
      totalCents: 5000,
      balanceCents: 5000,
    })
    .returning({ id: invoices.id })

  return { companyId, serviceId: svc.id, vehicleTypeId: vt.id, invoiceId: inv.id }
}

beforeAll(async () => {
  if (!RUN) return
  // Nettoyage défensif d'éventuels résidus de runs interrompus.
  await pool.query("DELETE FROM companies WHERE slug LIKE 'test-iso-%'")
  const a = await seedCompany(SLUG_A)
  const b = await seedCompany(SLUG_B)
  ctx.aId = a.companyId
  ctx.bId = b.companyId
  ctx.aServiceId = a.serviceId
  ctx.bServiceId = b.serviceId
  ctx.aInvoiceId = a.invoiceId
  ctx.bInvoiceId = b.invoiceId
})

afterAll(async () => {
  if (!RUN) return
  // Suppression en cascade via FK (companies ON DELETE CASCADE).
  if (ctx.aId) await db.delete(companies).where(eq(companies.id, ctx.aId))
  if (ctx.bId) await db.delete(companies).where(eq(companies.id, ctx.bId))
  await pool.end()
})

d("Isolation des données entre entreprises", () => {
  it("les prestations de A n'incluent jamais celles de B", async () => {
    const aServices = await getAdminServices(ctx.aId)
    const bServices = await getAdminServices(ctx.bId)
    expect(aServices.some((s) => s.id === ctx.aServiceId)).toBe(true)
    expect(aServices.some((s) => s.id === ctx.bServiceId)).toBe(false)
    expect(bServices.some((s) => s.id === ctx.aServiceId)).toBe(false)
  })

  it("la grille tarifaire est isolée par entreprise (jointure sur services)", async () => {
    const matrix = await getPriceMatrix(ctx.aId)
    // Aucune cellule ne doit référencer une prestation de B.
    expect(matrix.every((cell) => cell.serviceId !== ctx.bServiceId)).toBe(true)
  })

  it("la liste des factures de A n'expose pas les factures de B", async () => {
    const list = await getInvoiceList(ctx.aId)
    expect(list.some((i) => i.id === ctx.aInvoiceId)).toBe(true)
    expect(list.some((i) => i.id === ctx.bInvoiceId)).toBe(false)
  })
})

d("Accès inter-tenant à une ressource par id", () => {
  it("récupérer la facture de B avec le companyId de A renvoie null", async () => {
    const asOwner = await getInvoiceDetail(ctx.bInvoiceId, ctx.bId)
    expect(asOwner?.invoice.id).toBe(ctx.bInvoiceId)

    const crossTenant = await getInvoiceDetail(ctx.bInvoiceId, ctx.aId)
    expect(crossTenant).toBeNull()
  })
})

d("Validation de propriété d'une réservation", () => {
  it("une réservation insérée pour A n'est visible que via le companyId de A", async () => {
    const [bk] = await db
      .insert(bookings)
      .values({
        companyId: ctx.aId,
        reference: "TEST-ISO-BK-A",
        customerName: "Client A",
        customerEmail: "a@test.local",
        customerPhone: "0600000000",
        address: "1 rue du test, 75000 Paris",
        date: "2999-01-01",
        startTime: "10:00",
        endTime: "11:00",
        totalDurationMin: 60,
        subtotalCents: 5000,
        totalCents: 5000,
        status: "pending",
        isDemoData: true,
      })
      .returning({ id: bookings.id })

    const fromA = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.id, bk.id), eq(bookings.companyId, ctx.aId)))
    expect(fromA).toHaveLength(1)

    const fromB = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.id, bk.id), eq(bookings.companyId, ctx.bId)))
    expect(fromB).toHaveLength(0)

    // Reproduction du bug 404 : getBookingDetail() est le helper appelé par la
    // page de détail. Le tenant courant est résolu côté serveur (companyId),
    // jamais depuis le navigateur. Avec le companyId de A, la réservation est
    // trouvée ; avec celui de B, elle ne l'est pas (déclencheur légitime du 404).
    const detailA = await getBookingDetail(bk.id, ctx.aId)
    expect(detailA?.booking.id).toBe(bk.id)

    const detailB = await getBookingDetail(bk.id, ctx.bId)
    expect(detailB).toBeNull()
  })
})

d("Sécurité de l'export : aucune donnée d'authentification", () => {
  it("l'export d'une entreprise ne contient que ses propres données et aucun secret", async () => {
    const bundle = await buildCompanyExport(ctx.aId)
    const serialized = JSON.stringify(bundle).toLowerCase()

    // Ne doit jamais contenir de champs/tables d'authentification ou de secrets.
    for (const forbidden of ["password", "passwordhash", '"session"', "accesstoken", "bettersecret", "better_auth", "apikey"]) {
      expect(serialized.includes(forbidden)).toBe(false)
    }

    // Doit être scopé : aucune référence à la facture de l'entreprise B.
    expect(serialized.includes(`${SLUG_B}-f001`)).toBe(false)
    expect(serialized.includes(`${SLUG_A}-f001`)).toBe(true)
  })
})
