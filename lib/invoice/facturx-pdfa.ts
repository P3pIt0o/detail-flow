import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHeader,
  PDFHexString,
  PDFName,
  PDFRawStream,
  PDFStream,
  PDFString,
  decodePDFRawStream,
} from "pdf-lib"

/**
 * Assemblage PDF/A-3b + Factur-X (profil EN 16931) avec pdf-lib seul.
 * Le PDF source doit déjà utiliser des polices incorporées (modèle pdf.tsx en Lato).
 * Aucune DB, aucun réseau, aucune modification de facture.
 * La conformité PDF/A-3b officielle (veraPDF) doit être vérifiée en externe sur Preview.
 */

export const FACTURX_FILENAME = "factur-x.xml"
const FX_NS = "urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#"
const FX_CONFORMANCE_LEVEL = "EN 16931"
const PRODUCER = "DetailFlow"

function escapeXmp(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

/** Date XMP en UTC sans millisecondes (même instant que l'Info du PDF). */
function xmpDate(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z")
}

function fxProperty(name: string, description: string): string {
  return `<rdf:li rdf:parseType="Resource">
<pdfaProperty:name>${name}</pdfaProperty:name>
<pdfaProperty:valueType>Text</pdfaProperty:valueType>
<pdfaProperty:category>external</pdfaProperty:category>
<pdfaProperty:description>${description}</pdfaProperty:description>
</rdf:li>`
}

export function buildFacturXXmp(input: { title: string; date: Date }): string {
  const title = escapeXmp(input.title)
  const date = xmpDate(input.date)
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
<pdfaid:part>3</pdfaid:part>
<pdfaid:conformance>B</pdfaid:conformance>
</rdf:Description>
<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:format>application/pdf</dc:format>
<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${title}</rdf:li></rdf:Alt></dc:title>
</rdf:Description>
<rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
<pdf:Producer>${PRODUCER}</pdf:Producer>
</rdf:Description>
<rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
<xmp:CreatorTool>${PRODUCER}</xmp:CreatorTool>
<xmp:CreateDate>${date}</xmp:CreateDate>
<xmp:ModifyDate>${date}</xmp:ModifyDate>
<xmp:MetadataDate>${date}</xmp:MetadataDate>
</rdf:Description>
<rdf:Description rdf:about="" xmlns:fx="${FX_NS}">
<fx:DocumentType>INVOICE</fx:DocumentType>
<fx:DocumentFileName>${FACTURX_FILENAME}</fx:DocumentFileName>
<fx:Version>1.0</fx:Version>
<fx:ConformanceLevel>${FX_CONFORMANCE_LEVEL}</fx:ConformanceLevel>
</rdf:Description>
<rdf:Description rdf:about="" xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
<pdfaExtension:schemas>
<rdf:Bag>
<rdf:li rdf:parseType="Resource">
<pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
<pdfaSchema:namespaceURI>${FX_NS}</pdfaSchema:namespaceURI>
<pdfaSchema:prefix>fx</pdfaSchema:prefix>
<pdfaSchema:property>
<rdf:Seq>
${fxProperty("DocumentFileName", "name of the embedded XML invoice file")}
${fxProperty("DocumentType", "INVOICE")}
${fxProperty("Version", "The actual version of the Factur-X XML schema")}
${fxProperty("ConformanceLevel", "The conformance level of the embedded Factur-X data")}
</rdf:Seq>
</pdfaSchema:property>
</rdf:li>
</rdf:Bag>
</pdfaExtension:schemas>
</rdf:Description>
</rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`
}

function streamText(stream: PDFStream): string {
  const bytes = stream instanceof PDFRawStream ? decodePDFRawStream(stream).decode() : stream.getContents()
  return Buffer.from(bytes).toString("utf8")
}

export async function embedFacturXXmlInPdf(input: {
  sourcePdf: Uint8Array
  xml: string
  /** Titre du document (numéro de facture). */
  title?: string
  /** Horodatage injectable pour les tests. */
  now?: Date
}): Promise<Buffer> {
  const { sourcePdf, xml } = input
  const now = input.now ?? new Date()
  const title = input.title ?? "Facture"

  if (
    Buffer.from(sourcePdf).subarray(0, 5).toString() !== "%PDF-" ||
    !xml.includes("<rsm:CrossIndustryInvoice")
  ) {
    throw new Error("FACTURX_INVALID_INPUT")
  }

  const doc = await PDFDocument.load(sourcePdf, { updateMetadata: false })
  const ctx = doc.context
  if (doc.isEncrypted) throw new Error("FACTURX_INVALID_INPUT")

  // Fichiers associés : PDF 1.7 (base de PDF/A-3).
  ctx.header = PDFHeader.forVersion(1, 7)

  // 1. Fichier associé factur-x.xml.
  const xmlBytes = Buffer.from(xml, "utf8")
  const embedded = ctx.register(
    ctx.stream(xmlBytes, {
      Type: "EmbeddedFile",
      Subtype: "text/xml",
      Params: { ModDate: PDFString.fromDate(now), Size: xmlBytes.length },
    })
  )
  const fileSpec = ctx.register(
    ctx.obj({
      Type: "Filespec",
      F: PDFString.of(FACTURX_FILENAME),
      UF: PDFHexString.fromText(FACTURX_FILENAME),
      Desc: PDFString.of("Factur-X"),
      AFRelationship: "Alternative",
      EF: { F: embedded, UF: embedded },
    })
  )

  let names = doc.catalog.lookupMaybe(PDFName.of("Names"), PDFDict)
  if (!names) {
    names = ctx.obj({})
    doc.catalog.set(PDFName.of("Names"), names)
  }
  if (names.has(PDFName.of("EmbeddedFiles"))) throw new Error("FACTURX_ALREADY_EMBEDDED")
  names.set(PDFName.of("EmbeddedFiles"), ctx.obj({ Names: [PDFString.of(FACTURX_FILENAME), fileSpec] }))
  doc.catalog.set(PDFName.of("AF"), ctx.obj([fileSpec]))

  // 2. Profil couleur sRGB (OutputIntent PDF/A).
  const icc = readFileSync(resolve(process.cwd(), "public/facturx-assets/sRGB-v2-magic.icc"))
  const profile = ctx.register(ctx.stream(icc, { N: 3 }))
  const intent = ctx.register(
    ctx.obj({
      Type: "OutputIntent",
      S: "GTS_PDFA1",
      OutputConditionIdentifier: PDFString.of("sRGB"),
      Info: PDFString.of("sRGB IEC61966-2.1"),
      DestOutputProfile: profile,
    })
  )
  doc.catalog.set(PDFName.of("OutputIntents"), ctx.obj([intent]))

  // 3. Info (remplacé en entier) et XMP cohérents.
  ctx.trailerInfo.Info = ctx.register(ctx.obj({}))
  doc.setTitle(title)
  doc.setProducer(PRODUCER)
  doc.setCreator(PRODUCER)
  doc.setCreationDate(now)
  doc.setModificationDate(now)

  const metadata = ctx.register(
    ctx.stream(Buffer.from(buildFacturXXmp({ title, date: now }), "utf8"), {
      Type: "Metadata",
      Subtype: "XML",
    })
  )
  doc.catalog.set(PDFName.of("Metadata"), metadata)

  // 4. Identifiant du document (obligatoire en PDF/A).
  const id = createHash("md5").update(xmlBytes).update(title).update(now.toISOString()).digest("hex")
  ctx.trailerInfo.ID = ctx.obj([PDFHexString.of(id), PDFHexString.of(id)])

  return Buffer.from(await doc.save({ useObjectStreams: false }))
}

/** Relit le XML Factur-X joint (null s'il est absent). */
export async function extractFacturXXml(pdf: Uint8Array): Promise<string | null> {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false })
  const files = doc.catalog
    .lookupMaybe(PDFName.of("Names"), PDFDict)
    ?.lookupMaybe(PDFName.of("EmbeddedFiles"), PDFDict)
    ?.lookupMaybe(PDFName.of("Names"), PDFArray)
  if (!files) return null
  for (let i = 0; i + 1 < files.size(); i += 2) {
    const key = files.lookup(i)
    const name = key instanceof PDFString || key instanceof PDFHexString ? key.decodeText() : ""
    if (name !== FACTURX_FILENAME) continue
    const stream = files
      .lookup(i + 1, PDFDict)
      .lookupMaybe(PDFName.of("EF"), PDFDict)
      ?.lookupMaybe(PDFName.of("F"), PDFStream)
    return stream ? streamText(stream) : null
  }
  return null
}
