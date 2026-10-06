"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { withTenant } from "@/lib/tenant-link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  PLAN_FORM_STEPS,
  firstInvalidStep,
  issuesForStep,
  type PlanFormState,
  type PlanFormStepKey,
} from "@/lib/customer-subscriptions/plan-form"
import { HELP, PUBLIC_MODE_UI, REMINDER_PRESETS, VISIBILITY_UI } from "@/lib/customer-subscriptions/admin-labels"
import { archivePlanAction, savePlanAction } from "@/app/admin/(dashboard)/abonnements-clients/actions"
import { PlanPreview } from "./plan-preview"
import { HelpTip } from "./ui"

type ServiceOption = { id: number; name: string; priceCents: number }

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

function Choice({
  name,
  checked,
  onChange,
  title,
  description,
}: {
  name: string
  checked: boolean
  onChange: () => void
  title: string
  description: string
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
        checked ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-1 accent-primary" />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{title}</span>
        <span className="text-sm leading-relaxed text-muted-foreground">{description}</span>
      </span>
    </label>
  )
}

function Field({ id, label, error, children, hint }: { id: string; label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export function PlanConfigurator({
  planId,
  initial,
  services,
  paymentsReady,
  hasSubscribers,
  publicMode,
}: {
  planId: number | null
  initial: PlanFormState
  services: ServiceOption[]
  paymentsReady: boolean
  hasSubscribers: boolean
  publicMode: string
}) {
  const router = useRouter()
  const tenant = useSearchParams().get("tenant")
  const plansListHref = withTenant("/admin/abonnements-clients?vue=formules", tenant)
  const [form, setForm] = useState<PlanFormState>(() => (paymentsReady ? initial : { ...initial, status: "draft" }))
  const [stepIndex, setStepIndex] = useState(0)
  const [showErrors, setShowErrors] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const step = PLAN_FORM_STEPS[stepIndex]
  const issues = useMemo(() => issuesForStep(form, step.key), [form, step.key])
  const err = (field: string) => (showErrors ? issues.find((i) => i.field === field)?.message : undefined)
  const set = <K extends keyof PlanFormState>(key: K, value: PlanFormState[K]) => setForm((f) => ({ ...f, [key]: value }))
  const serviceName = (id: number | null) => services.find((s) => s.id === id)?.name ?? null
  const isLast = stepIndex === PLAN_FORM_STEPS.length - 1

  function goTo(index: number) {
    setShowErrors(false)
    setServerError(null)
    setStepIndex(index)
  }

  function next() {
    if (issues.length) return setShowErrors(true)
    goTo(stepIndex + 1)
  }

  function save() {
    const invalid: PlanFormStepKey | null = form.status === "active" ? firstInvalidStep(form) : null
    if (invalid) {
      goTo(PLAN_FORM_STEPS.findIndex((s) => s.key === invalid))
      setShowErrors(true)
      return
    }
    startTransition(async () => {
      const r = await savePlanAction(planId, form)
      if (!r.ok) return setServerError(r.message)
      router.push(plansListHref)
    })
  }

  function archive() {
    if (planId === null) return
    if (!window.confirm("Archiver cette formule ? Elle ne sera plus proposée. Vos abonnés actuels ne sont pas concernés.")) return
    startTransition(async () => {
      const r = await archivePlanAction(planId)
      if (!r.ok) return setServerError(r.message)
      router.push(plansListHref)
    })
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-5 rounded-xl border border-border bg-card p-4 sm:p-6">
        <nav aria-label="Étapes" className="flex flex-col gap-3">
          <p className="text-xs font-medium text-muted-foreground">
            Étape {stepIndex + 1} / {PLAN_FORM_STEPS.length}
          </p>
          <ol className="flex gap-1.5">
            {PLAN_FORM_STEPS.map((s, i) => (
              <li key={s.key} className="flex-1">
                <button
                  type="button"
                  onClick={() => (i < stepIndex ? goTo(i) : undefined)}
                  aria-current={i === stepIndex ? "step" : undefined}
                  aria-label={`${i + 1}. ${s.title}`}
                  className={cn(
                    "h-1.5 w-full rounded-full transition-colors",
                    i <= stepIndex ? "bg-primary" : "bg-muted",
                    i < stepIndex ? "cursor-pointer" : "cursor-default",
                  )}
                />
              </li>
            ))}
          </ol>
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-foreground">{step.title}</h2>
            <p className="text-sm text-muted-foreground">{step.hint}</p>
          </div>
        </nav>

        {hasSubscribers && (
          <p className="rounded-lg border border-border bg-muted/50 p-3 text-sm leading-relaxed text-muted-foreground">{HELP.editing}</p>
        )}

        <div className="flex flex-col gap-5">
          {step.key === "plan" && (
            <>
              <Field id="name" label="Nom de la formule" error={err("name")}>
                <Input id="name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex. Entretien Premium" maxLength={120} aria-invalid={!!err("name")} />
              </Field>
              <Field id="description" label="Description (facultatif)" error={err("description")} hint="Quelques mots pour donner envie à votre client.">
                <Textarea id="description" value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} maxLength={2000} />
              </Field>
              <Field id="service" label="Prestation incluse" error={err("includedServiceId")}>
                <select id="service" className={selectClass} value={form.includedServiceId ?? ""} onChange={(e) => set("includedServiceId", e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Choisir une prestation</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              {services.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Vous n&apos;avez pas encore de prestation.{" "}
                  <Link href={withTenant("/admin/prestations", tenant)} className="font-medium text-primary underline-offset-4 hover:underline">
                    Créer une prestation
                  </Link>
                </p>
              )}
              <Field id="uses" label="Nombre de prestations par période" error={err("includedUsesPerCycle")}>
                <Input id="uses" type="number" inputMode="numeric" min={1} max={100} value={form.usesPerCycle} onChange={(e) => set("usesPerCycle", Number(e.target.value))} className="max-w-32" />
              </Field>
            </>
          )}

          {step.key === "price" && (
            <>
              <Field id="price" label="Prix par période" error={err("priceCents")} hint="Exemple : 39 ou 39,90">
                <div className="relative max-w-48">
                  <Input id="price" inputMode="decimal" value={form.priceEuros} onChange={(e) => set("priceEuros", e.target.value)} placeholder="39" className="pr-8" aria-invalid={!!err("priceCents")} />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">€</span>
                </div>
              </Field>
              <Field id="interval" label="Fréquence" error={err("billingIntervalCount")}>
                <div className="flex gap-2">
                  <span className="flex items-center text-sm text-muted-foreground">Tous les</span>
                  <Input id="interval" type="number" inputMode="numeric" min={1} max={form.intervalUnit === "month" ? 12 : 52} value={form.intervalCount} onChange={(e) => set("intervalCount", Number(e.target.value))} className="w-20" />
                  <select aria-label="Unité" className={cn(selectClass, "w-32")} value={form.intervalUnit} onChange={(e) => set("intervalUnit", e.target.value as PlanFormState["intervalUnit"])}>
                    <option value="month">mois</option>
                    <option value="week">semaines</option>
                  </select>
                </div>
              </Field>
            </>
          )}

          {step.key === "commitment" && (
            <>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium text-foreground">Engagement</legend>
                <Choice name="commit" checked={!form.hasCommitment} onChange={() => set("hasCommitment", false)} title="Sans engagement" description="Votre client peut arrêter avant chaque échéance." />
                <Choice name="commit" checked={form.hasCommitment} onChange={() => set("hasCommitment", true)} title="Avec engagement" description="Votre client s'engage pour une durée minimale." />
                <HelpTip>Durée minimale pendant laquelle la formule reste active.</HelpTip>
              </fieldset>
              {form.hasCommitment && (
                <>
                  <Field id="commitCount" label="Durée de l'engagement" error={err("commitmentCount")}>
                    <div className="flex gap-2">
                      <Input id="commitCount" type="number" inputMode="numeric" min={1} value={form.commitmentCount} onChange={(e) => set("commitmentCount", Number(e.target.value))} className="w-20" />
                      <select aria-label="Unité d'engagement" className={cn(selectClass, "w-40")} value={form.commitmentUnit} onChange={(e) => set("commitmentUnit", e.target.value as PlanFormState["commitmentUnit"])}>
                        <option value="month">mois</option>
                        <option value="billing_cycle">échéances</option>
                      </select>
                    </div>
                  </Field>
                  {form.paymentChoice !== "prepaid" && (
                    <fieldset className="flex flex-col gap-2">
                      <legend className="mb-1 text-sm font-medium text-foreground">À la fin de l&apos;engagement</legend>
                      <Choice name="end" checked={form.endOfTerm === "continue"} onChange={() => set("endOfTerm", "continue")} title="Continuer ensuite sans engagement" description="La formule continue, votre client peut arrêter à chaque échéance." />
                      <Choice name="end" checked={form.endOfTerm === "renew"} onChange={() => set("endOfTerm", "renew")} title="Renouveler pour la même durée" description="Un nouvel engagement identique démarre automatiquement." />
                      <Choice name="end" checked={form.endOfTerm === "stop"} onChange={() => set("endOfTerm", "stop")} title="S'arrêter automatiquement" description="La formule se termine à la fin de l'engagement." />
                      <HelpTip>Détermine ce qui se passe lorsque l&apos;engagement arrive à sa fin.</HelpTip>
                    </fieldset>
                  )}
                </>
              )}
              {form.paymentChoice !== "prepaid" && (
                <Field id="reminder" label="Rappel avant échéance" error={err("renewalNoticeDays")} hint="Votre client reçoit un email avant d'être débité.">
                  <select id="reminder" className={cn(selectClass, "max-w-56")} value={form.reminderDays ?? 0} onChange={(e) => set("reminderDays", Number(e.target.value) || null)}>
                    <option value={0}>Pas de rappel</option>
                    {REMINDER_PRESETS.map((d) => (
                      <option key={d} value={d}>
                        {d} jours avant
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </>
          )}

          {step.key === "payment" && (
            <>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium text-foreground">Comment votre client paie</legend>
                <Choice name="pay" checked={form.paymentChoice === "recurring"} onChange={() => set("paymentChoice", "recurring")} title="Paiement automatique" description="Votre client est débité à chaque échéance." />
                <Choice name="pay" checked={form.paymentChoice === "prepaid"} onChange={() => set("paymentChoice", "prepaid")} title="Payé d'avance" description="Votre client paie plusieurs périodes en une seule fois." />
                <Choice name="pay" checked={form.paymentChoice === "both"} onChange={() => set("paymentChoice", "both")} title="Au choix du client" description="Votre client choisit au moment de souscrire." />
              </fieldset>
              {form.paymentChoice !== "recurring" && (
                <Field id="prepaid" label="Nombre de périodes payées d'avance" error={err("prepaidBillingCycles")}>
                  <Input id="prepaid" type="number" inputMode="numeric" min={1} max={60} value={form.prepaidCycles} onChange={(e) => set("prepaidCycles", Number(e.target.value))} className="max-w-32" />
                </Field>
              )}
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium text-foreground">Nettoyage initial</legend>
                <Choice name="initial" checked={!form.initialCleaning} onChange={() => set("initialCleaning", false)} title="Pas de nettoyage initial" description="La formule démarre directement." />
                <Choice name="initial" checked={form.initialCleaning} onChange={() => set("initialCleaning", true)} title="Nettoyage initial obligatoire" description="Une remise à niveau du véhicule, payée à part, avant le démarrage." />
              </fieldset>
              {form.initialCleaning && (
                <Field id="initialService" label="Prestation de nettoyage initial" error={err("initialServiceId")}>
                  <select id="initialService" className={selectClass} value={form.initialServiceId ?? ""} onChange={(e) => set("initialServiceId", e.target.value ? Number(e.target.value) : null)}>
                    <option value="">Choisir une prestation</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </>
          )}

          {step.key === "publish" && (
            <>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium text-foreground">Qui peut voir cette formule</legend>
                {(["public", "unlisted", "private"] as const).map((v) => (
                  <Choice key={v} name="visibility" checked={form.visibility === v} onChange={() => set("visibility", v)} title={VISIBILITY_UI[v].label} description={VISIBILITY_UI[v].help} />
                ))}
              </fieldset>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium text-foreground">État</legend>
                {paymentsReady ? (
                  <Choice name="status" checked={form.status === "active"} onChange={() => set("status", "active")} title="Publier maintenant" description="La formule peut être proposée à vos clients." />
                ) : (
                  <p className="rounded-lg border border-border bg-muted/50 p-3 text-sm leading-relaxed text-muted-foreground">
                    Pour publier, connectez d&apos;abord la réception des paiements en ligne dans{" "}
                    <Link href={withTenant("/admin/parametres", tenant)} className="font-medium text-primary underline-offset-4 hover:underline">
                      Paramètres
                    </Link>
                    . Vous pouvez enregistrer la formule en brouillon dès maintenant.
                  </p>
                )}
                <Choice name="status" checked={form.status === "draft"} onChange={() => set("status", "draft")} title="Garder en brouillon" description="Invisible pour vos clients tant que vous ne la publiez pas." />
              </fieldset>
              {form.status === "active" && publicMode === "disabled" && (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Les abonnements sont actuellement « {PUBLIC_MODE_UI.disabled.label} » : la formule sera publiée, mais pas encore proposée. Vous pourrez l&apos;activer depuis la page Abonnements clients.
                </p>
              )}
            </>
          )}
        </div>

        {serverError && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {serverError}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            {stepIndex > 0 ? (
              <Button type="button" variant="ghost" onClick={() => goTo(stepIndex - 1)} disabled={pending}>
                Retour
              </Button>
            ) : (
              <Button variant="ghost" render={<Link href={plansListHref} />} nativeButton={false}>
                Annuler
              </Button>
            )}
            {planId !== null && (
              <Button type="button" variant="ghost" className="text-muted-foreground" onClick={archive} disabled={pending}>
                Archiver
              </Button>
            )}
          </div>
          {isLast ? (
            <Button type="button" onClick={save} disabled={pending} className="w-full sm:w-auto">
              {pending ? "Enregistrement…" : form.status === "active" ? "Publier la formule" : "Enregistrer le brouillon"}
            </Button>
          ) : (
            <Button type="button" onClick={next} className="w-full sm:w-auto">
              Continuer
            </Button>
          )}
        </div>
      </div>

      <div className="lg:sticky lg:top-6 lg:w-80">
        <PlanPreview form={form} serviceName={serviceName(form.includedServiceId)} initialServiceName={serviceName(form.initialServiceId)} />
      </div>
    </div>
  )
}
