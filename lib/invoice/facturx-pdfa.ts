import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { PDFDocument, PDFName, PDFString } from "pdf-lib"
import { generate } from "@stafyniaksacha/facturx"

/**
 * Encapsule un XML Factur-X dans un PDF source.
 * Le PDF source doit deja utiliser des polices incorporees.
 * Aucune DB, aucun reseau, aucune modification de facture.
 * La conformite PDF/A doit etre verifiee sur le resultat.
 */
export async function embedFacturXXmlInPdf(input: {
  sourcePdf: Uint8Array
  xml: string
}): Promise<Buffer> {
  const { sourcePdf, xml } = input

  if (
    Buffer.from(sourcePdf).subarray(0, 5).toString() !== "%PDF-" ||
    !xml.includes("<rsm:CrossIndustryInvoice")
  ) {
    throw new Error("PDF ou XML Factur-X invalide")
  }

  const workingPdf = await PDFDocument.load(sourcePdf)
  workingPdf.context.trailerInfo.ID = undefined

  const icc = readFileSync(
    resolve(process.cwd(), "public/facturx-assets/sRGB-v2-magic.icc")
  )

  const profile = workingPdf.context.register(
    workingPdf.context.stream(icc, {
      N: 3,
      Length: icc.length,
    })
  )

  const intent = workingPdf.context.register(
    workingPdf.context.obj({
      Type: "OutputIntent",
      S: "GTS_PDFA1",
      OutputConditionIdentifier: PDFString.of("sRGB"),
      DestOutputProfile: profile,
    })
  )

  workingPdf.catalog.set(
    PDFName.of("OutputIntents"),
    workingPdf.context.obj([intent])
  )

  const result = await generate({ pdf: workingPdf, xml })
  return Buffer.from(result)
}
