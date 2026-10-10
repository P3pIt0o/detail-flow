import {
  Document,
  Page,
  Text,
  View,
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

function PrototypeDocument({
  invoice: inv,
  items,
}: Input) {
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
      <Page size="A4" style={styles.page}>
        <View style={styles.top}>
          <View>
            <Text style={styles.name}>
              {inv.issuerName}
            </Text>
            {inv.issuerAddress ? (
              <Text>{inv.issuerAddress}</Text>
            ) : null}
            <Text style={styles.muted}>
              {inv.issuerCountry}
            </Text>
            {inv.issuerEmail ? (
              <Text style={styles.muted}>
                {inv.issuerEmail}
              </Text>
            ) : null}
          </View>
          <View>
            <Text style={styles.title}>
              FACTURE
            </Text>
            <Text>{inv.number}</Text>
            <Text style={styles.muted}>
              Émise le {date(inv.issueDate)}
            </Text>
            {inv.dueDate ? (
              <Text style={styles.muted}>
                Échéance : {date(inv.dueDate)}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.cols}>
          <View style={styles.col}>
            <Text style={styles.heading}>
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

          <View style={styles.col}>
            <Text style={styles.heading}>
              FACTURÉ À
            </Text>
            <Text style={styles.name}>
              {inv.customerName}
            </Text>
            {inv.customerAddress ? (
              <Text>{inv.customerAddress}</Text>
            ) : null}
            <Text style={styles.muted}>
              {inv.customerCountry}
            </Text>
            {inv.customerEmail ? (
              <Text style={styles.muted}>
                {inv.customerEmail}
              </Text>
            ) : null}
            {inv.customerType === "business" &&
             inv.customerLegalRegistrationNumber ? (
              <Text style={styles.muted}>
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

        <View style={[styles.row, styles.header]}>
          <Text style={{ width: "47%" }}>Prestation</Text>
          <Text style={{ width: "10%" }}>Qté</Text>
          <Text style={{ width: "20%" }}>Prix HT</Text>
          <Text style={{ width: "23%" }}>Total HT</Text>
        </View>

        {sortedItems.map((it, index) => (
          <View
            key={index}
            style={styles.row}
            wrap={false}
          >
            <View style={{ width: "47%" }}>
              <Text>{it.label}</Text>
              {it.description ? (
                <Text style={styles.muted}>
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

        <View style={styles.totals}>
          <View style={styles.total}>
            <Text>Sous-total HT</Text>
            <Text>{money(inv.itemsTotalCents)}</Text>
          </View>

          {inv.discountCents > 0 ? (
            <View style={styles.total}>
              <Text>Remise</Text>
              <Text>-{money(inv.discountCents)}</Text>
            </View>
          ) : null}

          <View style={styles.total}>
            <Text>Net HT</Text>
            <Text>{money(inv.netCents)}</Text>
          </View>

          <View style={styles.total}>
            <Text>
              {inv.vatEnabled
                ? `TVA (${inv.vatRate} %)`
                : "TVA"}
            </Text>
            <Text>{money(inv.vatCents)}</Text>
          </View>

          <View style={styles.total}>
            <Text>Total TTC</Text>
            <Text>{money(inv.totalCents)}</Text>
          </View>

          {inv.depositCents > 0 ? (
            <View style={styles.total}>
              <Text>Acompte réglé</Text>
              <Text>-{money(inv.depositCents)}</Text>
            </View>
          ) : null}

          {inv.paidCents > 0 ? (
            <View style={styles.total}>
              <Text>Paiements reçus</Text>
              <Text>-{money(inv.paidCents)}</Text>
            </View>
          ) : null}

          <View style={styles.balance}>
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

        <Text style={styles.footer} fixed>
          PROTOTYPE FACTUR-X — DOCUMENT DE TEST — NE PAS ENVOYER
        </Text>
      </Page>
    </Document>
  )
}

/**
 * Prototype uniquement, sans accès DB ni réseau.
 * La validation du XML précède toute génération.
 * Aucun avoir autorisé dans ce prototype.
 */
export async function renderFacturXPrototypePdf(
  input: Input
): Promise<Buffer> {
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
    <PrototypeDocument {...input} />
  )

  return embedFacturXXmlInPdf({
    sourcePdf: source,
    xml: xmlResult.xml,
  })
}
