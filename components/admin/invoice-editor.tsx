"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2, Save, FileCheck2, CircleCheck, Loader2, AlertCircle, Car, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatPrice } from "@/lib/format"
import {
  computeInvoice,
  LINE_KIND_LABEL,
  type InvoiceLineKind,
} from "@/lib/invoice/calc"
import {
  saveInvoiceDraft,
  issueInvoice,
  addInvoicePayment,
  deleteDraftInvoice,
  type SaveDraftInput,
} from "@/lib/invoice/actions"
import type { InvoiceRow, InvoiceItemRow } from "@/lib/invoice/queries"

type LineState = {
  key: string
  kind: InvoiceLineKind
  label: string
  description: string
  quantity: number
  unitPriceCents: number
}

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"

function uid() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)
}

/** Convertit des euros saisis en centimes (tolère la virgule française). */
function eurosToCents(v: string): number {
  const n = Number.parseFloat(v.replace(",", "."))
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}
function centsToEuros(c: number): string {
  return (c / 100).toFixed(2)
}

export function InvoiceEditor({ invoice, items }: { invoice: InvoiceRow; items: InvoiceItemRow[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [issuing, startIssue] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // -- État éditable ---------------------------------------------------------
  const [lines, setLines] = useState<LineState[]>(
    items.map((it) => ({
      key: String(it.id),
      kind: it.kind as InvoiceLineKind,
      label: it.label,
      description: it.description ?? "",
      quantity: it.quantity,
      unitPriceCents: it.unitPriceCents,
    })),
  )
  const [discountEuros, setDiscountEuros] = useState(centsToEuros(invoice.discountCents))
  const [vatEnabled, setVatEnabled] = useState(invoice.vatEnabled)
  const [vatRate, setVatRate] = useState(String(invoice.vatRate))
  const [customerName, setCustomerName] = useState(invoice.customerName)
  const [customerEmail, setCustomerEmail] = useState(invoice.customerEmail ?? "")
  const [customerPhone, setCustomerPhone] = useState(invoice.customerPhone ?? "")
  const [customerAddress, setCustomerAddress] = useState(invoice.customerAddress ?? "")
  const [vehicleTypeName, setVehicleTypeName] = useState(invoice.vehicleTypeName ?? "")
  const [vehicleBrand, setVehicleBrand] = useState(invoice.vehicleBrand ?? "")
  const [vehicleModel, setVehicleModel] = useState(invoice.vehicleModel ?? "")
  const [vehiclePlate, setVehiclePlate] = useState(invoice.vehiclePlate ?? "")
  const [serviceDate, setServiceDate] = useState(invoice.serviceDate ?? "")
  const [dueDate, setDueDate] = useState(invoice.dueDate ?? "")
  const [customerComment, setCustomerComment] = useState(invoice.customerComment ?? "")
  const [internalNote, setInternalNote] = useState(invoice.internalNote ?? "")

  // -- Recalcul live ---------------------------------------------------------
  const totals = useMemo(
    () =>
      computeInvoice({
        lines: lines.map((l) => ({ kind: l.kind, quantity: l.quantity, unitPriceCents: l.unitPriceCents })),
        discountCents: eurosToCents(discountEuros),
        vatEnabled,
        vatRate: Number.parseFloat(vatRate.replace(",", ".")) || 0,
        depositCents: invoice.depositCents,
        paidCents: 0,
      }),
    [lines, discountEuros, vatEnabled, vatRate, invoice.depositCents],
  )

  // -- Manipulation des lignes ----------------------------------------------
  function updateLine(key: string, patch: Partial<LineState>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }
  function removeLine(key: string) {
    setLines((ls) => ls.filter((l) => l.key !== key))
  }
  function addLine(kind: InvoiceLineKind) {
    setLines((ls) => [...ls, { key: uid(), kind, label: "", description: "", quantity: 1, unitPriceCents: 0 }])
  }

  function buildPayload(): SaveDraftInput {
    return {
      invoiceId: invoice.id,
      discountCents: eurosToCents(discountEuros),
      vatEnabled,
      vatRate: Number.parseFloat(vatRate.replace(",", ".")) || 0,
      customerName,
      customerEmail: customerEmail || null,
      customerPhone: customerPhone || null,
      customerAddress: customerAddress || null,
      vehicleTypeName: vehicleTypeName || null,
      vehicleBrand: vehicleBrand || null,
      vehicleModel: vehicleModel || null,
      vehiclePlate: vehiclePlate || null,
      serviceDate: serviceDate || null,
      dueDate: dueDate || null,
      customerComment: customerComment || null,
      internalNote: internalNote || null,
      lines: lines.map((l) => ({
        kind: l.kind,
        label: l.label,
        description: l.description || null,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
      })),
    }
  }

  function save(after?: () => void) {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const res = await saveInvoiceDraft(buildPayload())
      if (!res.ok) {
        setError(res.error)
        return
      }
      setNotice("Brouillon enregistré.")
      router.refresh()
      after?.()
    })
  }

  function issue() {
    setError(null)
    startIssue(async () => {
      // On sauvegarde d'abord pour figer les dernières modifications.
      const saved = await saveInvoiceDraft(buildPayload())
      if (!saved.ok) {
        setError(saved.error)
        return
      }
      const res = await issueInvoice(invoice.id)
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  // Point 9 : émet la facture puis la solde immédiatement (statut « Payée »).
  // Réutilise le même chemin serveur que l'ajout de paiement, qui bascule la
  // facture en « Payée » quand le solde atteint 0 (et alimente le CA).
  function issueAndMarkPaid() {
    setError(null)
    setNotice(null)
    startIssue(async () => {
      const saved = await saveInvoiceDraft(buildPayload())
      if (!saved.ok) {
        setError(saved.error)
        return
      }
      const issued = await issueInvoice(invoice.id)
      if (!issued.ok) {
        setError(issued.error)
        return
      }
      // Solde restant = total TTC − acompte déjà réglé.
      const balanceCents = Math.max(0, totals.totalCents - totals.depositCents)
      if (balanceCents > 0) {
        const paid = await addInvoicePayment({
          invoiceId: invoice.id,
          amountCents: balanceCents,
          method: "transfer",
          paidAt: new Date().toISOString().slice(0, 10),
          note: "Facture émise et marquée comme payée",
        })
        if (!paid.ok) {
          setError(paid.error)
          return
        }
      }
      router.refresh()
    })
  }

  function remove() {
    if (!confirm("Supprimer définitivement ce brouillon ?")) return
    startTransition(async () => {
      const res = await deleteDraftInvoice(invoice.id)
      if (!res.ok) setError(res.error)
      else router.push("/admin/factures")
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Brouillon de facture</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Vérifiez et ajustez les informations, puis émettez la facture définitive.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={pending} onClick={() => save()}>
            {pending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
            Enregistrer
          </Button>
          <Button size="sm" variant="secondary" disabled={issuing} onClick={issueAndMarkPaid}>
            {issuing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CircleCheck className="mr-1.5 h-4 w-4" />}
            Émettre &amp; marquer payée
          </Button>
          <Button size="sm" disabled={issuing} onClick={issue}>
            {issuing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileCheck2 className="mr-1.5 h-4 w-4" />}
            Émettre la facture
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-600">
          {notice}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Lignes de la facture */}
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Lignes</h2>
            <div className="space-y-3">
              {lines.length === 0 && (
                <p className="text-sm text-muted-foreground">Aucune ligne. Ajoutez-en une ci-dessous.</p>
              )}
              {lines.map((l) => (
                <div key={l.key} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={l.kind}
                      onChange={(e) => updateLine(l.key, { kind: e.target.value as InvoiceLineKind })}
                      aria-label="Type de ligne"
                      className="rounded-lg border border-border bg-background px-2 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
                    >
                      {(Object.keys(LINE_KIND_LABEL) as InvoiceLineKind[]).map((k) => (
                        <option key={k} value={k}>
                          {LINE_KIND_LABEL[k]}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={l.label}
                      onChange={(e) => updateLine(l.key, { label: e.target.value })}
                      placeholder="Désignation"
                      aria-label="Désignation"
                      className={`${inputClass} flex-1 min-w-[8rem]`}
                    />
                    <button
                      type="button"
                      onClick={() => removeLine(l.key)}
                      aria-label="Supprimer la ligne"
                      className="rounded-md p-2 text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={l.description}
                    onChange={(e) => updateLine(l.key, { description: e.target.value })}
                    placeholder="Description (facultatif)"
                    aria-label="Description"
                    className={`${inputClass} mt-2`}
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      Qté
                      <input
                        type="number"
                        min={1}
                        value={l.quantity}
                        onChange={(e) => updateLine(l.key, { quantity: Math.max(1, Number(e.target.value)) })}
                        className="w-16 rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none"
                      />
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      P.U. €
                      <input
                        type="text"
                        inputMode="decimal"
                        defaultValue={centsToEuros(l.unitPriceCents)}
                        onChange={(e) => updateLine(l.key, { unitPriceCents: eurosToCents(e.target.value) })}
                        className="w-24 rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none"
                      />
                    </label>
                    <span className="ml-auto text-sm font-medium text-foreground">
                      {formatPrice(l.quantity * l.unitPriceCents)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => addLine("service")}>
                <Plus className="mr-1.5 h-4 w-4" /> Prestation
              </Button>
              <Button variant="outline" size="sm" onClick={() => addLine("option")}>
                <Plus className="mr-1.5 h-4 w-4" /> Option
              </Button>
              <Button variant="outline" size="sm" onClick={() => addLine("fee")}>
                <Plus className="mr-1.5 h-4 w-4" /> Frais
              </Button>
            </div>
          </section>

          {/* Client */}
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <User className="h-4 w-4" /> Client
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nom" value={customerName} onChange={setCustomerName} />
              <Field label="Email" value={customerEmail} onChange={setCustomerEmail} type="email" />
              <Field label="Téléphone" value={customerPhone} onChange={setCustomerPhone} />
              <Field label="Adresse" value={customerAddress} onChange={setCustomerAddress} className="sm:col-span-2" />
            </div>
          </section>

          {/* Véhicule */}
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <Car className="h-4 w-4" /> Véhicule
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Type" value={vehicleTypeName} onChange={setVehicleTypeName} />
              <Field label="Immatriculation" value={vehiclePlate} onChange={setVehiclePlate} />
              <Field label="Marque" value={vehicleBrand} onChange={setVehicleBrand} />
              <Field label="Modèle" value={vehicleModel} onChange={setVehicleModel} />
            </div>
          </section>

          {/* Commentaire & note */}
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Commentaire & note
            </h2>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">
                  Commentaire (visible sur la facture)
                </label>
                <textarea
                  value={customerComment}
                  onChange={(e) => setCustomerComment(e.target.value)}
                  rows={2}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Note interne (jamais imprimée)</label>
                <textarea
                  value={internalNote}
                  onChange={(e) => setInternalNote(e.target.value)}
                  rows={2}
                  className={inputClass}
                />
              </div>
            </div>
          </section>
        </div>

        {/* Colonne latérale : totaux + réglages */}
        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Totaux</h2>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Sous-total</span>
                <span className="font-medium text-foreground">{formatPrice(totals.itemsTotalCents)}</span>
              </div>
              <label className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Remise €</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={discountEuros}
                  onChange={(e) => setDiscountEuros(e.target.value)}
                  className="w-24 rounded-lg border border-border bg-background px-2 py-1.5 text-right text-sm text-foreground focus:border-primary focus:outline-none"
                />
              </label>
              <div className="flex items-center justify-between border-t border-border pt-3">
                <span className="text-muted-foreground">Total HT</span>
                <span className="font-medium text-foreground">{formatPrice(totals.netCents)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={vatEnabled}
                    onChange={(e) => setVatEnabled(e.target.checked)}
                    className="h-4 w-4 rounded border-border"
                  />
                  TVA
                </label>
                {vatEnabled && (
                  <span className="flex items-center gap-1">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={vatRate}
                      onChange={(e) => setVatRate(e.target.value)}
                      className="w-16 rounded-lg border border-border bg-background px-2 py-1.5 text-right text-sm text-foreground focus:border-primary focus:outline-none"
                    />
                    <span className="text-muted-foreground">%</span>
                  </span>
                )}
                <span className="font-medium text-foreground">{formatPrice(totals.vatCents)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-3 text-base">
                <span className="font-semibold text-foreground">Total TTC</span>
                <span className="font-semibold text-foreground">{formatPrice(totals.totalCents)}</span>
              </div>
              {totals.depositCents > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Acompte déjà réglé</span>
                  <span className="text-foreground">−{formatPrice(totals.depositCents)}</span>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-border pt-3">
                <span className="font-semibold text-foreground">Reste à régler</span>
                <span className="font-semibold text-primary">{formatPrice(totals.balanceCents)}</span>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Dates</h2>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Date de la prestation</label>
                <input
                  type="date"
                  value={serviceDate}
                  onChange={(e) => setServiceDate(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Échéance (facultatif)</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </section>

          <button
            type="button"
            onClick={remove}
            className="text-sm text-muted-foreground transition-colors hover:text-destructive"
          >
            Supprimer ce brouillon
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  className,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  className?: string
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
      />
    </div>
  )
}
