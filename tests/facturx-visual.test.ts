import { describe, it, expect } from "vitest"
import { writeFileSync } from "node:fs"
import { extract } from "@stafyniaksacha/facturx"
import { buildFacturXXml } from "@/lib/invoice/facturx/xml"
import { renderFacturXPrototypePdf } from "@/lib/invoice/facturx-visual-core"
import type { BuildFacturXXmlInput } from "@/lib/invoice/facturx/types"

const input: BuildFacturXXmlInput = {
  invoice: {
    number: "FAC-2026-0042",
    status: "issued",
    documentType: "invoice",
    originalInvoiceId: null,
    creditReason: null,
    currencyCode: "EUR",
    issueDate: "2026-10-09",
    dueDate: "2026-11-08",
    serviceDate: "2026-10-08",
    customerName: "Garage Martin SAS",
    customerEmail: "compta@garage-martin.example",
    customerAddress: "12 rue des Lilas, 74000 Annecy",
    customerType: "business",
    customerCountry: "FR",
    customerLegalRegistrationNumber: "98765432100011",
    customerLegalRegistrationScheme: "FR_SIRET",
    customerVatNumber: "FR98987654321",
    customerComment: null,
    issuerName: "Detailing Pro SARL",
    issuerEmail: "contact@detailing-pro.example",
    issuerAddress: "5 avenue du Lac, 74000 Annecy",
    issuerIban: "FR7630006000011234567890189",
    issuerBic: "AGRIFRPP",
    issuerCountry: "FR",
    issuerLegalRegistrationNumber: "12345678900012",
    issuerLegalRegistrationScheme: "FR_SIRET",
    issuerVatNumber: "FR12123456789",
    vatEnabled: true,
    vatRate: "20",
    taxTreatment: "STANDARD",
    taxLegalMention: null,
    itemsTotalCents: 15000,
    discountCents: 0,
    netCents: 15000,
    vatCents: 3000,
    totalCents: 18000,
    depositCents: 3000,
    paidCents: 0,
    balanceCents: 15000,
  },
  items: [
    {
      kind: "service",
      label: "Lavage intérieur complet",
      description: "Aspiration + shampoing sièges",
      quantity: 1,
      unitPriceCents: 10000,
      sortOrder: 0,
    },
    {
      kind: "option",
      label: "Traitement plastiques",
      description: null,
      quantity: 2,
      unitPriceCents: 2500,
      sortOrder: 1,
    },
  ],
}

describe("Factur-X C2 - PDF visuel fictif", () => {
  it("génère un PDF et conserve le XML exact", async () => {
    const result = buildFacturXXml(input)

    if (!result.ok) {
      throw new Error(JSON.stringify(result.errors))
    }

    const pdf = await renderFacturXPrototypePdf(input)

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-")

    const extracted = await extract({ pdf })
    const embeddedXml = Buffer.from(extracted.xml)
      .toString("utf8")

    const normalize = (xml: string) =>
      xml.replace(/<\?xml[^>]*\?>/i, "").trim()

    expect(normalize(embeddedXml))
      .toBe(normalize(result.xml))

    expect(result.xml).toContain("FAC-2026-0042")
    expect(result.xml).toContain("180.00")
    expect(result.xml).toContain("150.00")

    const { check } = await import("@stafyniaksacha/facturx")
    const validation = await check({
      xml: embeddedXml,
      schematron: true,
    })
    expect(validation.valid).toBe(true)
    expect(validation.schematronValid).toBe(true)


    if (process.env.FACTURX_C2_OUTPUT) {
      writeFileSync(process.env.FACTURX_C2_OUTPUT, pdf)
    }
  }, 30000)

  it("refuse une facture dont le total est faux", async () => {
    await expect(
      renderFacturXPrototypePdf({
        ...input,
        invoice: {
          ...input.invoice,
          totalCents: 18001,
        },
      })
    ).rejects.toThrow("FACTURX_INVALID_SNAPSHOT")
  })

  it("Factur-X C3 - facture longue de 40 prestations", async () => {
    const items = Array.from({ length: 40 }, (_, i) => ({
      ...input.items[0],
      label: "Prestation detailing " + String(i + 1).padStart(2, "0"),
      description: "Nettoyage complet et preparation du vehicule",
      quantity: 1,
      unitPriceCents: 10000,
      sortOrder: i,
    }))

    const data: BuildFacturXXmlInput = {
      invoice: {
        ...input.invoice,
        number: "FAC-C3-LONGUE",
        itemsTotalCents: 400000,
        netCents: 400000,
        vatCents: 80000,
        totalCents: 480000,
        balanceCents: 477000,
      },
      items,
    }

    const pdf = await renderFacturXPrototypePdf(data)
    const { PDFDocument } = await import("pdf-lib")
    const doc = await PDFDocument.load(pdf)

    expect(doc.getPageCount()).toBeGreaterThan(1)

    const extracted = await extract({ pdf })
    const xml = Buffer.from(extracted.xml).toString("utf8")

    expect(
      (xml.match(/<ram:IncludedSupplyChainTradeLineItem>/g) ?? []).length
    ).toBe(40)

    if (process.env.FACTURX_C3_LONG_OUTPUT) {
      writeFileSync(process.env.FACTURX_C3_LONG_OUTPUT, pdf)
    }
  }, 30000)

  it("Factur-X C3 - remise de 15 euros", async () => {
    const data: BuildFacturXXmlInput = {
      ...input,
      invoice: {
        ...input.invoice,
        number: "FAC-C3-REMISE",
        discountCents: 1500,
        netCents: 13500,
        vatCents: 2700,
        totalCents: 16200,
        balanceCents: 13200,
      },
    }

    const pdf = await renderFacturXPrototypePdf(data)
    const extracted = await extract({ pdf })
    const xml = Buffer.from(extracted.xml).toString("utf8")

    const { check } = await import("@stafyniaksacha/facturx")
    const validation = await check({
      xml,
      schematron: true,
    })

    expect(validation.valid).toBe(true)
    expect(validation.schematronValid).toBe(true)

    if (process.env.FACTURX_C3_DISCOUNT_OUTPUT) {
      writeFileSync(process.env.FACTURX_C3_DISCOUNT_OUTPUT, pdf)
    }
  }, 30000)
})
