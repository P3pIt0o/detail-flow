import {
  commitmentSentence,
  formatEuros,
  parseEurosToCents,
  periodNoun,
  perIntervalShort,
  reminderSentence,
  renewalSentence,
  type PlanFormState,
} from "@/lib/customer-subscriptions/plan-form"

/** « Ce que votre client verra » : dérivé uniquement de l'état du formulaire. */
export function PlanPreview({
  form,
  serviceName,
  initialServiceName,
}: {
  form: PlanFormState
  serviceName: string | null
  initialServiceName: string | null
}) {
  const cents = parseEurosToCents(form.priceEuros)
  const priceOk = Number.isFinite(cents) && cents > 0
  const recurring = form.paymentChoice !== "prepaid"
  const prepaid = form.paymentChoice !== "recurring"
  const commitmentUnit = form.hasCommitment ? form.commitmentUnit : "none"
  const renewalMode = !form.hasCommitment ? "open_ended" : form.endOfTerm === "stop" ? "none" : form.endOfTerm === "renew" ? "same_term" : "open_ended"

  return (
    <aside aria-label="Ce que votre client verra" className="flex flex-col gap-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ce que votre client verra</p>
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-background p-5 shadow-sm">
        <div className="flex flex-col gap-1">
          <p className="text-lg font-semibold text-foreground text-balance">{form.name.trim() || "Nom de votre formule"}</p>
          {form.description.trim() && <p className="text-sm leading-relaxed text-muted-foreground line-clamp-3">{form.description}</p>}
        </div>
        <p className="flex items-baseline gap-1.5">
          <span className="text-3xl font-semibold tracking-tight text-foreground">{priceOk ? formatEuros(cents) : "— €"}</span>
          <span className="text-sm text-muted-foreground">{perIntervalShort(form.intervalUnit, form.intervalCount)}</span>
        </p>
        <ul className="flex flex-col gap-2 border-t border-border pt-4 text-sm text-foreground">
          <li>
            {form.usesPerCycle} × {serviceName ?? "prestation incluse"} {periodNoun(form.intervalUnit, form.intervalCount)}
          </li>
          <li>{commitmentSentence(commitmentUnit, form.commitmentCount)}</li>
          {form.hasCommitment && recurring && <li className="text-muted-foreground">{renewalSentence(renewalMode, true, true)}</li>}
          {!form.hasCommitment && recurring && <li className="text-muted-foreground">Résiliable à chaque échéance</li>}
          {recurring && <li className="text-muted-foreground">{reminderSentence(form.reminderDays)}</li>}
          {prepaid && priceOk && (
            <li>
              {form.paymentChoice === "both" ? "Ou payé d'avance : " : "Payé d'avance : "}
              {formatEuros(cents * form.prepaidCycles)} pour {form.prepaidCycles} périodes
            </li>
          )}
          {form.initialCleaning && <li>Un nettoyage initial{initialServiceName ? ` (${initialServiceName})` : ""} avant le démarrage</li>}
        </ul>
      </div>
    </aside>
  )
}
