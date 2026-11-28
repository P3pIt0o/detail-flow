/**
 * L87 — Assemblage PDF/A-3b + Factur-X avec pdf-lib seul (paquet facturx refusé).
 * Vérifie la structure : fichier associé factur-x.xml, XMP PDF/A-3b + Factur-X,
 * profil couleur, identifiant du document, cohérence Info/XMP.
 * La conformité officielle (veraPDF, validateur Factur-X) reste à faire sur Preview.
 */
import { describe, it, expect } from "vitest"
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRawStream,
  PDFStream,
  PDFString,
  decodePDFRawStream,
} from "pdf-lib"
import { embedFacturXXmlInPdf, extractFacturXXml } from "@/lib/invoice/facturx-pdfa"

const XML =
  '<?xml version="1.0" encoding="UTF-8"?>\n<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"><x>é &amp; ü</x></rsm:CrossIndustryInvoice>\n'
const NOW = new Date("2026-11-28T10:00:00.000Z")

async function sourcePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.addPage([595, 842])
  return doc.save()
}

async function build(over: Partial<Parameters<typeof embedFacturXXmlInPdf>[0]> = {}) {
  const pdf = await embedFacturXXmlInPdf({ sourcePdf: await sourcePdf(), xml: XML, now: NOW, title: "FAC-2026-0042", ...over })
  return { pdf, doc: await PDFDocument.load(pdf, { updateMetadata: false }) }
}

function text(stream: PDFStream): string {
  const bytes = stream instanceof PDFRawStream ? decodePDFRawStream(stream).decode() : stream.getContents()
  return Buffer.from(bytes).toString("utf8")
}

function xmp(doc: PDFDocument): { raw: PDFStream; xml: string } {
  const raw = doc.catalog.lookup(PDFName.of("Metadata"), PDFStream)
  return { raw, xml: text(raw) }
}

