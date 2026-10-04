import { formatDateFr } from "@/lib/customer-subscriptions/contract-summary"
import { formatEuros } from "@/lib/customer-subscriptions/plan-form"
import { EMAIL_STATUS_UI, PAYMENT_STATUS_UI, PAYMENT_TYPE_LABELS, emailTypeLabel } from "@/lib/customer-subscriptions/admin-labels"
import { ToneBadge } from "./ui"

type PaymentItem = {
  id: number
  type: string
  status: string
  grossAmountCents: number
  refundedAmountCents: number
  createdAt: Date
  paidAt: Date | null
  customerName?: string
}

export function PaymentsList({ payments }: { payments: PaymentItem[] }) {
  return (
    <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
      {payments.map((p) => {
        const st = PAYMENT_STATUS_UI[p.status] ?? { label: "En cours de traitement", tone: "neutral" as const }
        const type = PAYMENT_TYPE_LABELS[p.type] ?? "Paiement"
        return (
          <li key={p.id} className="flex items-center justify-between gap-3 p-4">
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="truncate text-sm font-medium text-foreground">{p.customerName ?? type}</p>
              <p className="text-xs text-muted-foreground">
                {p.customerName ? `${type} · ` : ""}
                {formatDateFr(p.paidAt ?? p.createdAt)}
                {p.refundedAmountCents > 0 ? ` · ${formatEuros(p.refundedAmountCents)} remboursés` : ""}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="text-sm font-semibold text-foreground">{formatEuros(p.grossAmountCents)}</span>
              <ToneBadge tone={st.tone}>{st.label}</ToneBadge>
            </div>
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
                {e.recipientRole === "customer" ? `À ${e.customerName ?? "votre client"}` : "À vous"} · {formatDateFr(e.sentAt ?? e.sendAt)}
              </p>
            </div>
            <ToneBadge tone={st.tone}>{st.label}</ToneBadge>
          </li>
        )
      })}
    </ul>
  )
}
