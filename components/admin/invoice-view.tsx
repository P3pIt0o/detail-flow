"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Download,
  Mail,
  Plus,
  Loader2,
  CircleCheck,
  History,
  TriangleAlert,
  ReceiptText,
  ExternalLink,
} from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { formatMoney, getDisplayCurrencyCode, formatDateLong } from "@/lib/format"
import {
  resolveIssuerLegalIdentityDisplay,
  resolveIssuerVatDisplay,
  buildIssuerIdentityWarning,
  resolveCustomerLegalIdentityDisplay,
  resolveCustomerCountryLabel,
  resolveCustomerVatDisplay,
} from "@/lib/billing/country-profiles"
import { getTaxTreatmentLabel } from "@/lib/invoice/tax-treatment"
import { invoiceStatusMeta, PAYMENT_METHOD_LABEL } from "@/lib/invoice/calc"
import { addInvoicePayment, createCreditNote, sendInvoiceEmail } from "@/lib/invoice/actions"
import { CREDITABLE_INVOICE_STATUSES } from "@/lib/invoice/credit"
import { withTenant } from "@/lib/tenant-link"
import type {
  InvoiceRow,
  InvoiceItemRow,
  InvoicePaymentRow,
  InvoiceEventRow,
  CreditSummary,
} from "@/lib/invoice/queries"

const cardClass = "rounded-2xl border border-border bg-card p-5"
const rowClass = "flex items-center justify-between py-1 text-sm"

