import { describe, it, expect, expectTypeOf } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { buildFacturXXml, centsToDecimal, escapeXml, __test__ } from "@/lib/invoice/facturx/xml"
import type {
  BuildFacturXXmlResult,
  FacturXInvoiceItem,
  FacturXInvoiceSnapshot,
} from "@/lib/invoice/facturx/types"

/* -------------------------------------------------------------------------- */
/*  Helpers : extraction de champs structurants (pas de snapshot géant)        */
/* -------------------------------------------------------------------------- */

function xmlOf(r: BuildFacturXXmlResult): string {
  if (!r.ok) throw new Error(`XML attendu, erreurs : ${JSON.stringify(r.errors)}`)
  return r.xml
}

function errorsOf(r: BuildFacturXXmlResult) {
  if (r.ok) throw new Error("Erreur attendue, XML généré")
  return r.errors
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Contenu du premier élément `tag` (texte ou sous-arbre). */
function section(xml: string, tag: string): string {
  const m = new RegExp(`<${esc(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)</${esc(tag)}>`).exec(xml)
  if (!m) throw new Error(`Élément ${tag} absent`)
  return m[1]
}

/** Valeurs texte de tous les éléments `tag`. */
function all(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<${esc(tag)}(?:\\s[^>]*)?>([^<]*)</${esc(tag)}>`, "g"))].map((m) => m[1])
}

const val = (xml: string, tag: string) => {
  const v = all(xml, tag)
  if (!v.length) throw new Error(`Élément ${tag} absent`)
  return v[0]
}

/** Attribut `attr` du premier élément `tag`. */
function attr(xml: string, tag: string, name: string): string | null {
  const m = new RegExp(`<${esc(tag)}\\s[^>]*${esc(name)}="([^"]*)"`).exec(xml)
  return m ? m[1] : null
}

const has = (xml: string, tag: string) => new RegExp(`<${esc(tag)}[\\s>/]`).test(xml)

const seller = (xml: string) => section(xml, "ram:SellerTradeParty")
const buyer = (xml: string) => section(xml, "ram:BuyerTradeParty")
const totals = (xml: string) => section(xml, "ram:SpecifiedTradeSettlementHeaderMonetarySummation")
const headerTax = (xml: string) =>
  section(section(xml, "ram:ApplicableHeaderTradeSettlement").split("<ram:SpecifiedTradeAllowanceCharge>")[0], "ram:ApplicableTradeTax")

/* -------------------------------------------------------------------------- */
/*  Fixtures (snapshots tels que stockés par DetailFlow, montants en centimes) */
/* -------------------------------------------------------------------------- */

const ITEMS: FacturXInvoiceItem[] = [
  { kind: "service", label: "Lavage intérieur complet", description: "Aspiration + shampoing sièges", quantity: 1, unitPriceCents: 10_000, sortOrder: 0 },
  { kind: "option", label: "Traitement plastiques", description: null, quantity: 2, unitPriceCents: 2_500, sortOrder: 1 },
]

/** Facture FR émise, TVA 20 %, client entreprise. 150 € HT, 30 € TVA, acompte 30 €. */
function frInvoice(over: Partial<FacturXInvoiceSnapshot> = {}): FacturXInvoiceSnapshot {
  return {
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
    itemsTotalCents: 15_000,
    discountCents: 0,
    netCents: 15_000,
    vatCents: 3_000,
    totalCents: 18_000,
    depositCents: 3_000,
    paidCents: 0,
    balanceCents: 15_000,
    ...over,
  }
}

/* -------------------------------------------------------------------------- */
/*  Conversions                                                               */
/* -------------------------------------------------------------------------- */

