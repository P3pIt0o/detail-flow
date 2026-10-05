import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { requireAdmin } from "@/lib/admin"
import { requireCompanyId } from "@/lib/tenant"
import { getSubscriptionDetail } from "@/lib/customer-subscriptions/admin-queries"
import { buildSubscriptionContractSummary, formatDateFr } from "@/lib/customer-subscriptions/contract-summary"
import { commitmentSentence, formatEuros, perIntervalShort, reminderSentence, renewalSentence } from "@/lib/customer-subscriptions/plan-form"
import { subscriptionStatusUi } from "@/lib/customer-subscriptions/admin-labels"
import { EmptyState, InfoRow, SectionCard, ToneBadge } from "@/components/admin/customer-subscriptions/ui"
import { EmailsList, PaymentsList } from "@/components/admin/customer-subscriptions/activity-lists"
import { EarlyCancellationCard } from "@/components/admin/customer-subscriptions/early-cancellation-card"
import { ResendPaymentLinkButton } from "@/components/admin/customer-subscriptions/resend-payment-link-button"

export const metadata: Metadata = { title: "Abonnement" }
export const dynamic = "force-dynamic"

export default async function SubscriptionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  const companyId = await requireCompanyId()
  const { id } = await params
  const subscriptionId = Number(id)
  if (!Number.isInteger(subscriptionId) || subscriptionId <= 0) notFound()
  const detail = await getSubscriptionDetail(companyId, subscriptionId)
  if (!detail) notFound()

  const { subscription: s, vehicle } = detail
  const summary = buildSubscriptionContractSummary(s)
  const status = subscriptionStatusUi(s.status)
  const hasCommitment = summary.commitment.unit !== "none"
  const recurring = summary.paymentMode === "recurring"
  const commitmentEnd = summary.commitment.endsAt ?? summary.termEndsAt
  const pendingCancellations = detail.cancellations.filter((c) => c.status === "pending")

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/admin/abonnements-clients?vue=abonnes" className="text-sm text-muted-foreground hover:text-foreground">
          ← Abonnés
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-foreground text-balance">{s.customerName}</h1>
          <ToneBadge tone={status.tone}>{status.label}</ToneBadge>
        </div>
        <p className="text-sm text-muted-foreground">
          {summary.planName} · {formatEuros(summary.price.amountCents)} {perIntervalShort(summary.interval.unit, summary.interval.count)}
        </p>
        {s.status === "pending_payment" ? <ResendPaymentLinkButton subscriptionId={s.id} /> : null}
      </div>

      {pendingCancellations.map((c) => (
        <EarlyCancellationCard
          key={c.id}
          request={{
            id: c.id,
            subscriptionId: s.id,
            customerName: s.customerName,
            vehicle,
            planName: summary.planName,
            requestedAt: formatDateFr(c.createdAt),
            commitment: commitmentSentence(summary.commitment.unit, summary.commitment.count),
            contractEndsAt: commitmentEnd ? formatDateFr(commitmentEnd) : null,
            message: c.customerMessage,
          }}
        />
      ))}

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Contrat">
          <dl className="flex flex-col gap-3">
            {vehicle && <InfoRow label="Véhicule">{vehicle}</InfoRow>}
            <InfoRow label="Prestations incluses">
              {summary.usesPerCycle} × {summary.includedServiceName ?? "prestation"}
            </InfoRow>
            <InfoRow label="Paiement">{recurring ? "Automatique à chaque échéance" : "Payé d'avance"}</InfoRow>
            <InfoRow label="Engagement">{commitmentSentence(summary.commitment.unit, summary.commitment.count)}</InfoRow>
            {hasCommitment && commitmentEnd && <InfoRow label="Fin prévue au contrat">{formatDateFr(commitmentEnd)}</InfoRow>}
            <InfoRow label="Ensuite">{renewalSentence(summary.renewal.mode, hasCommitment, recurring)}</InfoRow>
            {summary.activatedAt && <InfoRow label="Démarré le">{formatDateFr(summary.activatedAt)}</InfoRow>}
            {summary.nextBillingAt && <InfoRow label="Prochaine échéance">{formatDateFr(summary.nextBillingAt)}</InfoRow>}
            {summary.prepaidUntil && <InfoRow label="Payé jusqu'au">{formatDateFr(summary.prepaidUntil)}</InfoRow>}
            {summary.cancelAt && <InfoRow label="Se termine le">{formatDateFr(summary.cancelAt)}</InfoRow>}
            {recurring && <InfoRow label="Rappel">{reminderSentence(summary.renewal.noticeDays)}</InfoRow>}
          </dl>
        </SectionCard>
        <SectionCard title="Client">
          <dl className="flex flex-col gap-3">
            <InfoRow label="Email">
              <a href={`mailto:${s.customerEmail}`} className="text-primary underline-offset-4 hover:underline">
                {s.customerEmail}
              </a>
            </InfoRow>
            {s.customerPhone && (
              <InfoRow label="Téléphone">
                <a href={`tel:${s.customerPhone}`} className="text-primary underline-offset-4 hover:underline">
                  {s.customerPhone}
                </a>
              </InfoRow>
            )}
          </dl>
        </SectionCard>
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="pay-title">
        <h2 id="pay-title" className="text-base font-semibold text-foreground">
          Paiements
        </h2>
        {detail.payments.length ? <PaymentsList payments={detail.payments} /> : <EmptyState title="Aucun paiement pour l'instant" />}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="mail-title">
        <h2 id="mail-title" className="text-base font-semibold text-foreground">
          Emails
        </h2>
        {detail.emails.length ? (
          <EmailsList emails={detail.emails.map((e) => ({ ...e, customerName: s.customerName }))} />
        ) : (
          <EmptyState title="Aucun email pour l'instant" />
        )}
      </section>
    </div>
  )
}