export function InvoiceView({
  invoice,
  items,
  payments,
  events,
  creditNotes = [],
  creditSummary = null,
  originalInvoice = null,
}: {
  invoice: InvoiceRow
  items: InvoiceItemRow[]
  payments: InvoicePaymentRow[]
  events: InvoiceEventRow[]
  creditNotes?: InvoiceRow[]
  creditSummary?: CreditSummary | null
  originalInvoice?: InvoiceRow | null
}) {
  const isCredit = invoice.documentType === "credit_note"
  // Une facture (non avoir) émise/payée et non intégralement créditée est
  // éligible à la création d'un avoir.
  const canCreateCredit =
    !isCredit &&
    CREDITABLE_INVOICE_STATUSES.includes(invoice.status as (typeof CREDITABLE_INVOICE_STATUSES)[number]) &&
    (creditSummary ? creditSummary.remainingCents > 0 : true)
  // Tous les montants de la vue utilisent la devise SNAPSHOTÉE de la facture.
  const money = (cents: number) => formatMoney(cents, invoice.currencyCode)
  // Code affiché dans les labels de saisie (visuel uniquement).
  const displayCurrency = getDisplayCurrencyCode(invoice.currencyCode)
  // Identité légale vendeur + warning, résolus UNIQUEMENT depuis le snapshot facture.
  const issuerIdentity = resolveIssuerLegalIdentityDisplay({
    issuerCountry: invoice.issuerCountry,
    legalRegistrationNumber: invoice.issuerLegalRegistrationNumber,
    legalRegistrationScheme: invoice.issuerLegalRegistrationScheme,
    legacySiret: invoice.issuerSiret,
  })
  const identityWarning = buildIssuerIdentityWarning(invoice.issuerCountry, issuerIdentity != null)
  // Numéro de TVA vendeur : résolu depuis le SNAPSHOT facture uniquement.
  const issuerVat = resolveIssuerVatDisplay({
    issuerCountry: invoice.issuerCountry,
    vatNumber: invoice.issuerVatNumber,
  })
  // Identité CLIENT depuis le SNAPSHOT facture uniquement (jamais la fiche client courante).
  const customerCountryLabel = resolveCustomerCountryLabel({
    customerType: invoice.customerType,
    customerCountry: invoice.customerCountry,
  })
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
  const customerTypeLabel =
    invoice.customerType === "business" ? "Entreprise" : invoice.customerType === "individual" ? "Particulier" : null
  const router = useRouter()
  const searchParams = useSearchParams()
  // Conserve le tenant courant (slug) sur toutes les navigations facture/avoir.
  const tenantParam = searchParams.get("tenant")
  const [busy, startBusy] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [showPayment, setShowPayment] = useState(false)
  const [payAmount, setPayAmount] = useState((invoice.balanceCents / 100).toFixed(2))
  const [payMethod, setPayMethod] = useState("transfer")
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10))
  const [payNote, setPayNote] = useState("")

  // Dialogue « Créer un avoir » (facture d'origine uniquement).
  const [showCredit, setShowCredit] = useState(false)
  const [creditMode, setCreditMode] = useState<"full" | "partial">("full")
  const [creditReason, setCreditReason] = useState("")

  const meta = invoiceStatusMeta(invoice.status)
  const isCancelled = invoice.status === "cancelled"

  function recordPayment() {
    setError(null)
    const amountCents = Math.round(Number.parseFloat(payAmount.replace(",", ".")) * 100)
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      setError("Montant de paiement invalide.")
      return
    }
    startBusy(async () => {
      const res = await addInvoicePayment({
        invoiceId: invoice.id,
        amountCents,
        method: payMethod,
        paidAt: payDate,
        note: payNote.trim() || undefined,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setShowPayment(false)
      setPayNote("")
      setNotice("Paiement enregistré.")
      router.refresh()
    })
  }

  function markAsPaid() {
    setError(null)
    setNotice(null)
    // Enregistre le solde restant comme paiement : réutilise exactement le même
    // chemin que l'ajout de paiement, qui bascule la facture en « Payée » quand
    // le solde atteint 0 (et alimente donc le CA des factures payées).
    startBusy(async () => {
      const res = await addInvoicePayment({
        invoiceId: invoice.id,
        amountCents: invoice.balanceCents,
        method: "transfer",
        paidAt: new Date().toISOString().slice(0, 10),
        note: "Marquée comme payée",
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setNotice("Facture marquée comme payée.")
      router.refresh()
    })
  }

  function sendEmail() {
    setError(null)
    setNotice(null)
    startBusy(async () => {
      const res = await sendInvoiceEmail(invoice.id)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setNotice(isCredit ? "Avoir envoyé par email au client." : "Facture envoyée par email au client.")
      router.refresh()
    })
  }

  function createCredit() {
    setError(null)
    setNotice(null)
    const reason = creditReason.trim()
    if (!reason) {
      setError("Le motif de l'avoir est obligatoire.")
      return
    }
    startBusy(async () => {
      const res = await createCreditNote(invoice.id, creditMode, reason)
      if (!res.ok) {
        setError(res.error)
        return
      }
      // Redirige vers le BROUILLON d'avoir créé (éditable avant émission).
      router.push(withTenant(`/admin/factures/${res.data.invoiceId}`, tenantParam))
    })
  }

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            {isCredit && (
              <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                AVOIR
              </span>
            )}
            <h1 className="text-2xl font-semibold text-foreground">{invoice.number}</h1>
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${meta.className}`}
            >
              {meta.label}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {isCredit ? "Établi le " : "Émise le "}
            {invoice.issueDate ? formatDateLong(invoice.issueDate) : "—"}
            {!isCredit && invoice.dueDate ? ` · échéance le ${formatDateLong(invoice.dueDate)}` : ""}
          </p>
          {isCredit && originalInvoice && (
            <p className="mt-1 text-sm">
              <Link
                href={withTenant(`/admin/factures/${originalInvoice.id}`, tenantParam)}
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                Rectifie la facture {originalInvoice.number ?? `#${originalInvoice.id}`}
                {originalInvoice.issueDate ? ` du ${formatDateLong(originalInvoice.issueDate)}` : ""}
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </p>
          )}
          {isCredit && invoice.creditReason && (
            <p className="mt-1 text-sm text-muted-foreground">Motif : {invoice.creditReason}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
        <a
          href={`/api/factures/${invoice.id}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "outline" })}
        >
          <Download className="mr-2 h-4 w-4" /> Télécharger le PDF
        </a>
          {!isCancelled && invoice.customerEmail && (
            <Button variant="outline" onClick={sendEmail} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
              Envoyer par email
            </Button>
          )}
          {!isCancelled && !isCredit && invoice.status !== "draft" && invoice.balanceCents > 0 && (
            <Button onClick={markAsPaid} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CircleCheck className="mr-2 h-4 w-4" />}
              Marquer comme payée
            </Button>
          )}
        </div>
      </div>

      {/* Avertissement non bloquant : identité légale vendeur incomplète, basé
          EXCLUSIVEMENT sur le snapshot facture (invoice.issuerCountry), jamais
          sur le tenant courant. N'empêche ni l'émission ni le paiement. */}
      {!isCancelled && identityWarning && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{identityWarning}</span>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-foreground">
          {notice}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Colonne principale */}
        <div className="space-y-6 lg:col-span-2">
          {/* Vendeur (identité légale snapshotée sur la facture) */}
          <div className={cardClass}>
            <h2 className="mb-2 text-sm font-semibold text-foreground">Vendeur</h2>
            {invoice.issuerName && <p className="text-sm text-foreground">{invoice.issuerName}</p>}
            {invoice.issuerAddress && (
              <p className="text-sm text-muted-foreground whitespace-pre-line">{invoice.issuerAddress}</p>
            )}
            {issuerIdentity && (
              <p className="text-sm text-muted-foreground">
                {issuerIdentity.label} : {issuerIdentity.value}
              </p>
            )}
            {issuerVat && (
              <p className="text-sm text-muted-foreground">
                {issuerVat.label} : {issuerVat.value}
              </p>
            )}
          </div>

          {/* Client + véhicule */}
          <div className={cardClass}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-foreground">Client</h2>
                  {customerTypeLabel && (
                    <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                      {customerTypeLabel}
                    </span>
                  )}
                </div>
                <p className="text-sm text-foreground">{invoice.customerName}</p>
                {invoice.customerAddress && (
                  <p className="text-sm text-muted-foreground whitespace-pre-line">{invoice.customerAddress}</p>
                )}
                {customerCountryLabel && <p className="text-sm text-muted-foreground">{customerCountryLabel}</p>}
                {customerIdentity && (
                  <p className="text-sm text-muted-foreground">
                    {customerIdentity.label} : {customerIdentity.value}
                  </p>
                )}
                {customerVat && (
                  <p className="text-sm text-muted-foreground">
                    {customerVat.label} : {customerVat.value}
                  </p>
                )}
                {invoice.customerEmail && <p className="text-sm text-muted-foreground">{invoice.customerEmail}</p>}
                {invoice.customerPhone && <p className="text-sm text-muted-foreground">{invoice.customerPhone}</p>}
              </div>
              <div>
                <h2 className="mb-2 text-sm font-semibold text-foreground">Véhicule</h2>
                <p className="text-sm text-foreground">
                  {[invoice.vehicleBrand, invoice.vehicleModel].filter(Boolean).join(" ") || invoice.vehicleTypeName || "—"}
                </p>
                {invoice.vehiclePlate && <p className="text-sm text-muted-foreground">{invoice.vehiclePlate}</p>}
                {invoice.serviceDate && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Prestation du {formatDateLong(invoice.serviceDate)}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Lignes */}
          <div className={cardClass}>
            <h2 className="mb-3 text-sm font-semibold text-foreground">Détail</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                    <th className="pb-2 font-medium">Désignation</th>
                    <th className="pb-2 text-center font-medium">Qté</th>
                    <th className="pb-2 text-right font-medium">P.U.</th>
                    <th className="pb-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} className="border-b border-border/50">
                      <td className="py-2 text-foreground">
                        {it.label}
                        {it.description && (
                          <span className="block text-xs text-muted-foreground">{it.description}</span>
                        )}
                      </td>
                      <td className="py-2 text-center text-muted-foreground">{it.quantity}</td>
                      <td className="py-2 text-right text-muted-foreground">{money(it.unitPriceCents)}</td>
                      <td className="py-2 text-right text-foreground">
                        {money(it.unitPriceCents * it.quantity)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {invoice.customerComment && (
              <p className="mt-4 rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                {invoice.customerComment}
              </p>
            )}
          </div>

          {/* Avoirs rattachés (facture d'origine uniquement) */}
          {!isCredit && creditSummary && creditNotes.length > 0 && (
            <div className={cardClass}>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                <ReceiptText className="h-4 w-4" /> Avoirs
              </h2>
              <ul className="space-y-2">
                {creditNotes.map((cn) => (
                  <li key={cn.id} className="flex items-center justify-between text-sm">
                    <Link
                      href={withTenant(`/admin/factures/${cn.id}`, tenantParam)}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      {cn.number ?? "Brouillon d'avoir"}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                    <span className="text-foreground">
                      {cn.status === "draft" ? "Brouillon" : `−${money(cn.totalCents)}`}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 space-y-1 border-t border-border pt-3">
                <div className={rowClass}>
                  <span className="text-muted-foreground">Total crédité</span>
                  <span className="text-foreground">−{money(creditSummary.creditedCents)}</span>
                </div>
                <div className={rowClass}>
                  <span className="text-muted-foreground">Restant créditable</span>
                  <span className="text-foreground">{money(creditSummary.remainingCents)}</span>
                </div>
                {creditSummary.remainingCents <= 0 && (
                  <p className="pt-1 text-sm font-medium text-amber-700 dark:text-amber-400">
                    Facture intégralement créditée
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Historique */}
          <div className={cardClass}>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <History className="h-4 w-4" /> Historique
            </h2>
            <ul className="space-y-2">
              {events.map((e) => (
                <li key={e.id} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <span>
                    {e.message || e.type}
                    <span className="block text-xs opacity-70">
                      {new Date(e.createdAt).toLocaleString("fr-FR")}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Colonne totaux + paiements */}
        <div className="space-y-6">
          <div className={cardClass}>
            <h2 className="mb-3 text-sm font-semibold text-foreground">Totaux</h2>
            <div className={rowClass}>
              <span className="text-muted-foreground">Sous-total</span>
              <span className="text-foreground">{money(invoice.itemsTotalCents)}</span>
            </div>
            {invoice.discountCents > 0 && (
              <div className={rowClass}>
                <span className="text-muted-foreground">Remise</span>
                <span className="text-foreground">−{money(invoice.discountCents)}</span>
              </div>
            )}
            <div className={rowClass}>
              <span className="text-muted-foreground">Total HT</span>
              <span className="text-foreground">{money(invoice.netCents)}</span>
            </div>
            {invoice.vatEnabled && (
              <div className={rowClass}>
                <span className="text-muted-foreground">TVA ({invoice.vatRate}%)</span>
                <span className="text-foreground">{money(invoice.vatCents)}</span>
              </div>
            )}
            <div className="mt-1 flex items-center justify-between border-t border-border pt-2 text-base font-semibold">
              <span className="text-foreground">Total TTC</span>
              <span className="text-foreground">{money(invoice.totalCents)}</span>
            </div>
            {/* Un avoir n'affiche jamais acompte / paiements / « Reste à régler »
                (ce n'est pas une demande de paiement) mais un « Total crédité ». */}
            {isCredit ? (
              <div className="mt-1 flex items-center justify-between border-t border-border pt-2 text-base font-semibold">
                <span className="text-foreground">Total crédité</span>
                <span className="text-primary">−{money(invoice.totalCents)}</span>
              </div>
            ) : (
              <>
                {invoice.depositCents > 0 && (
                  <div className={`${rowClass} mt-1`}>
                    <span className="text-muted-foreground">Acompte réglé</span>
                    <span className="text-foreground">−{money(invoice.depositCents)}</span>
                  </div>
                )}
                {invoice.paidCents > 0 && (
                  <div className={rowClass}>
                    <span className="text-muted-foreground">Paiements</span>
                    <span className="text-foreground">−{money(invoice.paidCents)}</span>
                  </div>
                )}
                <div className="mt-1 flex items-center justify-between border-t border-border pt-2 text-base font-semibold">
                  <span className="text-foreground">Reste à régler</span>
                  <span className={invoice.balanceCents <= 0 ? "text-primary" : "text-foreground"}>
                    {money(invoice.balanceCents)}
                  </span>
                </div>
              </>
            )}

            {/* Traitement fiscal snapshoté (LOT 2B.4). Affiche UNIQUEMENT le choix
                de l'utilisateur — aucune affirmation de conformité. Legacy (null) => rien. */}
            {getTaxTreatmentLabel(invoice.taxTreatment) && (
              <div className="mt-3 border-t border-border pt-3">
                <p className="text-xs font-medium text-muted-foreground">Traitement TVA</p>
                <p className="text-sm text-foreground">{getTaxTreatmentLabel(invoice.taxTreatment)}</p>
                {invoice.taxLegalMention && (
                  <>
                    <p className="mt-2 text-xs font-medium text-muted-foreground">Mention fiscale</p>
                    <p className="text-sm text-foreground whitespace-pre-line">{invoice.taxLegalMention}</p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Paiements — jamais pour un avoir (aucun règlement ne s'y rattache). */}
          {!isCancelled && !isCredit && (
            <div className={cardClass}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">Paiements</h2>
                {invoice.balanceCents > 0 && (
                  <Button size="sm" variant="outline" onClick={() => setShowPayment((s) => !s)}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Ajouter
                  </Button>
                )}
              </div>

              {payments.length === 0 && !showPayment && (
                <p className="text-sm text-muted-foreground">Aucun paiement enregistré.</p>
              )}

              <ul className="space-y-2">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {formatDateLong(p.paidAt)} · {PAYMENT_METHOD_LABEL[p.method] ?? p.method}
                    </span>
                    <span className="text-foreground">{money(p.amountCents)}</span>
                  </li>
                ))}
              </ul>

              {showPayment && (
                <div className="mt-3 space-y-2 border-t border-border pt-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">{`Montant (${displayCurrency})`}</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">Date</label>
                      <input
                        type="date"
                        value={payDate}
                        onChange={(e) => setPayDate(e.target.value)}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Moyen</label>
                    <select
                      value={payMethod}
                      onChange={(e) => setPayMethod(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                    >
                      {Object.entries(PAYMENT_METHOD_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <input
                    type="text"
                    value={payNote}
                    onChange={(e) => setPayNote(e.target.value)}
                    placeholder="Note (facultatif)"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                  />
                  <Button size="sm" className="w-full" onClick={recordPayment} disabled={busy}>
                    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CircleCheck className="mr-2 h-4 w-4" />}
                    Enregistrer le paiement
                  </Button>
                </div>
              )}
            </div>
          )}

          {invoice.internalNote && (
            <div className={cardClass}>
              <h2 className="mb-2 text-sm font-semibold text-foreground">Note interne</h2>
              <p className="text-sm text-muted-foreground whitespace-pre-line">{invoice.internalNote}</p>
              <p className="mt-2 text-xs text-muted-foreground opacity-70">Non visible par le client.</p>
            </div>
          )}

          {/* Rectification comptable : sur une facture émise/payée, on ne
              « supprime » jamais — on crée un AVOIR. La facture d'origine reste
              inchangée. Indisponible dès que la facture est intégralement créditée. */}
          {canCreateCredit && (
            <div className={cardClass}>
              {!showCredit ? (
                <>
                  <Button className="w-full" variant="outline" onClick={() => setShowCredit(true)} disabled={busy}>
                    <ReceiptText className="mr-2 h-4 w-4" /> Créer un avoir
                  </Button>
                  <p className="mt-2 text-center text-xs text-muted-foreground">
                    Rectifie cette facture sans la modifier ni la supprimer.
                  </p>
                </>
              ) : (
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-foreground">Créer un avoir</h2>
                  <div className="space-y-2">
                    <label className="flex items-start gap-2 text-sm text-foreground">
                      <input
                        type="radio"
                        name="creditMode"
                        checked={creditMode === "full"}
                        onChange={() => setCreditMode("full")}
                        className="mt-0.5"
                      />
                      <span>
                        Avoir intégral
                        <span className="block text-xs text-muted-foreground">Crédite la totalité de la facture.</span>
                      </span>
                    </label>
                    <label className="flex items-start gap-2 text-sm text-foreground">
                      <input
                        type="radio"
                        name="creditMode"
                        checked={creditMode === "partial"}
                        onChange={() => setCreditMode("partial")}
                        className="mt-0.5"
                      />
                      <span>
                        Avoir partiel
                        <span className="block text-xs text-muted-foreground">
                          Crée un brouillon dont vous ajustez les lignes avant émission.
                        </span>
                      </span>
                    </label>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Motif de l&apos;avoir (obligatoire)</label>
                    <textarea
                      value={creditReason}
                      onChange={(e) => setCreditReason(e.target.value)}
                      rows={2}
                      placeholder="Ex. Erreur de facturation, geste commercial…"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" className="flex-1" onClick={() => setShowCredit(false)} disabled={busy}>
                      Annuler
                    </Button>
                    <Button className="flex-1" onClick={createCredit} disabled={busy}>
                      {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Créer le brouillon
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