describe("conversions déterministes", () => {
  it("centimes -> décimal sans float", () => {
    expect(centsToDecimal(0)).toBe("0.00")
    expect(centsToDecimal(5)).toBe("0.05")
    expect(centsToDecimal(100)).toBe("1.00")
    expect(centsToDecimal(123_456)).toBe("1234.56")
    expect(centsToDecimal(-150)).toBe("-1.50")
    expect(() => centsToDecimal(0.5)).toThrow()
  })

  it("taux snapshoté normalisé sans float", () => {
    expect(__test__.normalizeRate("20")).toBe("20")
    expect(__test__.normalizeRate("20.00")).toBe("20")
    expect(__test__.normalizeRate("8.10")).toBe("8.1")
    expect(__test__.normalizeRate("abc")).toBeNull()
  })

  it("dates ISO -> format 102, dates impossibles refusées", () => {
    expect(__test__.toDate102("2026-10-09")).toBe("20261009")
    expect(__test__.toDate102("2026-02-30")).toBeNull()
    expect(__test__.toDate102("09/10/2026")).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/*  1. Facture française standard avec TVA                                    */
/* -------------------------------------------------------------------------- */

describe("1. facture française standard avec TVA", () => {
  const xml = xmlOf(buildFacturXXml({ invoice: frInvoice(), items: ITEMS }))

  it("en-tête document", () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(val(section(xml, "ram:GuidelineSpecifiedDocumentContextParameter"), "ram:ID")).toBe("urn:cen.eu:en16931:2017")
    const doc = section(xml, "rsm:ExchangedDocument")
    expect(val(doc, "ram:ID")).toBe("FAC-2026-0042")
    expect(val(doc, "ram:TypeCode")).toBe("380")
    expect(val(doc, "udt:DateTimeString")).toBe("20261009")
    expect(attr(doc, "udt:DateTimeString", "format")).toBe("102")
  })

  it("vendeur snapshoté (SIRET 0009 + TVA)", () => {
    const s = seller(xml)
    expect(val(s, "ram:Name")).toBe("Detailing Pro SARL")
    expect(val(section(s, "ram:SpecifiedLegalOrganization"), "ram:ID")).toBe("12345678900012")
    expect(attr(section(s, "ram:SpecifiedLegalOrganization"), "ram:ID", "schemeID")).toBe("0009")
    expect(val(s, "ram:LineOne")).toBe("5 avenue du Lac, 74000 Annecy")
    expect(val(s, "ram:CountryID")).toBe("FR")
    expect(val(section(s, "ram:SpecifiedTaxRegistration"), "ram:ID")).toBe("FR12123456789")
    expect(attr(section(s, "ram:SpecifiedTaxRegistration"), "ram:ID", "schemeID")).toBe("VA")
  })

  it("TVA catégorie S 20 % et totaux", () => {
    const tax = headerTax(xml)
    expect(val(tax, "ram:CategoryCode")).toBe("S")
    expect(val(tax, "ram:RateApplicablePercent")).toBe("20")
    expect(val(tax, "ram:CalculatedAmount")).toBe("30.00")
    expect(val(tax, "ram:BasisAmount")).toBe("150.00")
    expect(has(tax, "ram:ExemptionReason")).toBe(false)
    const tot = totals(xml)
    expect(val(tot, "ram:LineTotalAmount")).toBe("150.00")
    expect(val(tot, "ram:TaxBasisTotalAmount")).toBe("150.00")
    expect(val(tot, "ram:TaxTotalAmount")).toBe("30.00")
    expect(val(tot, "ram:GrandTotalAmount")).toBe("180.00")
    expect(val(tot, "ram:TotalPrepaidAmount")).toBe("30.00")
    expect(val(tot, "ram:DuePayableAmount")).toBe("150.00")
  })

  it("échéance, date de prestation et virement snapshotés", () => {
    expect(val(section(xml, "ram:SpecifiedTradePaymentTerms"), "udt:DateTimeString")).toBe("20261108")
    expect(val(section(xml, "ram:ActualDeliverySupplyChainEvent"), "udt:DateTimeString")).toBe("20261008")
    const pm = section(xml, "ram:SpecifiedTradeSettlementPaymentMeans")
    expect(val(pm, "ram:TypeCode")).toBe("30")
    expect(val(pm, "ram:IBANID")).toBe("FR7630006000011234567890189")
    expect(val(pm, "ram:BICID")).toBe("AGRIFRPP")
  })
})

/* -------------------------------------------------------------------------- */
/*  2. Facture sans TVA                                                       */
/* -------------------------------------------------------------------------- */

describe("2. facture sans TVA", () => {
  const exempt = (over: Partial<FacturXInvoiceSnapshot> = {}) =>
    frInvoice({
      taxTreatment: "EXEMPT",
      taxLegalMention: "TVA non applicable, art. 293 B du CGI",
      vatEnabled: false,
      vatRate: "20", // taux conservé en DB mais TVA désactivée par le traitement
      vatCents: 0,
      totalCents: 15_000,
      balanceCents: 12_000,
      ...over,
    })

  it("EXEMPT => catégorie E, taux 0, motif = mention snapshotée", () => {
    const xml = xmlOf(buildFacturXXml({ invoice: exempt(), items: ITEMS }))
    const tax = headerTax(xml)
    expect(val(tax, "ram:CategoryCode")).toBe("E")
    expect(val(tax, "ram:RateApplicablePercent")).toBe("0")
    expect(val(tax, "ram:CalculatedAmount")).toBe("0.00")
    expect(val(tax, "ram:ExemptionReason")).toBe("TVA non applicable, art. 293 B du CGI")
    expect(all(section(xml, "ram:IncludedSupplyChainTradeLineItem"), "ram:CategoryCode")).toEqual(["E"])
    expect(val(totals(xml), "ram:GrandTotalAmount")).toBe("150.00")
  })

  it("EXEMPT sans mention fiscale => erreur explicite (BR-E-10)", () => {
    const errors = errorsOf(buildFacturXXml({ invoice: exempt({ taxLegalMention: null }), items: ITEMS }))
    expect(errors).toContainEqual(expect.objectContaining({ field: "invoice.taxLegalMention", rule: "BR-E-10" }))
  })

  it("EXEMPT sans numéro de TVA vendeur => erreur explicite (BR-E-02), rien d'inventé", () => {
    const errors = errorsOf(buildFacturXXml({ invoice: exempt({ issuerVatNumber: null }), items: ITEMS }))
    expect(errors).toContainEqual(expect.objectContaining({ code: "MISSING_FIELD", field: "invoice.issuerVatNumber", rule: "BR-E-02" }))
  })

  it("OUT_OF_SCOPE => catégorie O sans taux ni numéro de TVA", () => {
    const xml = xmlOf(
      buildFacturXXml({
        invoice: exempt({
          taxTreatment: "OUT_OF_SCOPE",
          taxLegalMention: "Hors champ d'application de la TVA",
          issuerVatNumber: null,
          customerVatNumber: null,
        }),
        items: ITEMS,
      }),
    )
    expect(val(headerTax(xml), "ram:CategoryCode")).toBe("O")
    expect(has(xml, "ram:RateApplicablePercent")).toBe(false)
    expect(has(xml, "ram:SpecifiedTaxRegistration")).toBe(false)
  })

  it("REVERSE_CHARGE => catégorie AE avec TVA vendeur et acheteur", () => {
    const xml = xmlOf(
      buildFacturXXml({ invoice: exempt({ taxTreatment: "REVERSE_CHARGE", taxLegalMention: "Autoliquidation" }), items: ITEMS }),
    )
    expect(val(headerTax(xml), "ram:CategoryCode")).toBe("AE")
    expect(val(section(buyer(xml), "ram:SpecifiedTaxRegistration"), "ram:ID")).toBe("FR98987654321")
  })
})

/* -------------------------------------------------------------------------- */
/*  3 / 4. Vendeurs suisse et belge                                           */
/* -------------------------------------------------------------------------- */

/** 200 CHF HT, TVA 8,1 % = 16,20 CHF. */
function chInvoice(over: Partial<FacturXInvoiceSnapshot> = {}): FacturXInvoiceSnapshot {
  return frInvoice({
    number: "FAC-2026-0007",
    currencyCode: "CHF",
    issuerName: "Brillance Genève Sàrl",
    issuerAddress: "Rue du Rhône 1, 1204 Genève",
    issuerCountry: "CH",
    issuerLegalRegistrationNumber: "CHE-123.456.789",
    issuerLegalRegistrationScheme: "CH_UID",
    issuerVatNumber: "CHE-123.456.789",
    issuerIban: "CH9300762011623852957",
    issuerBic: null,
    customerCountry: "CH",
    customerLegalRegistrationNumber: "CHE-987.654.321",
    customerLegalRegistrationScheme: "CH_UID",
    customerVatNumber: "CHE-987.654.321",
    vatRate: "8.1",
    itemsTotalCents: 20_000,
    netCents: 20_000,
    vatCents: 1_620,
    totalCents: 21_620,
    depositCents: 0,
    balanceCents: 21_620,
    ...over,
  })
}
const CH_ITEMS: FacturXInvoiceItem[] = [
  { kind: "service", label: "Polissage carrosserie", description: null, quantity: 1, unitPriceCents: 20_000, sortOrder: 0 },
]

describe("3. vendeur suisse", () => {
  const xml = xmlOf(buildFacturXXml({ invoice: chInvoice(), items: CH_ITEMS }))

  it("UID CH (ICD 0183), pays CH, TVA canonique", () => {
    const s = seller(xml)
    expect(val(s, "ram:CountryID")).toBe("CH")
    expect(attr(section(s, "ram:SpecifiedLegalOrganization"), "ram:ID", "schemeID")).toBe("0183")
    expect(val(section(s, "ram:SpecifiedTaxRegistration"), "ram:ID")).toBe("CHE-123.456.789")
  })

  it("taux 8,1 % et montants exacts", () => {
    expect(val(headerTax(xml), "ram:RateApplicablePercent")).toBe("8.1")
    expect(val(headerTax(xml), "ram:CalculatedAmount")).toBe("16.20")
    expect(val(totals(xml), "ram:GrandTotalAmount")).toBe("216.20")
  })
})

describe("4. vendeur belge", () => {
  const xml = xmlOf(
    buildFacturXXml({
      invoice: frInvoice({
        issuerName: "Carwash Liège SRL",
        issuerAddress: "Place Saint-Lambert 2, 4000 Liège",
        issuerCountry: "BE",
        issuerLegalRegistrationNumber: "0123456789",
        issuerLegalRegistrationScheme: "BE_BCE",
        issuerVatNumber: "BE0123456789",
        customerCountry: "BE",
        customerLegalRegistrationNumber: "0987654321",
        customerLegalRegistrationScheme: "BE_BCE",
        customerVatNumber: "BE0987654321",
        vatRate: "21",
        vatCents: 3_150,
        totalCents: 18_150,
        balanceCents: 15_150,
      }),
      items: ITEMS,
    }),
  )

  it("BCE (ICD 0208), pays BE, TVA BE, taux 21 %", () => {
    const s = seller(xml)
    expect(val(s, "ram:CountryID")).toBe("BE")
    expect(attr(section(s, "ram:SpecifiedLegalOrganization"), "ram:ID", "schemeID")).toBe("0208")
    expect(val(section(s, "ram:SpecifiedTaxRegistration"), "ram:ID")).toBe("BE0123456789")
    expect(val(headerTax(xml), "ram:RateApplicablePercent")).toBe("21")
    expect(val(totals(xml), "ram:TaxTotalAmount")).toBe("31.50")
  })
})

/* -------------------------------------------------------------------------- */
/*  5 / 6. Acheteur entreprise / particulier                                  */
/* -------------------------------------------------------------------------- */

describe("5. client entreprise avec identifiant légal + TVA", () => {
  const xml = xmlOf(buildFacturXXml({ invoice: frInvoice(), items: ITEMS }))
  it("identifiant légal (scheme 0009) et TVA acheteur émis", () => {
    const b = buyer(xml)
    expect(val(b, "ram:Name")).toBe("Garage Martin SAS")
    expect(val(section(b, "ram:SpecifiedLegalOrganization"), "ram:ID")).toBe("98765432100011")
    expect(attr(section(b, "ram:SpecifiedLegalOrganization"), "ram:ID", "schemeID")).toBe("0009")
    expect(val(section(b, "ram:SpecifiedTaxRegistration"), "ram:ID")).toBe("FR98987654321")
    expect(val(b, "ram:CountryID")).toBe("FR")
    expect(val(b, "ram:URIID")).toBe("compta@garage-martin.example")
  })

  it("scheme inconnu => erreur, jamais deviné", () => {
    const errors = errorsOf(
      buildFacturXXml({ invoice: frInvoice({ customerLegalRegistrationScheme: "XX_FOO" }), items: ITEMS }),
    )
    expect(errors).toContainEqual(expect.objectContaining({ code: "UNKNOWN_LEGAL_SCHEME" }))
  })
})

describe("6. client particulier", () => {
  it("aucun identifiant d'entreprise ni TVA émis, même s'il en reste dans le snapshot", () => {
    const xml = xmlOf(
      buildFacturXXml({
        invoice: frInvoice({ customerType: "individual", customerName: "Julie Dupont" }),
        items: ITEMS,
      }),
    )
    const b = buyer(xml)
    expect(val(b, "ram:Name")).toBe("Julie Dupont")
    expect(has(b, "ram:SpecifiedLegalOrganization")).toBe(false)
    expect(has(b, "ram:SpecifiedTaxRegistration")).toBe(false)
    expect(val(b, "ram:CountryID")).toBe("FR")
  })

  it("particulier sans pays snapshoté => erreur BR-11 (pays non deviné)", () => {
    const errors = errorsOf(
      buildFacturXXml({ invoice: frInvoice({ customerType: "individual", customerCountry: null }), items: ITEMS }),
    )
    expect(errors).toContainEqual(expect.objectContaining({ field: "invoice.customerCountry", rule: "BR-11" }))
  })
})

/* -------------------------------------------------------------------------- */
/*  7 / 8 / 9. Lignes, remise, déplacement                                    */
/* -------------------------------------------------------------------------- */

describe("7. plusieurs lignes", () => {
  it("ordre sortOrder, numérotation, quantités, prix et totaux par ligne", () => {
    const items: FacturXInvoiceItem[] = [
      { kind: "option", label: "Option C", description: null, quantity: 3, unitPriceCents: 1_000, sortOrder: 2 },
      { kind: "service", label: "Prestation A", description: "Desc A", quantity: 1, unitPriceCents: 9_000, sortOrder: 0 },
      { kind: "option", label: "Option B", description: null, quantity: 2, unitPriceCents: 1_500, sortOrder: 1 },
    ]
    // 9 000 + 3 000 + 3 000 = 15 000
    const xml = xmlOf(buildFacturXXml({ invoice: frInvoice(), items }))
    const lines = xml.split("<ram:IncludedSupplyChainTradeLineItem>").slice(1)
    expect(lines).toHaveLength(3)
    expect(lines.map((l) => val(l, "ram:LineID"))).toEqual(["1", "2", "3"])
    expect(lines.map((l) => val(l, "ram:Name"))).toEqual(["Prestation A", "Option B", "Option C"])
    expect(lines.map((l) => val(l, "ram:BilledQuantity"))).toEqual(["1", "2", "3"])
    expect(lines.map((l) => attr(l, "ram:BilledQuantity", "unitCode"))).toEqual(["C62", "C62", "C62"])
    expect(lines.map((l) => val(l, "ram:ChargeAmount"))).toEqual(["90.00", "15.00", "10.00"])
    expect(lines.map((l) => val(l, "ram:LineTotalAmount"))).toEqual(["90.00", "30.00", "30.00"])
    expect(val(lines[0], "ram:Description")).toBe("Desc A")
    expect(has(lines[1], "ram:Description")).toBe(false)
  })
})

describe("8. remise", () => {
  // 150 € − 10 € = 140 € HT ; TVA 28 € ; TTC 168 € ; acompte 30 € => 138 € dus.
  const invoice = frInvoice({
    discountCents: 1_000,
    netCents: 14_000,
    vatCents: 2_800,
    totalCents: 16_800,
    balanceCents: 13_800,
  })
  const xml = xmlOf(buildFacturXXml({ invoice, items: ITEMS }))

  it("remise globale = allowance document avec la catégorie TVA de la facture", () => {
    const ac = section(xml, "ram:SpecifiedTradeAllowanceCharge")
    expect(val(ac, "udt:Indicator")).toBe("false")
    expect(val(ac, "ram:ActualAmount")).toBe("10.00")
    expect(val(ac, "ram:Reason")).toBe("Remise")
    expect(val(ac, "ram:CategoryCode")).toBe("S")
    expect(val(ac, "ram:RateApplicablePercent")).toBe("20")
  })

  it("totaux cohérents (BR-CO-13)", () => {
    const tot = totals(xml)
    expect(val(tot, "ram:LineTotalAmount")).toBe("150.00")
    expect(val(tot, "ram:AllowanceTotalAmount")).toBe("10.00")
    expect(val(tot, "ram:TaxBasisTotalAmount")).toBe("140.00")
    expect(val(tot, "ram:TaxTotalAmount")).toBe("28.00")
    expect(val(tot, "ram:GrandTotalAmount")).toBe("168.00")
    expect(val(tot, "ram:DuePayableAmount")).toBe("138.00")
  })

  it("remise supérieure aux lignes (net plafonné à 0 en DB) => erreur, pas de XML", () => {
    const errors = errorsOf(
      buildFacturXXml({
        invoice: frInvoice({ discountCents: 20_000, netCents: 0, vatCents: 0, totalCents: 0, depositCents: 0, balanceCents: 0 }),
        items: ITEMS,
      }),
    )
    expect(errors).toContainEqual(expect.objectContaining({ code: "AMOUNT_MISMATCH", rule: "BR-CO-13" }))
  })
})

describe("9. frais de déplacement", () => {
  it("ligne « travel » émise comme une ligne facturée ordinaire", () => {
    const items: FacturXInvoiceItem[] = [
      ...ITEMS,
      { kind: "travel", label: "Déplacement", description: "Zone 2 (15 km)", quantity: 1, unitPriceCents: 1_500, sortOrder: 2 },
    ]
    // 15 000 + 1 500 = 16 500 HT ; TVA 3 300 ; TTC 19 800 ; acompte 3 000.
    const invoice = frInvoice({ itemsTotalCents: 16_500, netCents: 16_500, vatCents: 3_300, totalCents: 19_800, balanceCents: 16_800 })
    const xml = xmlOf(buildFacturXXml({ invoice, items }))
    const last = xml.split("<ram:IncludedSupplyChainTradeLineItem>").slice(1)[2]
    expect(val(last, "ram:Name")).toBe("Déplacement")
    expect(val(last, "ram:Description")).toBe("Zone 2 (15 km)")
    expect(val(last, "ram:LineTotalAmount")).toBe("15.00")
    expect(val(totals(xml), "ram:LineTotalAmount")).toBe("165.00")
  })
})

/* -------------------------------------------------------------------------- */
/*  10. Caractères spéciaux / injection                                       */
/* -------------------------------------------------------------------------- */

describe("10. caractères spéciaux XML", () => {
  const nasty = `Tom & Jerry <SARL> "Le Garage" l'Annecien éàçü ✨ 🚗`

  it("échappement de & < > \" ' et conservation des accents / Unicode", () => {
    expect(escapeXml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&apos;")
    const xml = xmlOf(
      buildFacturXXml({
        invoice: frInvoice({
          customerName: nasty,
          issuerName: nasty,
          customerAddress: `1 rue "A" & 'B' <C>`,
          customerComment: `</ram:Content><ram:Injected>x</ram:Injected>`,
        }),
        items: [{ ...ITEMS[0], label: nasty, description: `<![CDATA[x]]> & --> ` }, ITEMS[1]],
      }),
    )
    const expected = "Tom &amp; Jerry &lt;SARL&gt; &quot;Le Garage&quot; l&apos;Annecien éàçü ✨ 🚗"
    expect(val(buyer(xml), "ram:Name")).toBe(expected)
    expect(val(seller(xml), "ram:Name")).toBe(expected)
    expect(val(buyer(xml), "ram:LineOne")).toBe("1 rue &quot;A&quot; &amp; &apos;B&apos; &lt;C&gt;")
    expect(xml).not.toContain("<ram:Injected>")
    expect(xml).not.toContain("<![CDATA[")
    expect(val(section(xml, "ram:SpecifiedTradeProduct"), "ram:Name")).toBe(expected)
  })

  it("caractère de contrôle interdit en XML => erreur, jamais supprimé en silence", () => {
    const errors = errorsOf(buildFacturXXml({ invoice: frInvoice({ customerName: "Bad\u0001Name" }), items: ITEMS }))
    expect(errors).toContainEqual(expect.objectContaining({ code: "INVALID_XML_CHARACTER", field: "invoice.customerName" }))
  })
})

/* -------------------------------------------------------------------------- */
/*  11 / 12. Devises                                                          */
/* -------------------------------------------------------------------------- */

describe("11. facture en EUR", () => {
  it("devise snapshotée EUR + currencyID sur le total TVA", () => {
    const xml = xmlOf(buildFacturXXml({ invoice: frInvoice(), items: ITEMS }))
    expect(val(xml, "ram:InvoiceCurrencyCode")).toBe("EUR")
    expect(attr(xml, "ram:TaxTotalAmount", "currencyID")).toBe("EUR")
  })
})

describe("12. facture en CHF", () => {
  it("devise snapshotée CHF, aucune trace d'EUR", () => {
    const xml = xmlOf(buildFacturXXml({ invoice: chInvoice(), items: CH_ITEMS }))
    expect(val(xml, "ram:InvoiceCurrencyCode")).toBe("CHF")
    expect(attr(xml, "ram:TaxTotalAmount", "currencyID")).toBe("CHF")
    expect(xml).not.toContain("EUR")
  })

  it("devise non snapshotée (legacy) => erreur, EUR jamais supposé", () => {
    const errors = errorsOf(buildFacturXXml({ invoice: frInvoice({ currencyCode: null }), items: ITEMS }))
    expect(errors).toContainEqual(expect.objectContaining({ field: "invoice.currencyCode", rule: "BR-05" }))
  })
})

/* -------------------------------------------------------------------------- */
/*  13. Avoir                                                                 */
/* -------------------------------------------------------------------------- */

describe("13. avoir avec référence facture d'origine", () => {
  // ATTENTION : fixture SYNTHÉTIQUE. Elle porte une dueDate, ce que DetailFlow ne
  // produit PAS aujourd'hui sur un avoir (dueDate = NULL en production). Elle
  // sert uniquement à vérifier la structure 381 + référence d'origine ; elle ne
  // prouve PAS que les avoirs de production sont pris en charge (voir le bloc
  // « 13b » ci-dessous : un avoir réel échoue volontairement).
  // Avoir partiel : 1 × 100 € HT, TVA 20 € => 120 € crédités.
  const creditNote = (over: Partial<FacturXInvoiceSnapshot> = {}) =>
    frInvoice({
      number: "AVO-2026-0003",
      documentType: "credit_note",
      originalInvoiceId: 42,
      creditReason: "Prestation non réalisée",
      itemsTotalCents: 10_000,
      netCents: 10_000,
      vatCents: 2_000,
      totalCents: 12_000,
      depositCents: 0,
      paidCents: 0,
      balanceCents: 0,
      dueDate: "2026-10-24",
      ...over,
    })
  const items = [ITEMS[0]]
  const original = { number: "FAC-2026-0042", issueDate: "2026-10-01" }

  it("[synthétique, dueDate artificielle] type 381, référence d'origine, motif, montants crédités", () => {
    const xml = xmlOf(buildFacturXXml({ invoice: creditNote(), items, originalInvoice: original }))
    expect(val(section(xml, "rsm:ExchangedDocument"), "ram:TypeCode")).toBe("381")
    const ref = section(xml, "ram:InvoiceReferencedDocument")
    expect(val(ref, "ram:IssuerAssignedID")).toBe("FAC-2026-0042")
    expect(val(ref, "qdt:DateTimeString")).toBe("20261001")
    expect(val(section(xml, "ram:IncludedNote"), "ram:Content")).toBe("Prestation non réalisée")
    expect(val(totals(xml), "ram:GrandTotalAmount")).toBe("120.00")
    expect(val(totals(xml), "ram:TotalPrepaidAmount")).toBe("0.00")
    expect(val(totals(xml), "ram:DuePayableAmount")).toBe("120.00")
    // Un avoir n'affiche jamais de coordonnées bancaires (comme le PDF).
    expect(has(xml, "ram:SpecifiedTradeSettlementPaymentMeans")).toBe(false)
  })

  it("avoir rattaché sans référence fournie => erreur explicite", () => {
    const errors = errorsOf(buildFacturXXml({ invoice: creditNote(), items }))
    expect(errors).toContainEqual(expect.objectContaining({ code: "ORIGINAL_INVOICE_REFERENCE_MISSING" }))
  })

  it("avoir tel qu'émis aujourd'hui (sans échéance) => erreur dédiée, règle BR-CO-25 signalée", () => {
    const errors = errorsOf(buildFacturXXml({ invoice: creditNote({ dueDate: null }), items, originalInvoice: original }))
    expect(errors).toContainEqual(expect.objectContaining({ code: "CREDIT_NOTE_SETTLEMENT_UNDECIDED", rule: "BR-CO-25" }))
  })

  it("ne modifie jamais la facture d'origine ni l'avoir", () => {
    const cn = creditNote()
    const orig = { ...original }
    const cnCopy = JSON.stringify(cn)
    buildFacturXXml({ invoice: cn, items, originalInvoice: orig })
    expect(JSON.stringify(cn)).toBe(cnCopy)
    expect(orig).toEqual(original)
  })
})

/* -------------------------------------------------------------------------- */
/*  13b. Avoir DetailFlow RÉEL (correctif audit) : échec propre et dédié       */
/* -------------------------------------------------------------------------- */

describe("13b. avoir DetailFlow réel (paid = balance = deposit = 0, dueDate = null)", () => {
  // Reproduit exactement l'avoir écrit par issueCreditNote : status "issued",
  // depositCents 0, paidCents 0, balanceCents 0, dueDate NULL (createCreditNote
  // ne copie jamais d'échéance). Totaux recalculés par computeInvoice.
  const realCreditNote = (): FacturXInvoiceSnapshot =>
    frInvoice({
      number: "AVO-2026-0001",
      status: "issued",
      documentType: "credit_note",
      originalInvoiceId: 42,
      creditReason: "Geste commercial",
      itemsTotalCents: 10_000,
      discountCents: 0,
      netCents: 10_000,
      vatCents: 2_000,
      totalCents: 12_000,
      depositCents: 0,
      paidCents: 0,
      balanceCents: 0,
      dueDate: null,
    })
  const items = [ITEMS[0]]
  const original = { number: "FAC-2026-0042", issueDate: "2026-10-01" }

  it("aucun XML : erreur structurée dédiée CREDIT_NOTE_SETTLEMENT_UNDECIDED", () => {
    const r = buildFacturXXml({ invoice: realCreditNote(), items, originalInvoice: original })
    expect(r.ok).toBe(false)
    expect("xml" in r).toBe(false)
    const errors = errorsOf(r)
    expect(errors).toContainEqual(
      expect.objectContaining({ code: "CREDIT_NOTE_SETTLEMENT_UNDECIDED", field: "invoice.dueDate", rule: "BR-CO-25" }),
    )
    // L'erreur dédiée remplace l'erreur générique : pas de double signalement.
    expect(errors.map((e) => e.code)).not.toContain("MISSING_PAYMENT_DUE_DATE")
    // Seule cette décision bloque : toutes les autres données de l'avoir sont valides.
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toMatch(/reste à trancher/)
  })

  it("aucune date fabriquée et avoir non modifié", () => {
    const cn = realCreditNote()
    const before = JSON.stringify(cn)
    buildFacturXXml({ invoice: cn, items, originalInvoice: original })
    expect(JSON.stringify(cn)).toBe(before)
    expect(cn.dueDate).toBeNull()
    expect(cn.balanceCents).toBe(0)
  })
})

/* -------------------------------------------------------------------------- */
/*  18. Identification fiscale vendeur (correctif audit BR-S/E/AE-02)          */
/* -------------------------------------------------------------------------- */

describe("18. identifiant fiscal vendeur : aucun SIREN/SIRET réutilisé comme BT-32", () => {
  const SIRET = "12345678900012"

  it("TVA normale sans n° TVA mais avec SIRET => erreur BR-S-02 explicite, SIRET non réutilisé", () => {
    const errors = errorsOf(buildFacturXXml({ invoice: frInvoice({ issuerVatNumber: null }), items: ITEMS }))
    const e = errors.find((x) => x.rule === "BR-S-02")
    expect(e?.code).toBe("MISSING_FIELD")
    expect(e?.field).toBe("invoice.issuerVatNumber")
    expect(e?.message).toMatch(/BT-32/)
    expect(e?.message).toMatch(/ne dispose actuellement pas d'un identifiant fiscal EN16931 alternatif snapshoté/)
    expect(e?.message).toMatch(/Aucun SIREN\/SIRET n'est réutilisé/)
    // Le message ne prétend plus qu'EN16931 impose exclusivement un n° de TVA.
    expect(e?.message).not.toMatch(/numéro de TVA vendeur requis/)
  })

  it("exonération et autoliquidation : même message explicite (BR-E-02 / BR-AE-02)", () => {
    const base = { vatEnabled: false, vatCents: 0, totalCents: 15_000, balanceCents: 12_000, issuerVatNumber: null }
    const e = errorsOf(
      buildFacturXXml({ invoice: frInvoice({ ...base, taxTreatment: "EXEMPT", taxLegalMention: "Exonéré" }), items: ITEMS }),
    ).find((x) => x.rule === "BR-E-02")
    const ae = errorsOf(
      buildFacturXXml({ invoice: frInvoice({ ...base, taxTreatment: "REVERSE_CHARGE", taxLegalMention: "Autoliquidation" }), items: ITEMS }),
    ).find((x) => x.rule === "BR-AE-02" && x.field === "invoice.issuerVatNumber")
    for (const err of [e, ae]) {
      expect(err?.message).toMatch(/BT-31.*BT-32.*BT-63/)
      expect(err?.message).toMatch(/Aucun SIREN\/SIRET n'est réutilisé/)
    }
  })

  it("XML valide : le SIRET n'apparaît que comme identifiant légal, jamais comme identifiant fiscal", () => {
    const xml = xmlOf(buildFacturXXml({ invoice: frInvoice(), items: ITEMS }))
    // Identifiants fiscaux émis = uniquement les n° de TVA snapshotés (BT-31 / BT-48).
    const taxIds = xml
      .split("<ram:SpecifiedTaxRegistration>")
      .slice(1)
      .map((chunk) => ({ id: val(chunk, "ram:ID"), scheme: attr(chunk, "ram:ID", "schemeID") }))
    expect(taxIds).toEqual([
      { id: "FR12123456789", scheme: "VA" },
      { id: "FR98987654321", scheme: "VA" },
    ])
    expect(xml).not.toContain('schemeID="FC"')
    // Le SIRET vendeur n'existe qu'une fois, dans SpecifiedLegalOrganization.
    expect(xml.split(SIRET).length - 1).toBe(1)
    expect(val(section(seller(xml), "ram:SpecifiedLegalOrganization"), "ram:ID")).toBe(SIRET)
  })

  it("hors champ sans TVA : SIRET présent en identifiant légal, aucun identifiant fiscal émis", () => {
    const xml = xmlOf(
      buildFacturXXml({
        invoice: frInvoice({
          taxTreatment: "OUT_OF_SCOPE",
          taxLegalMention: "Hors champ",
          vatEnabled: false,
          vatCents: 0,
          totalCents: 15_000,
          balanceCents: 12_000,
          issuerVatNumber: null,
          customerVatNumber: null,
        }),
        items: ITEMS,
      }),
    )
    expect(has(xml, "ram:SpecifiedTaxRegistration")).toBe(false)
    expect(val(section(seller(xml), "ram:SpecifiedLegalOrganization"), "ram:ID")).toBe(SIRET)
  })

  it("le code source n'émet jamais d'identifiant fiscal BT-32 (schemeID FC)", () => {
    const dir = join(process.cwd(), "lib/invoice/facturx")
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
      expect(readFileSync(join(dir, file), "utf8"), file).not.toMatch(/schemeID:\s*"FC"/)
    }
  })
})

/* -------------------------------------------------------------------------- */
/*  14. Données obligatoires manquantes                                        */
/* -------------------------------------------------------------------------- */

describe("14. données obligatoires manquantes => erreur explicite", () => {
  it("liste structurée de toutes les données manquantes, aucun XML", () => {
    const r = buildFacturXXml({
      invoice: frInvoice({
        issuerCountry: null,
        issuerLegalRegistrationNumber: null,
        issuerVatNumber: null,
        customerCountry: null,
        taxTreatment: null,
      }),
      items: ITEMS,
    })
    expect(r.ok).toBe(false)
    expect("xml" in r).toBe(false)
    const errors = errorsOf(r)
    for (const e of errors) {
      expect(typeof e.code).toBe("string")
      expect(typeof e.field).toBe("string")
      expect(e.message.length).toBeGreaterThan(0)
    }
    const fields = errors.map((e) => e.field)
    expect(fields).toContain("invoice.issuerCountry")
    expect(fields).toContain("invoice.customerCountry")
    expect(fields).toContain("invoice.taxTreatment")
    expect(errors).toContainEqual(expect.objectContaining({ rule: "BR-CO-26" }))
  })

  it("brouillon, annulée, sans ligne, sans numéro => refus", () => {
    expect(errorsOf(buildFacturXXml({ invoice: frInvoice({ status: "draft" }), items: ITEMS }))[0].code).toBe("INVOICE_NOT_ISSUED")
    expect(errorsOf(buildFacturXXml({ invoice: frInvoice({ status: "cancelled" }), items: ITEMS }))[0].code).toBe("INVOICE_CANCELLED")
    expect(errorsOf(buildFacturXXml({ invoice: frInvoice(), items: [] }))).toContainEqual(expect.objectContaining({ rule: "BR-16" }))
    expect(errorsOf(buildFacturXXml({ invoice: frInvoice({ number: null }), items: ITEMS }))).toContainEqual(
      expect.objectContaining({ field: "invoice.number" }),
    )
  })

  it("montant dû sans date d'échéance => erreur BR-CO-25", () => {
    const errors = errorsOf(buildFacturXXml({ invoice: frInvoice({ dueDate: null }), items: ITEMS }))
    expect(errors).toContainEqual(expect.objectContaining({ code: "MISSING_PAYMENT_DUE_DATE" }))
  })

  it("facture soldée sans échéance => XML (rien n'est dû)", () => {
    const xml = xmlOf(
      buildFacturXXml({ invoice: frInvoice({ dueDate: null, status: "paid", paidCents: 15_000, balanceCents: 0 }), items: ITEMS }),
    )
    expect(val(totals(xml), "ram:DuePayableAmount")).toBe("0.00")
    expect(val(totals(xml), "ram:TotalPrepaidAmount")).toBe("180.00")
    expect(has(xml, "ram:SpecifiedTradePaymentTerms")).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
/*  15 / 16. Pureté : aucun setting courant, aucun tenant inventé             */
/* -------------------------------------------------------------------------- */

const FACTURX_DIR = join(process.cwd(), "lib/invoice/facturx")
const sources = readdirSync(FACTURX_DIR)
  .filter((f) => f.endsWith(".ts"))
  .map((f) => ({ file: f, code: readFileSync(join(FACTURX_DIR, f), "utf8") }))

describe("15. aucune lecture des settings courants", () => {
  it("aucun import runtime de DB, settings, companies, tenant, actions, réseau", () => {
    for (const { file, code } of sources) {
      const runtimeImports = [...code.matchAll(/^import\s+(?!type\b)[\s\S]*?from\s+"([^"]+)"/gm)].map((m) => m[1])
      for (const spec of runtimeImports) {
        expect(spec, `${file} importe ${spec}`).not.toMatch(/lib\/db|tenant|queries|actions|settings|companies|stripe|next\/|@vercel|resend|pdf/)
      }
      expect(code, file).not.toMatch(/\bfetch\(|process\.env|Date\.now\(|new Date\(\)|from\s+"server-only"/)
    }
  })

  it("XML déterministe : mêmes snapshots => même XML", () => {
    const a = xmlOf(buildFacturXXml({ invoice: frInvoice(), items: ITEMS }))
    const b = xmlOf(buildFacturXXml({ invoice: frInvoice(), items: ITEMS.map((i) => ({ ...i })) }))
    expect(a).toBe(b)
  })

  it("seules les valeurs snapshotées sont utilisées (immutabilité)", () => {
    const xml = xmlOf(buildFacturXXml({ invoice: frInvoice(), items: ITEMS }))
    // Un snapshot vendeur différent change le XML : la source est bien la facture.
    const other = xmlOf(buildFacturXXml({ invoice: frInvoice({ issuerName: "Nouveau nom" }), items: ITEMS }))
    expect(val(seller(xml), "ram:Name")).toBe("Detailing Pro SARL")
    expect(val(seller(other), "ram:Name")).toBe("Nouveau nom")
  })
})

describe("16. aucun companyId ni donnée tenant inventée", () => {
  it("le type d'entrée n'expose ni companyId ni id", () => {
    expectTypeOf<FacturXInvoiceSnapshot>().not.toHaveProperty("companyId")
    expectTypeOf<FacturXInvoiceSnapshot>().not.toHaveProperty("id")
    expectTypeOf<FacturXInvoiceSnapshot>().not.toHaveProperty("internalNote")
  })

  it("un companyId ou une note interne transmis par erreur n'apparaissent jamais", () => {
    // Valeurs absentes de toutes les fixtures (aucune collision avec SIRET/TVA).
    const leaky = { ...frInvoice(), companyId: 555_000_777, id: 444_000_333, internalNote: "SECRET-INTERNE" }
    const xml = xmlOf(buildFacturXXml({ invoice: leaky, items: ITEMS }))
    expect(xml).not.toContain("555000777")
    expect(xml).not.toContain("444000333")
    expect(xml).not.toContain("SECRET-INTERNE")
    expect(xml.toLowerCase()).not.toContain("companyid")
  })

  it("pas d'e-mail, d'IBAN ou d'adresse inventés quand le snapshot est vide", () => {
    const xml = xmlOf(
      buildFacturXXml({
        invoice: frInvoice({ issuerEmail: null, customerEmail: null, issuerIban: null, issuerBic: null, customerAddress: null }),
        items: ITEMS,
      }),
    )
    expect(has(xml, "ram:URIUniversalCommunication")).toBe(false)
    expect(has(xml, "ram:SpecifiedTradeSettlementPaymentMeans")).toBe(false)
    expect(has(buyer(xml), "ram:LineOne")).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
/*  17. Mêmes montants DB / PDF / XML                                         */
/* -------------------------------------------------------------------------- */

describe("17. mêmes montants DB / PDF / XML", () => {
  it("chaque montant XML = champ en centimes stocké (celui que le PDF affiche)", () => {
    const inv = frInvoice({ discountCents: 1_000, netCents: 14_000, vatCents: 2_800, totalCents: 16_800, paidCents: 2_000, balanceCents: 11_800 })
    const xml = xmlOf(buildFacturXXml({ invoice: inv, items: ITEMS }))
    const tot = totals(xml)
    // Le PDF affiche : sous-total, remise, total HT, TVA, TTC, acompte, paiements, reste.
    expect(val(tot, "ram:LineTotalAmount")).toBe(centsToDecimal(inv.itemsTotalCents))
    expect(val(tot, "ram:AllowanceTotalAmount")).toBe(centsToDecimal(inv.discountCents))
    expect(val(tot, "ram:TaxBasisTotalAmount")).toBe(centsToDecimal(inv.netCents))
    expect(val(tot, "ram:TaxTotalAmount")).toBe(centsToDecimal(inv.vatCents))
    expect(val(tot, "ram:GrandTotalAmount")).toBe(centsToDecimal(inv.totalCents))
    expect(val(tot, "ram:TotalPrepaidAmount")).toBe(centsToDecimal(inv.depositCents + inv.paidCents))
    expect(val(tot, "ram:DuePayableAmount")).toBe(centsToDecimal(inv.balanceCents))
    // Lignes : le PDF affiche unitPriceCents et unitPriceCents × quantity.
    const lines = xml.split("<ram:IncludedSupplyChainTradeLineItem>").slice(1)
    ITEMS.forEach((it, i) => {
      expect(val(lines[i], "ram:ChargeAmount")).toBe(centsToDecimal(it.unitPriceCents))
      expect(val(lines[i], "ram:LineTotalAmount")).toBe(centsToDecimal(it.unitPriceCents * it.quantity))
    })
  })

  it("arrondi TVA identique au moteur (round half-up en centimes)", () => {
    // 3 × 33,33 € = 99,99 € HT ; TVA 20 % = 19,998 => 20,00 €.
    const items: FacturXInvoiceItem[] = [
      { kind: "service", label: "X", description: null, quantity: 3, unitPriceCents: 3_333, sortOrder: 0 },
    ]
    const inv = frInvoice({
      itemsTotalCents: 9_999,
      netCents: 9_999,
      vatCents: 2_000,
      totalCents: 11_999,
      depositCents: 0,
      balanceCents: 11_999,
    })
    const xml = xmlOf(buildFacturXXml({ invoice: inv, items }))
    expect(val(totals(xml), "ram:TaxTotalAmount")).toBe("20.00")
    expect(val(totals(xml), "ram:GrandTotalAmount")).toBe("119.99")
  })

  it("total stocké divergent du moteur => erreur, jamais de recalcul silencieux", () => {
    const errors = errorsOf(buildFacturXXml({ invoice: frInvoice({ vatCents: 2_999 }), items: ITEMS }))
    expect(errors).toContainEqual(expect.objectContaining({ code: "AMOUNT_MISMATCH", field: "invoice.vatCents" }))
  })

  it("trop-perçu (solde DB plafonné à 0) => erreur BR-CO-16", () => {
    const errors = errorsOf(
      buildFacturXXml({ invoice: frInvoice({ status: "paid", paidCents: 20_000, balanceCents: 0 }), items: ITEMS }),
    )
    expect(errors).toContainEqual(expect.objectContaining({ code: "AMOUNT_MISMATCH", rule: "BR-CO-16" }))
  })
})

describe("Validation externe Factur-X EN16931", () => {
  it("valide le XML avec XSD et Schematron", async () => {
    const { check } = await import("@stafyniaksacha/facturx")
    const xml = xmlOf(buildFacturXXml({
      invoice: frInvoice(),
      items: ITEMS,
    }))
    const result = await check({ xml, schematron: true })
    console.log("VALIDATION EXTERNE :", JSON.stringify(result))
    expect(result.valid).toBe(true)
    expect(result.schematronValid).toBe(true)
  })
})

describe("Lot B - PDF Factur-X de test", () => {
  it("intègre et récupère le XML dans un PDF", async () => {
    const { createElement } = await import("react")
    const { Document, Page, Text, Font, renderToBuffer } =
      await import("@react-pdf/renderer")
    const { extract } =
      await import("@stafyniaksacha/facturx")
    const { embedFacturXXmlInPdf } =
      await import("@/lib/invoice/facturx-pdfa")

    const xml = xmlOf(buildFacturXXml({
      invoice: frInvoice(),
      items: ITEMS,
    }))

    const { resolve } = await import("node:path")
    const assets = resolve(process.cwd(), "public/facturx-assets")

    Font.register({
      family: "FacturXLato",
      fonts: [
        { src: resolve(assets, "Lato-Regular.ttf"), fontWeight: 400 },
        { src: resolve(assets, "Lato-Bold.ttf"), fontWeight: 700 },
      ],
    })

    const source = await renderToBuffer(
      createElement(Document, null,
        createElement(Page, { size: "A4" },
          createElement(Text, { style: { fontFamily: "FacturXLato" } },
            "TEST - FAC-2026-0042 - 180 EUR - NE PAS ENVOYER"
          )
        )
      )
    )


    const pdf = await embedFacturXXmlInPdf({
      sourcePdf: source,
      xml,
    })
    const extracted = await extract({ pdf })

    expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe("%PDF-")

    expect(Buffer.from(extracted.xml).toString("utf8").trim().replace(/^<\?xml version="1\.0" encoding="utf-8"\?>/, '<?xml version="1.0" encoding="UTF-8"?>'))
      .toBe(xml.trim())
  }, 30000)
})
