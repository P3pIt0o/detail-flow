/**
 * Génération du PDF de facture avec @react-pdf/renderer.
 * Runtime Node uniquement (voir la route qui l'appelle).
 * Police intégrée Helvetica pour éviter tout téléchargement de font.
 */
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer"
import type { InvoiceRow, InvoiceItemRow } from "@/lib/invoice/queries"
import { formatMoney, formatDateLong } from "@/lib/format"
import {
  resolveIssuerLegalIdentityDisplay,
  resolveCustomerLegalIdentityDisplay,
  resolveCustomerCountryLabel,
  resolveCustomerVatDisplay,
} from "@/lib/billing/country-profiles"

const BRAND = "#2563eb"
const INK = "#0f172a"
const MUTED = "#64748b"
const LINE = "#e2e8f0"

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, color: INK, fontFamily: "Helvetica", lineHeight: 1.5 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 },
  logo: { width: 120, maxHeight: 56, objectFit: "contain" },
  issuerName: { fontSize: 16, fontFamily: "Helvetica-Bold", color: INK },
  muted: { color: MUTED },
  right: { textAlign: "right" },
  invoiceTitle: { fontSize: 22, fontFamily: "Helvetica-Bold", color: BRAND },
  block: { marginBottom: 18 },
  twoCol: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  col: { width: "48%" },
  sectionLabel: { fontSize: 8, textTransform: "uppercase", color: MUTED, marginBottom: 4, letterSpacing: 0.5 },
  strong: { fontFamily: "Helvetica-Bold" },
  table: { marginTop: 8 },
  th: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: INK,
    paddingBottom: 5,
    marginBottom: 2,
  },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: LINE, paddingVertical: 5 },
  cDesc: { width: "52%" },
  cQty: { width: "12%", textAlign: "center" },
  cUnit: { width: "18%", textAlign: "right" },
  cTot: { width: "18%", textAlign: "right" },
  totals: { marginTop: 16, marginLeft: "auto", width: "45%" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  grandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: INK,
    marginTop: 4,
    paddingTop: 5,
  },
  grandText: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  balanceBox: {
    marginTop: 6,
    backgroundColor: "#eff6ff",
    borderRadius: 4,
    padding: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  comment: { marginTop: 22, padding: 10, backgroundColor: "#f8fafc", borderRadius: 4 },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    borderTopWidth: 0.5,
    borderTopColor: LINE,
    paddingTop: 8,
    fontSize: 8,
    color: MUTED,
    textAlign: "center",
  },
  payInfo: { marginTop: 18, fontSize: 9 },
})

export type InvoicePdfData = {
  invoice: InvoiceRow
  items: InvoiceItemRow[]
  logoDataUrl?: string | null
}

