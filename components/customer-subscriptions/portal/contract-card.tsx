import {
  formatCommitmentFr,
  formatDateFr,
  formatIntervalFr,
  formatMoney,
  formatRenewalFr,
  type SubscriptionContractSummary,
} from "@/lib/customer-subscriptions/contract-summary"
import type { CustomerPortalView } from "@/lib/customer-subscriptions/customer-service"
import { periodWords, serviceNoun } from "@/lib/customer-subscriptions/plan-form"

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

const shortDate = (d: Date) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" }).format(d)

/** L27 : compteur lu sur les vrais droits ; « Réserver » renvoie vers la réservation classique. */
function UsageSection({ view, bookingHref }: { view: CustomerPortalView; bookingHref: string }) {
  const u = view.usage
  if (!u) return null
  const s = view.summary
  const noun = serviceNoun(s.includedServiceName, 2)
  const used = u.total - u.remaining
  return (
    <>
      <section aria-labelledby="usage-title" className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card p-5">
        <h2 id="usage-title" className="text-base font-bold text-card-foreground">
          {s.planName}
        </h2>
        {u.remaining > 0 ? (
          <div>
            <p className="text-4xl font-bold leading-none text-card-foreground">
              {u.remaining}
              <span className="text-lg font-medium text-muted-foreground">
                {" "}
                {serviceNoun(s.includedServiceName, u.remaining)} {u.remaining > 1 ? "restants" : "restant"} sur {u.total}
              </span>
            </p>
            <div className="mt-3 flex gap-1.5" role="img" aria-label={`${used} ${serviceNoun(s.includedServiceName, used)} utilisé${used > 1 ? "s" : ""} sur ${u.total}`}>
              {Array.from({ length: u.total }, (_, i) => (
                <span key={i} className={i < used ? "h-2.5 flex-1 rounded-full bg-muted-foreground/30" : "h-2.5 flex-1 rounded-full bg-primary"} />
              ))}
            </div>
            <p className="mt-2.5 text-sm text-muted-foreground">À utiliser avant le {formatDateFr(u.periodEndsAt)}</p>
          </div>
        ) : null}
        {u.remaining > 0 && (
          <a href={bookingHref} className="flex h-12 items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground">
            Réserver un {serviceNoun(s.includedServiceName, 1)}
          </a>
        )}
      </section>
      {u.remaining === 0 && (
        <section className="flex flex-col gap-1.5 rounded-2xl border border-dashed border-border bg-card p-5">
          <p className="font-semibold text-card-foreground">
            Vous avez utilisé vos {u.total} {noun}
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {view.nextRightsAt ? `${u.total} nouveaux ${noun} le ${formatDateFr(view.nextRightsAt)}. ` : ""}Besoin d&apos;un {serviceNoun(s.includedServiceName, 1)} avant ? Vous pouvez en réserver un au tarif normal.
          </p>
          <a href={bookingHref} className="mt-1 text-sm font-medium text-primary underline-offset-4 hover:underline">
            Réserver au tarif normal
          </a>
        </section>
      )}
      {s.rightsPeriod && (s.nextBillingAt || s.commitment.endsAt) ? (
        <section className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-5 text-[15px]">
          {s.nextBillingAt && s.nextBillingCents != null ? (
            <p className="flex justify-between gap-3 text-muted-foreground">
              <span>Prochain prélèvement</span>
              <strong className="text-card-foreground">
                {formatMoney(s.nextBillingCents, s.price.currency)} le {shortDate(s.nextBillingAt)}
              </strong>
            </p>
          ) : null}
          {s.commitment.endsAt ? (
            <p className="flex justify-between gap-3 text-muted-foreground">
              <span>Engagement</span>
              <strong className="text-card-foreground">jusqu&apos;au {formatDateFr(s.commitment.endsAt)}</strong>
            </p>
          ) : null}
          {s.rightsPeriod.installmentsLeft ? (
            <p className="flex justify-between gap-3 text-muted-foreground">
              <span>Mensualités restantes</span>
              <strong className="text-card-foreground">
                {s.rightsPeriod.installmentsLeft.remaining} sur {s.rightsPeriod.installmentsLeft.total}
              </strong>
            </p>
          ) : null}
        </section>
      ) : null}
    </>
  )
}

/** Contrat affiché depuis les snapshots uniquement (jamais le plan courant). */
export function ContractCard({ view, bookingHref = "/reservation" }: { view: CustomerPortalView; bookingHref?: string }) {
  const s = view.summary
  const price = `${formatMoney(s.price.amountCents, s.price.currency)} ${s.paymentMode === "prepaid" ? "réglé en une fois" : formatIntervalFr(s.interval)}`
  const isPrepaid = s.paymentMode === "prepaid"

  return (
    <>
      <UsageSection view={view} bookingHref={bookingHref} />
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
          {s.includedServiceName ? <Row label="Inclus" value={`${s.includedServiceName} · ${usesFr(s.usesPerCycle)} ${s.rightsPeriod ? periodWords(s.rightsPeriod.months).per : "par période"}`} /> : null}
          {s.nextBillingAt ? <Row label="Prochaine échéance" value={`${formatDateFr(s.nextBillingAt)} · ${formatMoney(s.nextBillingCents ?? s.price.amountCents, s.price.currency)}`} /> : null}
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
          <Row label="Montant" value={s.rightsPeriod && s.rightsPeriod.lastInstallmentCents !== s.price.amountCents ? `${formatMoney(s.price.amountCents, s.price.currency)} (dernière échéance de la période : ${formatMoney(s.rightsPeriod.lastInstallmentCents, s.price.currency)})` : formatMoney(s.price.amountCents, s.price.currency)} />
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
