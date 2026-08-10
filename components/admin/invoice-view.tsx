"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Download,
  Mail,
  Plus,
  Loader2,
  CircleCheck,
  Ban,
  History,
  Copy,
  TriangleAlert,
} from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { formatPrice, formatDateLong } from "@/lib/format"
import { invoiceStatusMeta, PAYMENT_METHOD_LABEL } from "@/lib/invoice/calc"
import { addInvoicePayment, cancelInvoice, sendInvoiceEmail } from "@/lib/invoice/actions"
import type {
  InvoiceRow,
  InvoiceItemRow,
  InvoicePaymentRow,
  InvoiceEventRow,
} from "@/lib/invoice/queries"

const cardClass = "rounded-2xl border border-border bg-card p-5"
const rowClass = "flex items-center justify-between py-1 text-sm"

export function InvoiceView({
  invoice,
  items,
  payments,
  events,
  tenantCountry,
}: {
  invoice: InvoiceRow
  items: InvoiceItemRow[]
  payments: InvoicePaymentRow[]
  events: InvoiceEventRow[]
  tenantCountry?: string | null
}) {
  const router = useRouter()
  const [busy, startBusy] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [showPayment, setShowPayment] = useState(false)
  const [payAmount, setPayAmount] = useState((invoice.balanceCents / 100).toFixed(2))
  const [payMethod, setPayMethod] = useState("transfer")
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10))
  const [payNote, setPayNote] = useState("")

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
      setNotice("Facture envoyée par email au client.")
      router.refresh()
    })
  }

  function doCancel() {
    if (!confirm("Annuler cette facture ? Cette action est définitive.")) return
    setError(null)
    startBusy(async () => {
      const res = await cancelInvoice(invoice.id)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setNotice("Facture annulée.")
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-foreground">{invoice.number}</h1>
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${meta.className}`}
            >
              {meta.label}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Émise le {invoice.issueDate ? formatDateLong(invoice.issueDate) : "—"}
            {invoice.dueDate ? ` · échéance le ${formatDateLong(invoice.dueDate)}` : ""}
          </p>
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
          {!isCancelled && invoice.status !== "draft" && invoice.balanceCents > 0 && (
            <Button onClick={markAsPaid} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CircleCheck className="mr-2 h-4 w-4" />}
              Marquer comme payée
            </Button>
          )}
        </div>
      </div>

      {/* Avertissement non bloquant : SIRET manquant sur une entreprise française.
          N'empêche jamais l'émission, l'envoi ni le paiement de la facture. */}
      {!isCancelled && tenantCountry === "FR" && !invoice.issuerSiret && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Informations légales de l&apos;entreprise incomplètes (SIRET manquant). Complétez-les dans les
            paramètres de facturation pour garantir la conformité de cette facture.
          </span>
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
          {/* Client + véhicule */}
          <div className={cardClass}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <h2 className="mb-2 text-sm font-semibold text-foreground">Client</h2>
                <p className="text-sm text-foreground">{invoice.customerName}</p>
                {invoice.customerEmail && <p className="text-sm text-muted-foreground">{invoice.customerEmail}</p>}
                {invoice.customerPhone && <p className="text-sm text-muted-foreground">{invoice.customerPhone}</p>}
                {invoice.customerAddress && (
                  <p className="text-sm text-muted-foreground whitespace-pre-line">{invoice.customerAddress}</p>
                )}
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
                      <td className="py-2 text-right text-muted-foreground">{formatPrice(it.unitPriceCents)}</td>
                      <td className="py-2 text-right text-foreground">
                        {formatPrice(it.unitPriceCents * it.quantity)}
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
              <span className="text-foreground">{formatPrice(invoice.itemsTotalCents)}</span>
            </div>
            {invoice.discountCents > 0 && (
              <div className={rowClass}>
                <span className="text-muted-foreground">Remise</span>
                <span className="text-foreground">−{formatPrice(invoice.discountCents)}</span>
              </div>
            )}
            <div className={rowClass}>
              <span className="text-muted-foreground">Total HT</span>
              <span className="text-foreground">{formatPrice(invoice.netCents)}</span>
            </div>
            {invoice.vatEnabled && (
              <div className={rowClass}>
                <span className="text-muted-foreground">TVA ({invoice.vatRate}%)</span>
                <span className="text-foreground">{formatPrice(invoice.vatCents)}</span>
              </div>
            )}
            <div className="mt-1 flex items-center justify-between border-t border-border pt-2 text-base font-semibold">
              <span className="text-foreground">Total TTC</span>
              <span className="text-foreground">{formatPrice(invoice.totalCents)}</span>
            </div>
            {invoice.depositCents > 0 && (
              <div className={`${rowClass} mt-1`}>
                <span className="text-muted-foreground">Acompte réglé</span>
                <span className="text-foreground">−{formatPrice(invoice.depositCents)}</span>
              </div>
            )}
            {invoice.paidCents > 0 && (
              <div className={rowClass}>
                <span className="text-muted-foreground">Paiements</span>
                <span className="text-foreground">−{formatPrice(invoice.paidCents)}</span>
              </div>
            )}
            <div className="mt-1 flex items-center justify-between border-t border-border pt-2 text-base font-semibold">
              <span className="text-foreground">Reste à régler</span>
              <span className={invoice.balanceCents <= 0 ? "text-primary" : "text-foreground"}>
                {formatPrice(invoice.balanceCents)}
              </span>
            </div>
          </div>

          {/* Paiements */}
          {!isCancelled && (
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
                    <span className="text-foreground">{formatPrice(p.amountCents)}</span>
                  </li>
                ))}
              </ul>

              {showPayment && (
                <div className="mt-3 space-y-2 border-t border-border pt-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">Montant (€)</label>
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

          {!isCancelled && (
            <Button
              variant="ghost"
              className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={doCancel}
              disabled={busy}
            >
              <Ban className="mr-2 h-4 w-4" /> Annuler la facture
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