function InvoiceDocument({ invoice, items, logoDataUrl }: InvoicePdfData) {
  const vehicle = [invoice.vehicleBrand, invoice.vehicleModel].filter(Boolean).join(" ") || invoice.vehicleTypeName || ""
  // Tous les montants du PDF utilisent la devise SNAPSHOTÉE de la facture.
  const money = (cents: number) => formatMoney(cents, invoice.currencyCode)
  // Identité légale vendeur résolue depuis le SNAPSHOT facture (jamais le tenant courant).
  const issuerIdentity = resolveIssuerLegalIdentityDisplay({
    issuerCountry: invoice.issuerCountry,
    legalRegistrationNumber: invoice.issuerLegalRegistrationNumber,
    legalRegistrationScheme: invoice.issuerLegalRegistrationScheme,
    legacySiret: invoice.issuerSiret,
  })
  // Identité CLIENT résolue depuis le SNAPSHOT facture (jamais la fiche client courante).
  const customerCountryLabel = resolveCustomerCountryLabel(invoice.customerCountry)
  const customerIdentity = resolveCustomerLegalIdentityDisplay({
    customerType: invoice.customerType,
    customerCountry: invoice.customerCountry,
    legalRegistrationNumber: invoice.customerLegalRegistrationNumber,
    legalRegistrationScheme: invoice.customerLegalRegistrationScheme,
  })
  const customerVat = resolveCustomerVatDisplay({
    customerType: invoice.customerType,
    customerCountry: invoice.customerCountry,
    vatNumber: invoice.customerVatNumber,
  })

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* En-tête */}
        <View style={s.headerRow}>
          <View>
            {logoDataUrl ? (
              <Image src={logoDataUrl} style={s.logo} />
            ) : (
              <Text style={s.issuerName}>{invoice.issuerName || "DetailFlow"}</Text>
            )}
            {logoDataUrl && invoice.issuerName ? (
              <Text style={[s.strong, { marginTop: 6 }]}>{invoice.issuerName}</Text>
            ) : null}
            {invoice.issuerAddress ? <Text style={s.muted}>{invoice.issuerAddress}</Text> : null}
            {invoice.issuerPhone ? <Text style={s.muted}>{invoice.issuerPhone}</Text> : null}
            {invoice.issuerEmail ? <Text style={s.muted}>{invoice.issuerEmail}</Text> : null}
            {issuerIdentity ? (
              <Text style={s.muted}>
                {issuerIdentity.label} : {issuerIdentity.value}
              </Text>
            ) : null}
          </View>
          <View style={s.right}>
            <Text style={s.invoiceTitle}>FACTURE</Text>
            <Text style={[s.strong, { marginTop: 4 }]}>{invoice.number}</Text>
            {invoice.issueDate ? <Text style={s.muted}>Date : {formatDateLong(invoice.issueDate)}</Text> : null}
            {invoice.dueDate ? <Text style={s.muted}>Échéance : {formatDateLong(invoice.dueDate)}</Text> : null}
          </View>
        </View>

        {/* Client / véhicule */}
        <View style={s.twoCol}>
          <View style={s.col}>
            <Text style={s.sectionLabel}>Facturé à</Text>
            <Text style={s.strong}>{invoice.customerName}</Text>
            {invoice.customerAddress ? <Text style={s.muted}>{invoice.customerAddress}</Text> : null}
            {customerCountryLabel ? <Text style={s.muted}>{customerCountryLabel}</Text> : null}
            {customerIdentity ? (
              <Text style={s.muted}>
                {customerIdentity.label} : {customerIdentity.value}
              </Text>
            ) : null}
            {customerVat ? (
              <Text style={s.muted}>
                {customerVat.label} : {customerVat.value}
              </Text>
            ) : null}
            {invoice.customerEmail ? <Text style={s.muted}>{invoice.customerEmail}</Text> : null}
            {invoice.customerPhone ? <Text style={s.muted}>{invoice.customerPhone}</Text> : null}
          </View>
          <View style={s.col}>
            <Text style={s.sectionLabel}>Véhicule / prestation</Text>
            {vehicle ? <Text style={s.strong}>{vehicle}</Text> : null}
            {invoice.vehiclePlate ? <Text style={s.muted}>Immatriculation : {invoice.vehiclePlate}</Text> : null}
            {invoice.serviceDate ? (
              <Text style={s.muted}>Prestation réalisée le {formatDateLong(invoice.serviceDate)}</Text>
            ) : null}
          </View>
        </View>

        {/* Tableau des lignes */}
        <View style={s.table}>
          <View style={s.th}>
            <Text style={[s.cDesc, s.strong]}>Désignation</Text>
            <Text style={[s.cQty, s.strong]}>Qté</Text>
            <Text style={[s.cUnit, s.strong]}>P.U. HT</Text>
            <Text style={[s.cTot, s.strong]}>Total</Text>
          </View>
          {items.map((it) => (
            <View style={s.tr} key={it.id} wrap={false}>
              <View style={s.cDesc}>
                <Text>{it.label}</Text>
                {it.description ? <Text style={[s.muted, { fontSize: 8 }]}>{it.description}</Text> : null}
              </View>
              <Text style={s.cQty}>{it.quantity}</Text>
              <Text style={s.cUnit}>{money(it.unitPriceCents)}</Text>
              <Text style={s.cTot}>{money(it.unitPriceCents * it.quantity)}</Text>
            </View>
          ))}
        </View>

        {/* Totaux */}
        <View style={s.totals}>
          <View style={s.totalRow}>
            <Text style={s.muted}>Sous-total</Text>
            <Text>{money(invoice.itemsTotalCents)}</Text>
          </View>
          {invoice.discountCents > 0 ? (
            <View style={s.totalRow}>
              <Text style={s.muted}>Remise</Text>
              <Text>-{money(invoice.discountCents)}</Text>
            </View>
          ) : null}
          <View style={s.totalRow}>
            <Text style={s.muted}>Total HT</Text>
            <Text>{money(invoice.netCents)}</Text>
          </View>
          {invoice.vatEnabled ? (
            <View style={s.totalRow}>
              <Text style={s.muted}>TVA ({invoice.vatRate}%)</Text>
              <Text>{money(invoice.vatCents)}</Text>
            </View>
          ) : null}
          <View style={s.grandRow}>
            <Text style={s.grandText}>Total TTC</Text>
            <Text style={s.grandText}>{money(invoice.totalCents)}</Text>
          </View>
          {invoice.depositCents > 0 ? (
            <View style={s.totalRow}>
              <Text style={s.muted}>Acompte réglé</Text>
              <Text>-{money(invoice.depositCents)}</Text>
            </View>
          ) : null}
          {invoice.paidCents > 0 ? (
            <View style={s.totalRow}>
              <Text style={s.muted}>Paiements</Text>
              <Text>-{money(invoice.paidCents)}</Text>
            </View>
          ) : null}
          <View style={s.balanceBox}>
            <Text style={s.strong}>Reste à régler</Text>
            <Text style={s.strong}>{money(invoice.balanceCents)}</Text>
          </View>
        </View>

        {/* Exonération TVA */}
        {!invoice.vatEnabled && invoice.vatExemptNote ? (
          <Text style={[s.muted, { marginTop: 12, fontSize: 8 }]}>{invoice.vatExemptNote}</Text>
        ) : null}

        {/* Commentaire client */}
        {invoice.customerComment ? (
          <View style={s.comment}>
            <Text>{invoice.customerComment}</Text>
          </View>
        ) : null}

        {/* Infos de paiement */}
        {invoice.issuerIban ? (
          <View style={s.payInfo}>
            <Text style={s.sectionLabel}>Coordonnées bancaires</Text>
            <Text>IBAN : {invoice.issuerIban}</Text>
            {invoice.issuerBic ? <Text>BIC : {invoice.issuerBic}</Text> : null}
          </View>
        ) : null}

        {/* Pied de page */}
        <Text style={s.footer} fixed>
          {[invoice.footerNote, invoice.legalMentions].filter(Boolean).join("  •  ") ||
            `${invoice.issuerName || "DetailFlow"} — Merci de votre confiance.`}
        </Text>
      </Page>
    </Document>
  )
}

export async function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument {...data} />)
}
