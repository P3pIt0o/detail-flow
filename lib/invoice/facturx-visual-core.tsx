import {
  Document,
  Page,
  Text,
  View,
  Image,
  Font,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer"

import { resolve } from "node:path"

import {
  buildFacturXXml,
  centsToDecimal,
} from "@/lib/invoice/facturx/xml"

import type {
  BuildFacturXXmlInput,
} from "@/lib/invoice/facturx/types"

import {
  embedFacturXXmlInPdf,
} from "@/lib/invoice/facturx-pdfa"

import type { InvoiceTemplate } from "./template-policy"

import type { buildFacturXPresentation } from "./facturx-presentation"

type Presentation = ReturnType<typeof buildFacturXPresentation>
type Input = BuildFacturXXmlInput

const styles = StyleSheet.create({
  page: {
    padding: 42,
    fontFamily: "FacturXLato",
    fontSize: 10,
    color: "#172438",
  },
  top: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  title: {
    fontSize: 23,
    fontWeight: 700,
    color: "#2563eb",
  },
  name: {
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 5,
  },
  muted: {
    color: "#64748b",
    fontSize: 9,
    marginTop: 3,
  },
  cols: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 25,
  },
  col: {
    width: "47%",
  },
  heading: {
    fontSize: 9,
    fontWeight: 700,
    color: "#2563eb",
    marginBottom: 6,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
    paddingVertical: 8,
  },
  header: {
    backgroundColor: "#eff6ff",
    paddingHorizontal: 7,
  },
  totals: {
    width: "55%",
    marginLeft: "auto",
    marginTop: 25,
  },
  total: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  balance: {
    backgroundColor: "#eff6ff",
    padding: 10,
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    fontWeight: 700,
  },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 42,
    right: 42,
    textAlign: "center",
    fontSize: 8,
    color: "#64748b",
  },
})


const templateStyles = {
  basic: StyleSheet.create({
    ...styles,
    page: { ...styles.page, color: "#18181b", padding: 38 },
    title: { ...styles.title, color: "#18181b", fontSize: 19 },
    heading: { ...styles.heading, color: "#52525b" },
    header: { ...styles.header, backgroundColor: "#f4f4f5" },
    balance: { ...styles.balance, backgroundColor: "#f4f4f5" },
    row: { ...styles.row, borderBottomColor: "#d4d4d8" },
  }),
  business_pro: styles,
  signature_premium: StyleSheet.create({
    ...styles,
    page: { ...styles.page, color: "#242424", padding: 45 },
    title: {
      ...styles.title,
      color: "#ae8950",
      fontSize: 27,
      letterSpacing: 2,
    },
    heading: {
      ...styles.heading,
      color: "#ae8950",
      letterSpacing: 1,
    },
    name: { ...styles.name, fontSize: 14 },
    header: {
      ...styles.header,
      backgroundColor: "#eee8db",
      paddingVertical: 4,
    },
    row: { ...styles.row, borderBottomColor: "#c9b895" },
    balance: {
      ...styles.balance,
      backgroundColor: "#eee8db",
      borderTopWidth: 2,
      borderTopColor: "#ae8950",
    },
    footer: { ...styles.footer, color: "#ae8950" },
  }),
}

