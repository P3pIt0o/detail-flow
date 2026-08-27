"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { RotateCcw, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { formatPrice } from "@/lib/format"
import { refundPaymentAction } from "@/app/admin/(dashboard)/reservations/[id]/actions"

/** Ligne de remboursement affichée dans l'historique (données déjà masquées). */
export type RefundHistoryRow = {
  id: number
  amountCents: number
  status: string
  reason: string | null
  externalRefundIdMasked: string | null
}

/** Paiement remboursable (montants recalculés côté serveur). */
export type RefundablePaymentView = {
  paymentId: number
  type: string
  grossAmountCents: number
  refundedAmountCents: number
  refundableCents: number
  refunds: RefundHistoryRow[]
}

const STATUS_FR: Record<string, string> = {
  requested: "Demandé",
  pending: "En attente",
  succeeded: "Effectué",
  failed: "Échoué",
  canceled: "Annulé",
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "succeeded") return "default"
  if (status === "failed" || status === "canceled") return "destructive"
  return "secondary"
}

/**
 * Bouton + fenêtre de remboursement Stripe (admin tenant, OWNER/ADMIN).
 * Le navigateur n'est JAMAIS la source de vérité : montants remboursables,
 * compte Stripe et autorisation sont relus/vérifiés côté serveur. Le statut
 * définitif est confirmé par webhook. Double clic neutralisé (transition +
 * bouton désactivé + clé d'idempotence stable par tentative).
 */
