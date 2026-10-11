import { describe, it, expect } from "vitest"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { PDFDocument } from "pdf-lib"
import { extract } from "@stafyniaksacha/facturx"
import { buildFacturXXml } from "@/lib/invoice/facturx/xml"
import { renderFacturXPrototypePdf } from "@/lib/invoice/facturx-visual-core"
import { input } from "./facturx-template-fixture"
import type { InvoiceTemplate } from "@/lib/invoice/template-policy"

const templates: InvoiceTemplate[] = [
  "basic",
  "business_pro",
  "signature_premium",
]

const normalize = (s: string) =>
  s.replace(/<\?xml[^>]*\?>/i, "").trim()

describe("C3 - trois presentations Factur-X", () => {
  for (const template of templates) {
    it(template + " : PDF avec XML identique", async () => {
      const expected = buildFacturXXml(input)
      if (!expected.ok) throw new Error("XML invalide")

      const pdf = await renderFacturXPrototypePdf(
        input, { template }
      )

      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-")

      const doc = await PDFDocument.load(pdf)
      expect(doc.getPageCount()).toBeGreaterThan(0)

      const extracted = await extract({ pdf })
      expect(normalize(Buffer.from(extracted.xml).toString("utf8")))
        .toBe(normalize(expected.xml))

      const outputDir = process.env.FACTURX_C3_OUTPUT_DIR
      if (outputDir) {
        writeFileSync(
          join(outputDir, "detailflow-c3-" + template + ".pdf"),
          pdf
        )
      }
    }, 30000)
  }

  it("refuse un modele inconnu", async () => {
    await expect(
      renderFacturXPrototypePdf(input, {
        template: "inconnu" as InvoiceTemplate,
      })
    ).rejects.toThrow("FACTURX_TEMPLATE_INVALID")
  })
})
