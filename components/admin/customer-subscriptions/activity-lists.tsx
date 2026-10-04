import { formatDateFr } from "@/lib/customer-subscriptions/contract-summary"
import { formatEuros } from "@/lib/customer-subscriptions/plan-form"
import { EMAIL_STATUS_UI, PAYMENT_STATUS_UI, PAYMENT_TYPE_LABELS, emailTypeLabel } from "@/lib/customer-subscriptions/admin-labels"
import { ToneBadge } from "./ui"

type PaymentItem = {
  id: number
  type: string
  status: string
  grossAmountCents: number | null
  providerFeeAmountCents?: number | null
  platformFeeAmountCents?: number | null
  netAmountCents?: number | null
  refundedAmountCents: number | null
  createdAt: Date
  paidAt: Date | null
  customerName?: string
}

/** Montant d'un snapshot réel ; absent → « — » (jamais recalculé). */
const amount = (cents: number | null | undefined) => (typeof cents === "number" ? formatEuros(cents) : "—")

export function PaymentsList({ payments }: { payments: PaymentItem[] }) {
  return (
    <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
      {payments.map((p) => {
        const st = PAYMENT_STATUS_UI[p.status] ?? { label: "En cours de traitement", tone: "neutral" as const }
        const type = PAYMENT_TYPE_LABELS[p.type] ?? "Paiement"
        const breakdown = [
          { label: "Brut", value: amount(p.grossAmountCents) },
          { label: "Frais de paiement", value: amount(p.providerFeeAmountCents) },
          { label: "Commission DetailFlow", value: amount(p.platformFeeAmountCents) },
          { label: "Net", value: amount(p.netAmountCents) },
          { label: "Remboursé", value: p.refundedAmountCents ? amount(p.refundedAmountCents) : "—" },
        ]
        return (
          <li key={p.id} className="flex flex-col gap-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="truncate text-sm font-medium text-foreground">{p.customerName ?? type}</p>
                <p className="text-xs text-muted-foreground">
                  {p.customerName ? `${type} · ` : ""}
                  {formatDateFr(p.paidAt ?? p.createdAt)}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-sm font-semibold text-foreground">{amount(p.grossAmountCents)}</span>
                <ToneBadge tone={st.tone}>{st.label}</ToneBadge>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-muted/50 p-3 text-xs sm:grid-cols-5">
              {breakdown.map((b) => (
                <div key={b.label} className="flex justify-between gap-2 sm:flex-col sm:justify-start">
                  <dt className="text-muted-foreground">{b.label}</dt>
                  <dd className="font-medium tabular-nums text-foreground">{b.value}</dd>
                </div>
              ))}
            </dl>
          </li>
        )
      })}
    </ul>
  )
}

type EmailItem = { id: number; type: string; recipientRole: string; status: string; sendAt: Date; sentAt: Date | null; customerName?: string | null }

export function EmailsList({ emails }: { emails: EmailItem[] }) {
  return (
    <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
      {emails.map((e) => {
        const st = EMAIL_STATUS_UI[e.status] ?? { label: "Programmé", tone: "neutral" as const }
        return (
          <li key={e.id} className="flex items-center justify-between gap-3 p-4">
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="truncate text-sm font-medium text-foreground">{emailTypeLabel(e.type)}</p>
              <p className="truncate text-xs text-muted-foreground">
                {e.recipientRole === "client" ? `Client · ${e.customerName ?? "votre client"}` : "Professionnel · vous"} · {formatDateFr(e.sentAt ?? e.sendAt)}
              </p>
            </div>
            <ToneBadge tone={st.tone}>{st.label}</ToneBadge>
          </li>
        )
      })}
    </ul>
  )
}