describe("L87 — embedFacturXXmlInPdf (pdf-lib seul)", () => {
  it("refuse un PDF ou un XML invalide", async () => {
    await expect(embedFacturXXmlInPdf({ sourcePdf: Buffer.from("PAS UN PDF"), xml: XML })).rejects.toThrow()
    await expect(embedFacturXXmlInPdf({ sourcePdf: await sourcePdf(), xml: "<autre/>" })).rejects.toThrow()
  })

  it("joint factur-x.xml en fichier associé (AF + EmbeddedFiles, relation Alternative)", async () => {
    const { pdf, doc } = await build()
    expect(pdf.subarray(0, 8).toString()).toBe("%PDF-1.7")

    const af = doc.catalog.lookup(PDFName.of("AF"), PDFArray)
    expect(af.size()).toBe(1)
    const spec = af.lookup(0, PDFDict)
    expect(spec.get(PDFName.of("Type"))).toBe(PDFName.of("Filespec"))
    expect(spec.lookup(PDFName.of("F"), PDFString).decodeText()).toBe("factur-x.xml")
    expect((spec.lookup(PDFName.of("UF")) as PDFString | PDFHexString).decodeText()).toBe("factur-x.xml")
    expect(spec.get(PDFName.of("AFRelationship"))).toBe(PDFName.of("Alternative"))

    const ef = spec.lookup(PDFName.of("EF"), PDFDict).lookup(PDFName.of("F"), PDFStream)
    expect(ef.dict.get(PDFName.of("Type"))).toBe(PDFName.of("EmbeddedFile"))
    expect(ef.dict.get(PDFName.of("Subtype"))).toBe(PDFName.of("text/xml"))
    const params = ef.dict.lookup(PDFName.of("Params"), PDFDict)
    expect(params.get(PDFName.of("ModDate"))).toBeDefined()
    expect(Number(params.get(PDFName.of("Size"))?.toString())).toBe(Buffer.byteLength(XML, "utf8"))
    expect(text(ef)).toBe(XML)

    const names = doc.catalog
      .lookup(PDFName.of("Names"), PDFDict)
      .lookup(PDFName.of("EmbeddedFiles"), PDFDict)
      .lookup(PDFName.of("Names"), PDFArray)
    expect((names.lookup(0) as PDFString).decodeText()).toBe("factur-x.xml")
    expect(names.lookup(1, PDFDict)).toBe(spec)
  })

  it("extractFacturXXml relit exactement le XML joint", async () => {
    const { pdf } = await build()
    expect(await extractFacturXXml(pdf)).toBe(XML)
    expect(await extractFacturXXml(await sourcePdf())).toBeNull()
  })

  it("XMP PDF/A-3b + Factur-X EN 16931, non compressé, avec schéma d'extension", async () => {
    const { doc } = await build()
    const { raw, xml } = xmp(doc)
    expect(raw.dict.get(PDFName.of("Type"))).toBe(PDFName.of("Metadata"))
    expect(raw.dict.get(PDFName.of("Subtype"))).toBe(PDFName.of("XML"))
    expect(raw.dict.get(PDFName.of("Filter"))).toBeUndefined()

    expect(xml).toMatch(/^<\?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"\?>/)
    expect(xml).toMatch(/<\?xpacket end="w"\?>$/)
    expect(xml).toContain("<pdfaid:part>3</pdfaid:part>")
    expect(xml).toContain("<pdfaid:conformance>B</pdfaid:conformance>")
    expect(xml).toContain('xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#"')
    expect(xml).toContain("<fx:DocumentType>INVOICE</fx:DocumentType>")
    expect(xml).toContain("<fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>")
    expect(xml).toContain("<fx:Version>1.0</fx:Version>")
    expect(xml).toContain("<fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>")
    // Schéma d'extension PDF/A décrivant les 4 propriétés fx.
    expect(xml).toContain("<pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>")
    expect(xml).toContain("<pdfaSchema:prefix>fx</pdfaSchema:prefix>")
    for (const p of ["DocumentFileName", "DocumentType", "Version", "ConformanceLevel"]) {
      expect(xml).toContain(`<pdfaProperty:name>${p}</pdfaProperty:name>`)
    }
  })

  it("Info et XMP cohérents (titre échappé, dates, producteur)", async () => {
    const { doc } = await build({ title: "FAC <1> & co" })
    const { xml } = xmp(doc)
    expect(doc.getTitle()).toBe("FAC <1> & co")
    expect(xml).toContain("FAC &lt;1&gt; &amp; co")
    expect(xml).not.toContain("FAC <1>")
    expect(doc.getProducer()).toBe("DetailFlow")
    expect(xml).toContain("<pdf:Producer>DetailFlow</pdf:Producer>")
    expect(doc.getCreationDate()?.toISOString()).toBe(NOW.toISOString())
    expect(doc.getModificationDate()?.toISOString()).toBe(NOW.toISOString())
    expect(xml).toContain("<xmp:CreateDate>2026-11-28T10:00:00Z</xmp:CreateDate>")
    expect(xml).toContain("<xmp:ModifyDate>2026-11-28T10:00:00Z</xmp:ModifyDate>")
    // Aucune mention d'outil tiers visible par le client final.
    expect(xml).not.toMatch(/pdf-lib|react-pdf|claude/i)
    expect(doc.getProducer()).not.toMatch(/pdf-lib/i)
  })

  it("profil couleur sRGB (OutputIntent GTS_PDFA1) et identifiant du document", async () => {
    const { doc } = await build()
    const intents = doc.catalog.lookup(PDFName.of("OutputIntents"), PDFArray)
    expect(intents.size()).toBe(1)
    const intent = intents.lookup(0, PDFDict)
    expect(intent.get(PDFName.of("S"))).toBe(PDFName.of("GTS_PDFA1"))
    const profile = intent.lookup(PDFName.of("DestOutputProfile"), PDFStream)
    expect(profile.dict.get(PDFName.of("N"))?.toString()).toBe("3")

    const id = doc.context.trailerInfo.ID
    expect(id).toBeInstanceOf(PDFArray)
    const arr = id as PDFArray
    expect(arr.size()).toBe(2)
    const [a, b] = [arr.get(0), arr.get(1)].map((x) => (x as PDFHexString).asBytes())
    expect(a.length).toBe(16)
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true)
  })

  it("aucun chiffrement, aucun JavaScript, sortie relisible", async () => {
    const { pdf, doc } = await build()
    expect(doc.context.trailerInfo.Encrypt).toBeUndefined()
    expect(doc.isEncrypted).toBe(false)
    const raw = Buffer.from(pdf).toString("latin1")
    expect(raw).not.toContain("/JavaScript")
    expect(doc.getPageCount()).toBe(1)
  })
})