function PrototypeDocument({
  invoice: inv,
  items,
  template = "business_pro",
  presentation,
  showPrototypeMark = true,
}: Input & {
  template?: InvoiceTemplate
  presentation?: Presentation
  showPrototypeMark?: boolean
}) {
  const design = templateStyles[template]
  const money = (n: number) =>
    centsToDecimal(n).replace(".", ",") +
    " " + inv.currencyCode

  const date = (s: string | null) =>
    s ? s.split("-").reverse().join("/") : ""

  const sortedItems = [...items].sort(
    (a, b) => a.sortOrder - b.sortOrder
  )

  return (
    <Document>
      <Page size="A4" style={design.page}>
        <View style={design.top}>
          <View>
            {presentation?.logoDataUrl ? (
              <Image
                src={presentation.logoDataUrl}
                style={{
                  width: 100,
                  maxHeight: 40,
                  objectFit: "contain",
                  marginBottom: 6,
                }}
              />
            ) : null}
            <Text style={design.name}>
              {inv.issuerName}
            </Text>
            {inv.issuerAddress ? (
              <Text>{inv.issuerAddress}</Text>
            ) : null}
            {presentation?.issuerPhone ? (
              <Text style={design.muted}>
                Tél. : {presentation.issuerPhone}
              </Text>
            ) : null}
            <Text style={design.muted}>
              {inv.issuerCountry}
            </Text>
            {inv.issuerEmail ? (
              <Text style={design.muted}>
                {inv.issuerEmail}
              </Text>
            ) : null}
          </View>
          <View>
            <Text style={design.title}>
              FACTURE
            </Text>
            <Text>{inv.number}</Text>
            <Text style={design.muted}>
              Émise le {date(inv.issueDate)}
            </Text>
            {inv.dueDate ? (
              <Text style={design.muted}>
                Échéance : {date(inv.dueDate)}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={design.cols}>
          <View style={design.col}>
            <Text style={design.heading}>
              ÉMETTEUR
            </Text>
            {inv.issuerLegalRegistrationNumber ? (
              <Text>
                Identifiant légal : {inv.issuerLegalRegistrationNumber}
              </Text>
            ) : null}
            {inv.issuerVatNumber ? (
              <Text>TVA : {inv.issuerVatNumber}</Text>
            ) : null}
          </View>

          <View style={design.col}>
            <Text style={design.heading}>
              FACTURÉ À
            </Text>
            <Text style={design.name}>
              {inv.customerName}
            </Text>
            {inv.customerAddress ? (
              <Text>{inv.customerAddress}</Text>
            ) : null}
            <Text style={design.muted}>
              {inv.customerCountry}
            </Text>
            {inv.customerEmail ? (
              <Text style={design.muted}>
                {inv.customerEmail}
              </Text>
            ) : null}
            {presentation?.customerPhone ? (
              <Text style={design.muted}>
                Tél. : {presentation.customerPhone}
              </Text>
            ) : null}
            {inv.customerType === "business" &&
             inv.customerLegalRegistrationNumber ? (
              <Text style={design.muted}>
                Identifiant légal : {inv.customerLegalRegistrationNumber}
              </Text>
            ) : null}
          </View>
        </View>

        {inv.serviceDate ? (
          <Text style={{ marginBottom: 14 }}>
            Date de prestation : {date(inv.serviceDate)}
          </Text>
        ) : null}

        {(presentation?.vehicle ||
          presentation?.vehiclePlate) ? (
          <View style={{ marginBottom: 15 }}>
            <Text style={design.heading}>VÉHICULE</Text>
            {presentation.vehicle ? (
              <Text>{presentation.vehicle}</Text>
            ) : null}
            {presentation.vehiclePlate ? (
              <Text style={design.muted}>
                Immatriculation : {presentation.vehiclePlate}
              </Text>
            ) : null}
          </View>
        ) : null}

        <View style={[design.row, design.header]}>
          <Text style={{ width: "47%" }}>Prestation</Text>
          <Text style={{ width: "10%" }}>Qté</Text>
          <Text style={{ width: "20%" }}>Prix HT</Text>
          <Text style={{ width: "23%" }}>Total HT</Text>
        </View>

        {sortedItems.map((it, index) => (
          <View
            key={index}
            style={design.row}
            wrap={false}
          >
            <View style={{ width: "47%" }}>
              <Text>{it.label}</Text>
              {it.description ? (
                <Text style={design.muted}>
                  {it.description}
                </Text>
              ) : null}
            </View>
            <Text style={{ width: "10%" }}>
              {it.quantity}
            </Text>
            <Text style={{ width: "20%" }}>
              {money(it.unitPriceCents)}
            </Text>
            <Text style={{ width: "23%" }}>
              {money(it.quantity * it.unitPriceCents)}
            </Text>
          </View>
        ))}

        <View style={design.totals}>
          <View style={design.total}>
            <Text>Sous-total HT</Text>
            <Text>{money(inv.itemsTotalCents)}</Text>
          </View>

          {inv.discountCents > 0 ? (
            <View style={design.total}>
              <Text>Remise</Text>
              <Text>-{money(inv.discountCents)}</Text>
            </View>
          ) : null}

          <View style={design.total}>
            <Text>Net HT</Text>
            <Text>{money(inv.netCents)}</Text>
          </View>

          <View style={design.total}>
            <Text>
              {inv.vatEnabled
                ? `TVA (${inv.vatRate} %)`
                : "TVA"}
            </Text>
            <Text>{money(inv.vatCents)}</Text>
          </View>

          <View style={design.total}>
            <Text>Total TTC</Text>
            <Text>{money(inv.totalCents)}</Text>
          </View>

          {inv.depositCents > 0 ? (
            <View style={design.total}>
              <Text>Acompte réglé</Text>
              <Text>-{money(inv.depositCents)}</Text>
            </View>
          ) : null}

          {inv.paidCents > 0 ? (
            <View style={design.total}>
              <Text>Paiements reçus</Text>
              <Text>-{money(inv.paidCents)}</Text>
            </View>
          ) : null}

          <View style={design.balance}>
            <Text>RESTE À RÉGLER</Text>
            <Text>{money(inv.balanceCents)}</Text>
          </View>
        </View>

        {inv.taxLegalMention ? (
          <Text style={{ marginTop: 16, fontSize: 8 }}>
            {inv.taxLegalMention}
          </Text>
        ) : null}

        {inv.issuerIban ? (
          <View style={{ marginTop: 20 }}>
            <Text>IBAN : {inv.issuerIban}</Text>
            {inv.issuerBic ? (
              <Text>BIC : {inv.issuerBic}</Text>
            ) : null}
          </View>
        ) : null}

        {presentation?.footerNote ? (
          <Text style={{ marginTop: 15, fontSize: 8 }}>
            {presentation.footerNote}
          </Text>
        ) : null}

        {presentation?.legalMentions ? (
          <Text style={{ marginTop: 7, fontSize: 8 }}>
            {presentation.legalMentions}
          </Text>
        ) : null}

        {showPrototypeMark ? (
          <Text style={design.footer} fixed>
            PROTOTYPE FACTUR-X — DOCUMENT DE TEST — NE PAS ENVOYER
          </Text>
        ) : null}
      </Page>
    </Document>
  )
}

/**
 * Prototype uniquement, sans accès DB ni réseau.
 * La validation du XML précède toute génération.
 * Aucun avoir autorisé dans ce prototype.
 */
async function renderFacturXDocumentPdf(
  input: Input,
  options: {
    template?: InvoiceTemplate
    presentation?: Presentation
    showPrototypeMark?: boolean
  } = {}
): Promise<Buffer> {
  const template = options.template ?? "business_pro"
  if (!Object.prototype.hasOwnProperty.call(templateStyles, template)) {
    throw new Error("FACTURX_TEMPLATE_INVALID")
  }
  if (input.invoice.documentType !== "invoice") {
    throw new Error("FACTURX_C2_INVOICE_ONLY")
  }

  const xmlResult = buildFacturXXml(input)

  if (!xmlResult.ok) {
    throw new Error(
      "FACTURX_INVALID_SNAPSHOT: " +
      JSON.stringify(xmlResult.errors)
    )
  }

  Font.register({
    family: "FacturXLato",
    fonts: [
      {
        src: resolve(
          process.cwd(),
          "public/facturx-assets/Lato-Regular.ttf"
        ),
        fontWeight: 400,
      },
      {
        src: resolve(
          process.cwd(),
          "public/facturx-assets/Lato-Bold.ttf"
        ),
        fontWeight: 700,
      },
    ],
  })

  const source = await renderToBuffer(
    <PrototypeDocument
      {...input}
      template={template}
      presentation={options.presentation}
      showPrototypeMark={options.showPrototypeMark ?? true}
    />
  )

  return embedFacturXXmlInPdf({
    sourcePdf: source,
    xml: xmlResult.xml,
  })
}


export async function renderFacturXPrototypePdf(
  input: Input,
  options: {
    template?: InvoiceTemplate
    presentation?: Presentation
  } = {}
): Promise<Buffer> {
  return renderFacturXDocumentPdf(input, {
    ...options,
    showPrototypeMark: true,
  })
}

export async function renderFacturXBusinessProPdf(
  input: Input,
  presentation?: Presentation
): Promise<Buffer> {
  return renderFacturXDocumentPdf(input, {
    template: "business_pro",
    presentation,
    showPrototypeMark: false,
  })
}
