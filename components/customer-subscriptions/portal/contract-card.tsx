import {
  formatCommitmentFr,
  formatDateFr,
  formatIntervalFr,
  formatMoney,
  formatRenewalFr,
  type SubscriptionContractSummary,
} from "@/lib/customer-subscriptions/contract-summary"
import type { CustomerPortalView } from "@/lib/customer-subscriptions/customer-service"

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium text-card-foreground">{value}</dd>
    </div>
  )
}

function stopRuleFr(s: SubscriptionContractSummary): string {
  switch (s.stop.kind) {
    case "next_billing_date":
      return "Arrêt possible à la fin de chaque période payée, sans frais."
    case "end_of_commitment":
      return `Engagement jusqu'au ${formatDateFr(s.stop.commitmentEndsAt)} ; vous pouvez demander le non-renouvellement à tout moment.`
    case "end_of_prepaid_period":
      return `Formule réglée jusqu'au ${formatDateFr(s.stop.prepaidUntil)}.`
    case "ends_automatically":
      return `Se termine automatiquement le ${formatDateFr(s.stop.endsAt)}.`
  }
}

function usesFr(n: number): string {
  return n > 1 ? `${n} prestations` : "1 prestation"
}

/** Contrat affiché depuis les snapshots uniquement (jamais le plan courant). */
export function ContractCard({ view }: { view: CustomerPortalView }) {
  const s = view.summary
  const price = `${formatMoney(s.price.amountCents, s.price.currency)} ${s.paymentMode === "prepaid" ? "réglé en une fois" : formatIntervalFr(s.interval)}`
  const isPrepaid = s.paymentMode === "prepaid"

  return (
    <>
      <section aria-labelledby="contract-title" className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 id="contract-title" className="text-pretty text-lg font-semibold text-card-foreground">
            {s.planName}
          </h2>
          <span className="shrink-0 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">{view.status}</span>
        </div>
        <p className="mt-1 text-2xl font-semibold tracking-tight text-card-foreground">{price}</p>

        {isPrepaid && s.prepaidUntil ? (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {`Votre formule est réglée jusqu'au ${formatDateFr(s.prepaidUntil)}.`} Aucun renouvellement automatique n&apos;est prévu.
          </p>
        ) : null}
        {s.commitment.inProgress && s.commitment.endsAt ? (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{`Votre engagement court jusqu'au ${formatDateFr(s.commitment.endsAt)}.`}</p>
        ) : null}

        <dl className="mt-4 divide-y divide-border border-t border-border">
          {view.vehicle ? <Row label="Véhicule" value={view.vehicle.plate ? `${view.vehicle.label} · ${view.vehicle.plate}` : view.vehicle.label} /> : null}
          {s.includedServiceName ? <Row label="Inclus" value={`${s.includedServiceName} · ${usesFr(s.usesPerCycle)} par période`} /> : null}
          {s.nextBillingAt ? <Row label="Prochaine échéance" value={`${formatDateFr(s.nextBillingAt)} · ${formatMoney(s.price.amountCents, s.price.currency)}`} /> : null}
          {s.commitment.endsAt ? <Row label="Fin d'engagement" value={formatDateFr(s.commitment.endsAt)} /> : null}
          {!isPrepaid ? <Row label="Renouvellement" value={formatRenewalFr(s.renewal.mode, s.renewal.optedOut)} /> : null}
          {s.cancelAt ? <Row label="Arrêt programmé" value={formatDateFr(s.cancelAt)} /> : null}
        </dl>
      </section>

      <section aria-labelledby="terms-title" className="rounded-xl border border-border bg-card p-5">
        <h2 id="terms-title" className="font-semibold text-card-foreground">
          Les modalités de ma formule
        </h2>
        <dl className="mt-2 divide-y divide-border">
          <Row label="Prestation incluse" value={s.includedServiceName ?? "Selon la formule"} />
          <Row label="Utilisations par période" value={usesFr(s.usesPerCycle)} />
          <Row label="Montant" value={formatMoney(s.price.amountCents, s.price.currency)} />
          <Row label="Fréquence" value={isPrepaid ? "Paiement unique" : formatIntervalFr(s.interval)} />
          <Row label="Engagement" value={formatCommitmentFr(s.commitment.unit, s.commitment.count)} />
          {s.termEndsAt ? <Row label="Date de fin" value={formatDateFr(s.termEndsAt)} /> : null}
          {!isPrepaid ? <Row label="Renouvellement" value={formatRenewalFr(s.renewal.mode, s.renewal.optedOut)} /> : null}
          {s.renewal.noticeDays ? <Row label="Rappel" value={`${s.renewal.noticeDays} jours avant le renouvellement`} /> : null}
          <Row
            label="Nettoyage initial"
            value={
              s.initialCleaning.required
                ? `${s.initialCleaning.serviceName ?? "Requis"}${s.initialCleaning.priceCents != null ? ` · ${formatMoney(s.initialCleaning.priceCents, s.price.currency)}` : ""}`
                : "Non requis"
            }
          />
        </dl>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{stopRuleFr(s)}</p>
      </section>
    </>
  )
}
