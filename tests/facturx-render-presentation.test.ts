import { describe, it, expect } from "vitest"
import { writeFileSync } from "node:fs"
import { PDFDocument } from "pdf-lib"
import { extract } from "@stafyniaksacha/facturx"
import { input } from "./facturx-template-fixture"
import { buildFacturXXml } from "@/lib/invoice/facturx/xml"
import { buildFacturXPresentation } from "@/lib/invoice/facturx-presentation"
import { renderFacturXPrototypePdf } from "@/lib/invoice/facturx-visual-core"

const logo = "data:image/png;base64," +
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1Pe" +
  "AAAADElEQVR4nGMQ03ABAADaAIN27p+ZAAAAAElFTkSuQmCC"

describe("PDF Business Pro avec presentation", () => {
  it("genere le PDF et conserve le XML", async () => {
    const presentation = buildFacturXPresentation({
      issuerPhone: "0102030405",
      customerPhone: "0607080910",
      vehicleTypeName: "Voiture",
      vehicleBrand: "Porsche",
      vehicleModel: "911",
      vehiclePlate: "AA-123-BB",
      footerNote: "Merci pour votre confiance",
      legalMentions: "Mentions legales de demonstration",
    }, logo)

    const pdf = await renderFacturXPrototypePdf(input, {
      template: "business_pro",
      presentation,
    })

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-")

    const document = await PDFDocument.load(pdf)
    expect(document.getPageCount()).toBeGreaterThan(0)

    const expected = buildFacturXXml(input)
    if (!expected.ok) throw new Error("XML invalide")

    const extracted = await extract({ pdf })
    const normalize = (s: string) =>
      s.replace(/<\?xml[^>]*\?>/i, "").trim()

    expect(normalize(Buffer.from(extracted.xml).toString("utf8")))
      .toBe(normalize(expected.xml))

    if (process.env.FACTURX_C4_PREVIEW) {
      writeFileSync(process.env.FACTURX_C4_PREVIEW, pdf)
    }
  }, 30000)
})