export function RefundPaymentDialog({
  bookingId,
  payments,
}: {
  bookingId: number
  payments: RefundablePaymentView[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  // Paiement sélectionné (le premier remboursable par défaut).
  const refundable = payments.filter((p) => p.refundableCents > 0)
  const [paymentId, setPaymentId] = useState<number | null>(refundable[0]?.paymentId ?? null)
  const selected = payments.find((p) => p.paymentId === paymentId) ?? null

  const [mode, setMode] = useState<"full" | "partial">("full")
  const [amountStr, setAmountStr] = useState("")
  const [reason, setReason] = useState("")
  const [confirmChecked, setConfirmChecked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Clé d'idempotence STABLE pour la tentative courante (régénérée à chaque
  // ouverture / changement de paiement). Un double clic réutilise la même clé.
  const idempotencyKey = useMemo(() => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
    return `${bookingId}-${paymentId}-${Date.now()}-${Math.random().toString(36).slice(2)}`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, paymentId])

  const maxRefundable = selected?.refundableCents ?? 0
  const amountCents = mode === "full" ? maxRefundable : Math.round(Number(amountStr.replace(",", ".")) * 100)
  const amountValid =
    Number.isFinite(amountCents) && amountCents > 0 && amountCents <= maxRefundable && maxRefundable > 0
  const canSubmit = Boolean(selected) && amountValid && reason.trim().length > 0 && confirmChecked && !pending

  function reset() {
    setMode("full")
    setAmountStr("")
    setReason("")
    setConfirmChecked(false)
    setError(null)
    setSuccess(null)
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) reset()
  }

  function handleSubmit() {
    if (!selected || !canSubmit) return
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      const res = await refundPaymentAction({
        bookingId,
        paymentId: selected.paymentId,
        amountCents,
        reason: reason.trim(),
        idempotencyKey,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      const label =
        res.status === "succeeded"
          ? "Remboursement effectué."
          : "Remboursement en cours de traitement. La confirmation définitive arrivera automatiquement."
      setSuccess(res.duplicate ? "Ce remboursement a déjà été enregistré." : label)
      setConfirmChecked(false)
      router.refresh()
    })
  }

  // Aucun paiement du tout : ne rien afficher.
  if (payments.length === 0) return null

  const hasRefundable = refundable.length > 0

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => handleOpenChange(true)}>
        <RotateCcw className="mr-1.5 h-4 w-4" />
        Rembourser un paiement
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Rembourser un paiement</DialogTitle>
          </DialogHeader>

          {!hasRefundable ? (
            <p className="py-4 text-sm text-muted-foreground">
              Aucun montant n&apos;est remboursable pour cette réservation (paiement déjà intégralement remboursé ou
              non encaissé).
            </p>
          ) : (
            <div className="space-y-4">
              {/* Sélection du paiement (si plusieurs remboursables) */}
              {refundable.length > 1 && (
                <div className="space-y-1.5">
                  <Label>Paiement à rembourser</Label>
                  <div className="flex flex-col gap-2">
                    {refundable.map((p) => (
                      <button
                        key={p.paymentId}
                        type="button"
                        onClick={() => setPaymentId(p.paymentId)}
                        className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                          p.paymentId === paymentId
                            ? "border-primary bg-primary/5"
                            : "border-border hover:bg-muted"
                        }`}
                      >
                        <span className="text-foreground">
                          {p.type === "deposit" ? "Acompte" : "Paiement intégral"}
                        </span>
                        <span className="font-medium text-foreground">
                          {formatPrice(p.refundableCents)} remb.
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selected && (
                <>
                  {/* Récapitulatif des montants */}
                  <dl className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Montant initial payé</dt>
                      <dd className="font-medium text-foreground">{formatPrice(selected.grossAmountCents)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Déjà remboursé</dt>
                      <dd className="text-foreground">{formatPrice(selected.refundedAmountCents)}</dd>
                    </div>
                    <div className="flex justify-between border-t border-border pt-1.5">
                      <dt className="font-semibold text-foreground">Encore remboursable</dt>
                      <dd className="font-semibold text-primary">{formatPrice(selected.refundableCents)}</dd>
                    </div>
                  </dl>

                  {/* Type de remboursement */}
                  <div className="space-y-1.5">
                    <Label>Type de remboursement</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={mode === "full" ? "default" : "outline"}
                        onClick={() => setMode("full")}
                      >
                        Total
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={mode === "partial" ? "default" : "outline"}
                        onClick={() => setMode("partial")}
                      >
                        Partiel
                      </Button>
                    </div>
                  </div>

                  {/* Montant partiel */}
                  {mode === "partial" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="refund-amount">Montant à rembourser (€)</Label>
                      <Input
                        id="refund-amount"
                        inputMode="decimal"
                        placeholder="0,00"
                        value={amountStr}
                        onChange={(e) => setAmountStr(e.target.value)}
                      />
                      {amountStr.length > 0 && !amountValid && (
                        <p className="text-xs text-destructive">
                          Le montant doit être compris entre 0,01 € et {formatPrice(maxRefundable)}.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Motif obligatoire */}
                  <div className="space-y-1.5">
                    <Label htmlFor="refund-reason">Motif (obligatoire)</Label>
                    <Textarea
                      id="refund-reason"
                      rows={2}
                      placeholder="Ex. : prestation annulée par le client"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </div>

                  {/* Avertissement */}
                  <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-foreground">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <span>
                      Le remboursement de <strong>{formatPrice(amountValid ? amountCents : 0)}</strong> sera effectué sur
                      le moyen de paiement du client. Le délai d&apos;apparition dépend de sa banque. Cette action ne
                      peut pas être annulée.
                    </span>
                  </div>

                  {/* Double confirmation */}
                  <label className="flex items-start gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4"
                      checked={confirmChecked}
                      onChange={(e) => setConfirmChecked(e.target.checked)}
                    />
                    <span>Je confirme vouloir rembourser ce montant.</span>
                  </label>

                  {error && <p className="text-sm text-destructive">{error}</p>}
                  {success && <p className="text-sm text-primary">{success}</p>}
                </>
              )}

              {/* Historique */}
              {selected && selected.refunds.length > 0 && (
                <div className="space-y-2 border-t border-border pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Historique des remboursements
                  </p>
                  <ul className="space-y-1.5">
                    {selected.refunds.map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                        <div className="flex items-center gap-2">
                          <Badge variant={statusVariant(r.status)}>{STATUS_FR[r.status] ?? r.status}</Badge>
                          {r.reason && <span className="text-muted-foreground">{r.reason}</span>}
                        </div>
                        <span className="font-medium text-foreground">{formatPrice(r.amountCents)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={pending}>
              Fermer
            </Button>
            {hasRefundable && (
              <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
                {pending ? "Traitement…" : "Confirmer le remboursement"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
