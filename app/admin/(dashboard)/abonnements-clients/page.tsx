import type { Metadata } from "next"
import Link from "next/link"
import { requireAdmin } from "@/lib/admin"
import { requireCompanyId } from "@/lib/tenant"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { getAdminOverview, planRowToConfig } from "@/lib/customer-subscriptions/admin-queries"
import { buildChecklist, LIVE_STATUSES, planChanges } from "@/lib/customer-subscriptions/admin-view"
import { buildSubscriptionContractSummary, formatDateFr } from "@/lib/customer-subscriptions/contract-summary"
import { commitmentSentence, formatEuros, perIntervalShort } from "@/lib/customer-subscriptions/plan-form"
import { PLAN_STATUS_UI, VISIBILITY_UI, subscriptionStatusUi } from "@/lib/customer-subscriptions/admin-labels"
import { EmailsList, PaymentsList } from "@/components/admin/customer-subscriptions/activity-lists"
import { EmptyState, SectionCard, ToneBadge } from "@/components/admin/customer-subscriptions/ui"
import { PublicModeCard } from "@/components/admin/customer-subscriptions/public-mode-card"
import { RequestCard, type RequestCardData } from "@/components/admin/customer-subscriptions/request-card"
import { EarlyCancellationCard } from "@/components/admin/customer-subscriptions/early-cancellation-card"

export const metadata: Metadata = { title: "Abonnements clients" }
export const dynamic = "force-dynamic"

const VIEWS = [
  { key: "a-traiter", label: "À traiter" },
  { key: "formules", label: "Formules" },
  { key: "abonnes", label: "Abonnés" },
  { key: "paiements", label: "Paiements" },
  { key: "emails", label: "Emails" },
] as const
type ViewKey = (typeof VIEWS)[number]["key"]

const BASE = "/admin/abonnements-clients"

