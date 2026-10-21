import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * L20 (décision D-L20-2) — une facture créée depuis une réservation reflète
 * EXACTEMENT la remise réservée (code promo et offres automatiques), avec et
 * sans TVA. Avant L20 : remise toujours à 0 (prix catalogue facturé).
 * Vrai calcul de facture (computeInvoice) ; base et session simulées.
 */
vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ revalidatePath: () => {} }))

const { st, written } = vi.hoisted(() => ({
  st: {
    booking: {} as Record<string, unknown>,
    vat: { vatEnabled: false, vatRate: "0" },
  },
  written: { invoice: null as null | Record<string, unknown>, lines: [] as Record<string, unknown>[] },
}))

vi.mock("drizzle-orm", () => ({ and: () => ({}), eq: () => ({}), gte: () => ({}), inArray: () => ({}), sql: () => ({}) }))
vi.mock("@/lib/db/schema", () => {
  const t = (n: string) => ({ __t: n, id: `${n}.id`, bookingId: `${n}.bookingId`, companyId: `${n}.companyId`, bookingItemId: `${n}.bookingItemId`, documentType: `${n}.documentType`, createdAt: `${n}.createdAt` })
  return {
    invoices: t("invoices"), invoiceItems: t("invoice_items"), invoicePayments: t("invoice_payments"), invoiceEvents: t("invoice_events"),
    bookings: t("bookings"), bookingItems: t("booking_items"), bookingItemOptions: t("booking_item_options"), companies: t("companies"), settings: t("settings"),
  }
})
vi.mock("@/lib/db", () => {
  const rowsFor = (table: string, fields?: Record<string, unknown>): unknown[] => {
    if (table === "bookings") return [st.booking]
    if (table === "invoices") return fields && "count" in fields ? [{ count: 0 }] : []
    if (table === "settings") return [{ ...st.vat, billingProfileConfirmedAt: null, defaultCurrency: "EUR" }]
    if (table === "booking_items") return [
      { id: 1, serviceName: "Lavage extérieur", vehicleTypeName: "Citadine", priceCents: 3000 },
      { id: 2, serviceName: "Lavage intérieur", vehicleTypeName: "Citadine", priceCents: 4000 },
    ]
    if (table === "booking_item_options") return [{ bookingItemId: 1, optionName: "Phares", priceCents: 5000 }]
    return []
  }
  const where = (rows: unknown[]) => Object.assign(Promise.resolve(rows), { limit: async () => rows })
  const select = (fields?: Record<string, unknown>) => ({ from: (t: { __t: string }) => ({ where: () => where(rowsFor(t.__t, fields)) }) })
  const insert = (t: { __t: string }) => ({
    values: (v: unknown) => {
      if (t.__t === "invoices") written.invoice = v as Record<string, unknown>
      if (t.__t === "invoice_items") written.lines = v as Record<string, unknown>[]
      return Object.assign(Promise.resolve(), { returning: async () => [{ id: 1 }] })
    },
  })
  return { db: { select, insert, transaction: async (cb: (tx: unknown) => unknown) => cb({ insert }) } }
})
vi.mock("@/lib/admin", () => ({ requireCompanyMember: async () => ({ tenant: { id: 104 }, role: "OWNER" }) }))
vi.mock("@/lib/licensing/enforce", () => ({ canCreateWithinLimit: async () => true, LIMIT_REACHED_MESSAGE: "" }))
vi.mock("@/lib/billing/country-profiles", () => ({ getCountryProfile: () => ({}), resolveIssuerBillingSnapshot: () => ({}), resolveDraftCurrency: () => "EUR" }))

import { createInvoiceFromBooking } from "@/lib/invoice/actions"

const base = { id: 7, companyId: 104, status: "completed", reference: "DF-1", customerName: "C", customerEmail: "c@x.fr", customerPhone: "06", address: "A", date: "2026-11-12", depositCents: 0, billedDistanceKm: "0" }

beforeEach(() => {
  written.invoice = null
  written.lines = []
  st.vat = { vatEnabled: false, vatRate: "0" }
})

describe("L20 — facture depuis une réservation remisée", () => {
  it("sans TVA : remise reprise, total facturé = total réservé", async () => {
    st.booking = { ...base, travelFeeCents: 0, discountCents: 700, totalCents: 11300 }
    expect(await createInvoiceFromBooking(7)).toMatchObject({ ok: true })
    expect(written.invoice).toMatchObject({ itemsTotalCents: 12000, discountCents: 700, netCents: 11300, vatCents: 0, totalCents: 11300 })
  })
  it("avec TVA 20 % : remise appliquée AVANT la TVA", async () => {
    st.vat = { vatEnabled: true, vatRate: "20" }
    st.booking = { ...base, travelFeeCents: 0, discountCents: 700, totalCents: 11300 }
    await createInvoiceFromBooking(7)
    expect(written.invoice).toMatchObject({ itemsTotalCents: 12000, discountCents: 700, netCents: 11300, vatCents: 2260, totalCents: 13560 })
  })
  it("code promo et déplacement : le déplacement reste facturé en entier", async () => {
    st.booking = { ...base, travelFeeCents: 1500, billedDistanceKm: "12", discountCents: 1000, totalCents: 12500 }
    await createInvoiceFromBooking(7)
    expect(written.invoice).toMatchObject({ itemsTotalCents: 13500, discountCents: 1000, totalCents: 12500 })
    expect(written.lines.map((l) => l.kind)).toEqual(["service", "option", "service", "travel"])
  })
  it("remise incohérente (supérieure aux prestations) : plafonnée aux prestations et options, jamais au déplacement", async () => {
    st.booking = { ...base, travelFeeCents: 1500, billedDistanceKm: "12", discountCents: 99999, totalCents: 1500 }
    await createInvoiceFromBooking(7)
    expect(written.invoice).toMatchObject({ discountCents: 12000, totalCents: 1500 })
  })
  it("réservation sans remise : facture inchangée", async () => {
    st.booking = { ...base, travelFeeCents: 0, discountCents: 0, totalCents: 12000 }
    await createInvoiceFromBooking(7)
    expect(written.invoice).toMatchObject({ discountCents: 0, totalCents: 12000 })
  })
})