export default async function AbonnementsClientsPage({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  await requireAdmin()
  const companyId = await requireCompanyId()
  const [{ vue }, data] = await Promise.all([searchParams, getAdminOverview(companyId)])
  const view: ViewKey = VIEWS.some((v) => v.key === vue) ? (vue as ViewKey) : "a-traiter"

  const { company } = data
  const paymentsReady = Boolean(company.stripeAccountId && company.stripeChargesEnabled && company.paymentsEnabled)
  const hasActivePlan = data.plans.some((p) => p.status === "active")
  const checklist = buildChecklist({ paymentsReady, hasActivePlan, publicMode: company.publicMode })
  const toProcess = data.requests.length + data.earlyCancellations.length
  const liveSubs = data.subscriptions.filter((s) => LIVE_STATUSES.has(s.status))
  const pastDue = data.subscriptions.filter((s) => s.status === "past_due").length
  const counts: Partial<Record<ViewKey, number>> = { "a-traiter": toProcess }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-foreground text-balance">Abonnements clients</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Proposez des formules d&apos;entretien régulier à vos clients et suivez leurs paiements.
          </p>
        </div>
        <Button render={<Link href={`${BASE}/formules/nouvelle`} />} nativeButton={false} className="w-full sm:w-auto">
          Nouvelle formule
        </Button>
      </header>

      {checklist.some((c) => !c.done) && (
        <SectionCard title="Pour bien démarrer" description="Trois étapes pour proposer vos premiers abonnements.">
          <ol className="flex flex-col gap-3">
            {checklist.map((c, i) => (
              <li key={c.key} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
                    c.done ? "border-success bg-success text-success-foreground" : "border-border text-muted-foreground",
                  )}
                >
                  {c.done ? "✓" : i + 1}
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className={cn("text-sm font-medium", c.done ? "text-muted-foreground line-through" : "text-foreground")}>
                    {c.label}
                    <span className="sr-only">{c.done ? " (fait)" : " (à faire)"}</span>
                  </p>
                  {!c.done && (
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {c.help}{" "}
                      {c.href && (
                        <Link href={c.href} className="font-medium text-primary underline-offset-4 hover:underline">
                          Commencer
                        </Link>
                      )}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </SectionCard>
      )}

      <dl className="grid grid-cols-3 gap-3">
        {[
          { label: "Abonnés en cours", value: liveSubs.length },
          { label: "À traiter", value: toProcess },
          { label: "Paiements à régulariser", value: pastDue },
        ].map((s) => (
          <div key={s.label} className="flex flex-col gap-1 rounded-xl border border-border bg-card p-3 sm:p-4">
            <dt className="text-xs leading-snug text-muted-foreground">{s.label}</dt>
            <dd className="text-2xl font-semibold text-foreground">{s.value}</dd>
          </div>
        ))}
      </dl>

      <PublicModeCard mode={company.publicMode} canPublish={paymentsReady && hasActivePlan} />

      <nav aria-label="Sections" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex min-w-max gap-1 border-b border-border">
          {VIEWS.map((v) => (
            <li key={v.key}>
              <Link
                href={`${BASE}?vue=${v.key}`}
                aria-current={view === v.key ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                  view === v.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {v.label}
                {!!counts[v.key] && (
                  <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{counts[v.key]}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {view === "a-traiter" && <ToProcessView data={data} />}
      {view === "formules" && <PlansView plans={data.plans} />}
      {view === "abonnes" && <SubscribersView subscriptions={data.subscriptions} />}
      {view === "paiements" && <PaymentsView payments={data.payments} />}
      {view === "emails" && <EmailsView emails={data.emails} />}
    </div>
  )
}

type Overview = Awaited<ReturnType<typeof getAdminOverview>>

function ToProcessView({ data }: { data: Overview }) {
  if (!data.requests.length && !data.earlyCancellations.length) {
    return <EmptyState title="Rien à traiter pour le moment">Les nouvelles demandes de vos clients apparaîtront ici.</EmptyState>
  }
  const requests: RequestCardData[] = data.requests.map((r) => ({
    id: r.id,
    customerName: r.customerName,
    customerEmail: r.customerEmail,
    customerPhone: r.customerPhone,
    vehicle: [r.vehicleBrand, r.vehicleModel, r.vehiclePlate ? `· ${r.vehiclePlate}` : ""].filter(Boolean).join(" "),
    message: r.message,
    createdAt: formatDateFr(r.createdAt),
    expiresAt: r.expiresAt ? formatDateFr(r.expiresAt) : null,
    planName: r.planSnapshot.name,
    priceCents: r.planSnapshot.priceCents,
    intervalUnit: r.planSnapshot.billingIntervalUnit,
    intervalCount: r.planSnapshot.billingIntervalCount,
    planAvailable: r.currentPlan !== null,
    changes: r.currentPlan ? planChanges(r.planSnapshot, r.currentPlan) : [],
  }))
  return (
    <div className="flex flex-col gap-8">
      {requests.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="req-title">
          <h2 id="req-title" className="text-sm font-semibold text-foreground">
            Demandes d&apos;abonnement ({requests.length})
          </h2>
          {requests.map((r) => (
            <RequestCard key={r.id} request={r} />
          ))}
        </section>
      )}
      {data.earlyCancellations.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="ec-title">
          <h2 id="ec-title" className="text-sm font-semibold text-foreground">
            Demandes d&apos;arrêt anticipé ({data.earlyCancellations.length})
          </h2>
          {data.earlyCancellations.map((c) => {
            const summary = buildSubscriptionContractSummary(c.subscription)
            const endsAt = summary.commitment.endsAt ?? summary.termEndsAt
            return (
              <EarlyCancellationCard
                key={c.id}
                request={{
                  id: c.id,
                  subscriptionId: c.subscriptionId,
                  customerName: c.subscription.customerName,
                  vehicle: c.vehicle,
                  planName: summary.planName,
                  requestedAt: formatDateFr(c.createdAt),
                  commitment: commitmentSentence(summary.commitment.unit, summary.commitment.count),
                  contractEndsAt: endsAt ? formatDateFr(endsAt) : null,
                  message: c.customerMessage,
                }}
              />
            )
          })}
        </section>
      )}
    </div>
  )
}

function PlansView({ plans }: { plans: Overview["plans"] }) {
  const visible = plans.filter((p) => p.status !== "archived")
  if (!visible.length) {
    return (
      <EmptyState title="Aucune formule pour l'instant">
        Créez votre première formule en quelques étapes.{" "}
        <Link href={`${BASE}/formules/nouvelle`} className="font-medium text-primary underline-offset-4 hover:underline">
          Nouvelle formule
        </Link>
      </EmptyState>
    )
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {visible.map((p) => {
        const c = planRowToConfig(p)
        const status = PLAN_STATUS_UI[p.status] ?? PLAN_STATUS_UI.draft
        return (
          <li key={p.id}>
            <Link href={`${BASE}/formules/${p.id}`} className="flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-foreground">{c.name}</p>
                <ToneBadge tone={status.tone}>{status.label}</ToneBadge>
              </div>
              <p className="flex items-baseline gap-1">
                <span className="text-xl font-semibold text-foreground">{formatEuros(c.priceCents)}</span>
                <span className="text-sm text-muted-foreground">{perIntervalShort(c.billingIntervalUnit, c.billingIntervalCount)}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                {commitmentSentence(c.commitmentUnit, c.commitmentCount)} · {VISIBILITY_UI[c.visibility]?.label}
              </p>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function SubscribersView({ subscriptions }: { subscriptions: Overview["subscriptions"] }) {
  if (!subscriptions.length) return <EmptyState title="Aucun abonné pour l'instant">Vos clients abonnés apparaîtront ici.</EmptyState>
  return (
    <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
      {subscriptions.map((s) => {
        const summary = buildSubscriptionContractSummary(s)
        const status = subscriptionStatusUi(s.status)
        return (
          <li key={s.id}>
            <Link href={`${BASE}/abonnes/${s.id}`} className="flex flex-col gap-1 p-4 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="truncate font-medium text-foreground">{s.customerName}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {summary.planName}
                  {s.vehicle ? ` · ${s.vehicle}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3 sm:shrink-0">
                {summary.nextBillingAt && <span className="text-xs text-muted-foreground">Prochaine échéance {formatDateFr(summary.nextBillingAt)}</span>}
                <ToneBadge tone={status.tone}>{status.label}</ToneBadge>
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function PaymentsView({ payments }: { payments: Overview["payments"] }) {
  if (!payments.length) return <EmptyState title="Aucun paiement pour l'instant">Les paiements de vos abonnés apparaîtront ici.</EmptyState>
  return <PaymentsList payments={payments} />
}

function EmailsView({ emails }: { emails: Overview["emails"] }) {
  if (!emails.length) return <EmptyState title="Aucun email envoyé pour l'instant">Les emails envoyés à vos abonnés apparaîtront ici.</EmptyState>
  return <EmailsList emails={emails} />
}
