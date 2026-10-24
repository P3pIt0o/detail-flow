"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Lock } from "lucide-react"
import { withTenant } from "@/lib/tenant-link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import {
  WIZARD_STEPS,
  formatEuros,
  parseEurosToCents,
  periodWords,
  serviceNoun,
  wizardClientPreview,
  wizardIssuesForStep,
  type WizardFormState,
  type WizardPeriod,
} from "@/lib/customer-subscriptions/plan-form"
import { splitInstallments } from "@/lib/customer-subscriptions/rights-period"
import { HELP, PUBLIC_MODE_UI } from "@/lib/customer-subscriptions/admin-labels"
import { archivePlanAction, saveWizardPlanAction } from "@/app/admin/(dashboard)/abonnements-clients/actions"

type ServiceOption = { id: number; name: string; priceCents: number }

const selectClass =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"

function Choice({ name, checked, onChange, title, description }: { name: string; checked: boolean; onChange: () => void; title: string; description: string }) {
  return (
    <label className={cn("flex flex-1 cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition-colors", checked ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/50")}>
      <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-1 size-4 accent-primary" />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <span className="text-sm leading-relaxed text-muted-foreground">{description}</span>
      </span>
    </label>
  )
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} role="alert" className="text-sm text-destructive">
      {message}
    </p>
  )
}

const PERIODS: { value: WizardPeriod; label: string }[] = [
  { value: 1, label: "par mois" },
  { value: 3, label: "par trimestre" },
  { value: 12, label: "par an" },
]

/** Création (et modification des formules exprimables) en 3 étapes ; le serveur retraduit tout. */
export function PlanWizard({
  planId,
  initial,
  services,
  paymentsReady,
  hasSubscribers,
  publicMode,
}: {
  planId: number | null
  initial: WizardFormState
  services: ServiceOption[]
  paymentsReady: boolean
  hasSubscribers: boolean
  publicMode: string
}) {
  const router = useRouter()
  const tenant = useSearchParams().get("tenant")
  const plansListHref = withTenant("/admin/abonnements-clients?vue=formules", tenant)
  const [form, setForm] = useState<WizardFormState>(() => (paymentsReady ? initial : { ...initial, status: "draft" }))
  const [stepIndex, setStepIndex] = useState(0)
  const [showErrors, setShowErrors] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const step = WIZARD_STEPS[stepIndex]
  const serviceName = services.find((s) => s.id === form.includedServiceId)?.name ?? null
  const issues = useMemo(() => wizardIssuesForStep(form, step.key, serviceName), [form, step.key, serviceName])
  const err = (field: string) => (showErrors ? issues.find((i) => i.field === field)?.message : undefined)
  const set = <K extends keyof WizardFormState>(key: K, value: WizardFormState[K]) => setForm((f) => ({ ...f, [key]: value }))
  const preview = wizardClientPreview(form, serviceName)
  const w = periodWords(form.periodMonths)
  const noun = serviceNoun(serviceName, form.uses)
  const multiMonth = form.periodMonths > 1
  const monthly = multiMonth && form.paymentSchedule !== "period"
  const cents = parseEurosToCents(form.priceEuros)
  const split = monthly && cents > 0 ? splitInstallments(cents, form.periodMonths) : null
  const isLast = stepIndex === WIZARD_STEPS.length - 1

  function setPeriod(p: WizardPeriod) {
    // Par mois : payer « chaque mois » = « en une fois » ; pas d'engagement imposé.
    setForm((f) => ({ ...f, periodMonths: p, ...(p === 1 ? { paymentSchedule: "period" as const, afterPeriod: "continue" as const } : {}) }))
  }
  function setSchedule(s: WizardFormState["paymentSchedule"]) {
    setForm((f) => ({ ...f, paymentSchedule: s, afterPeriod: s !== "period" && f.afterPeriod === "continue" ? "renew" : f.afterPeriod }))
  }

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
    if (form.status === "active") {
      const invalid = WIZARD_STEPS.findIndex((s) => wizardIssuesForStep(form, s.key, serviceName).length > 0)
      if (invalid >= 0) {
        goTo(invalid)
        setShowErrors(true)
        return
      }
    }
    startTransition(async () => {
      const r = await saveWizardPlanAction(planId, form)
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

  const afterOptions: { value: WizardFormState["afterPeriod"]; label: string }[] = monthly
    ? [
        { value: "renew", label: `Nouvel engagement de ${w.months}, avec ${form.uses} nouveaux ${noun}` },
        { value: "stop", label: "La formule s'arrête" },
      ]
    : [
        { value: "continue", label: "La formule continue, votre client peut arrêter à chaque échéance" },
        { value: "renew", label: `Nouvel engagement de ${w.months}` },
        { value: "stop", label: "La formule s'arrête" },
      ]

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-5 rounded-xl border border-border bg-card p-4 sm:p-7">
        <nav aria-label="Étapes" className="flex flex-col gap-2.5">
          <p className="text-sm font-medium text-muted-foreground">
            Étape {stepIndex + 1} sur {WIZARD_STEPS.length}
          </p>
          <ol className="flex gap-1.5">
            {WIZARD_STEPS.map((s, i) => (
              <li key={s.key} className="flex-1">
                <button
                  type="button"
                  onClick={() => (i < stepIndex ? goTo(i) : undefined)}
                  aria-current={i === stepIndex ? "step" : undefined}
                  aria-label={`${i + 1}. ${s.title}`}
                  className={cn("h-1.5 w-full rounded-full transition-colors", i <= stepIndex ? "bg-primary" : "bg-muted", i < stepIndex ? "cursor-pointer" : "cursor-default")}
                />
              </li>
            ))}
          </ol>
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold text-foreground">{step.title}</h2>
            {step.hint && <p className="text-sm text-muted-foreground">{step.hint}</p>}
          </div>
        </nav>

        {hasSubscribers && <p className="rounded-lg border border-border bg-muted/50 p-3 text-sm leading-relaxed text-muted-foreground">{HELP.editing}</p>}

        <div className="flex flex-col gap-5">
          {step.key === "plan" && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">Nom de la formule</Label>
                <Input id="name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex. Formule Sérénité" maxLength={120} aria-invalid={!!err("name")} aria-describedby="name-error" className="h-11" />
                <FieldError id="name-error" message={err("name")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="service">Prestation incluse</Label>
                <select id="service" className={selectClass} value={form.includedServiceId ?? ""} onChange={(e) => set("includedServiceId", e.target.value ? Number(e.target.value) : null)} aria-invalid={!!err("includedServiceId")} aria-describedby="service-error">
                  <option value="">Choisir une prestation</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <FieldError id="service-error" message={err("includedServiceId")} />
                {services.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Vous n&apos;avez pas encore de prestation.{" "}
                    <Link href={withTenant("/admin/prestations", tenant)} className="font-medium text-primary underline-offset-4 hover:underline">
                      Créer une prestation
                    </Link>
                  </p>
                )}
              </div>
              <fieldset className="flex flex-col gap-1.5">
                <legend className="mb-1.5 text-sm font-medium text-foreground">Combien de prestations ?</legend>
                <div className="flex flex-wrap items-center gap-2.5">
                  <Label htmlFor="uses" className="sr-only">
                    Nombre de prestations
                  </Label>
                  <Input id="uses" type="number" inputMode="numeric" min={1} max={100} value={form.uses} onChange={(e) => set("uses", Number(e.target.value))} className="h-11 w-20 text-center font-semibold" aria-invalid={!!err("includedUsesPerCycle")} aria-describedby="uses-error" />
                  <span className="text-sm text-foreground">{serviceNoun(serviceName, form.uses)}</span>
                  {PERIODS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      aria-pressed={form.periodMonths === p.value}
                      onClick={() => setPeriod(p.value)}
                      className={cn("h-11 rounded-lg border px-4 text-sm transition-colors", form.periodMonths === p.value ? "border-primary bg-primary/10 font-semibold text-primary" : "border-input bg-background text-foreground hover:bg-muted/50")}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <FieldError id="uses-error" message={err("includedUsesPerCycle")} />
                <p className="text-sm text-muted-foreground">
                  Votre client les utilise quand il veut pendant {form.periodMonths === 12 ? "l'année" : form.periodMonths === 3 ? "le trimestre" : "le mois"}. Ceux qui ne sont pas utilisés ne sont pas reportés.
                </p>
              </fieldset>
            </>
          )}

          {step.key === "price" && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="price">
                  Prix {form.periodMonths === 12 ? "pour l'année" : form.periodMonths === 3 ? "pour le trimestre" : "par mois"} ({form.uses} {noun})
                </Label>
                <div className="flex items-center gap-2">
                  <Input id="price" inputMode="decimal" value={form.priceEuros} onChange={(e) => set("priceEuros", e.target.value)} placeholder="359" className="h-11 w-36 font-semibold" aria-invalid={!!err("priceCents")} aria-describedby="price-error" />
                  <span className="text-sm text-foreground">€</span>
                </div>
                <FieldError id="price-error" message={err("priceCents")} />
              </div>

              {multiMonth && (
                <fieldset className="flex flex-col gap-2.5">
                  <legend className="mb-1.5 text-sm font-medium text-foreground">Comment votre client paie-t-il ?</legend>
                  <div className="flex flex-col gap-2.5 sm:flex-row">
                    <Choice name="pay" checked={form.paymentSchedule === "period"} onChange={() => setSchedule("period")} title="En une fois" description={cents > 0 ? `${formatEuros(cents)} à la souscription` : `Le prix ${w.of} à la souscription`} />
                    <Choice
                      name="pay"
                      checked={form.paymentSchedule === "monthly"}
                      onChange={() => setSchedule("monthly")}
                      title="Chaque mois"
                      description={cents > 0 && splitInstallments(cents, form.periodMonths) ? `${formatEuros(splitInstallments(cents, form.periodMonths)!.installmentCents)} par mois pendant ${w.months}` : `Prix ${w.of} ÷ ${form.periodMonths}, pendant ${w.months}`}
                    />
                    <Choice name="pay" checked={form.paymentSchedule === "customer_choice"} onChange={() => setSchedule("customer_choice")} title="Au choix du client" description="Il choisit en souscrivant" />
                  </div>
                  {preview?.calculation && <p className="text-sm text-muted-foreground">{preview.calculation}</p>}
                </fieldset>
              )}

              {monthly && (
                <div className="flex items-start gap-3 rounded-lg bg-primary/10 p-4">
                  <Lock className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-primary">Engagement de {w.months}</p>
                    <p className="text-sm leading-relaxed text-foreground">
                      Votre client paie chaque mois des {noun} prévus pour {form.periodMonths === 12 ? "l'année" : "le trimestre"} : il s&apos;engage donc pour {w.months}. C&apos;est automatique, vous n&apos;avez rien à régler.
                    </p>
                  </div>
                </div>
              )}

              {multiMonth && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="after">Après les {w.months}</Label>
                  <select id="after" className={selectClass} value={form.afterPeriod} onChange={(e) => set("afterPeriod", e.target.value as WizardFormState["afterPeriod"])}>
                    {afterOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {monthly && <p className="text-sm text-muted-foreground">Avec un paiement chaque mois, la formule ne peut pas continuer sans engagement : votre client pourrait utiliser ses nouveaux {noun} puis arrêter.</p>}
                </div>
              )}
              {!preview && <p className="rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground lg:hidden">Le résumé client s&apos;affichera dès que le prix sera saisi.</p>}
            </>
          )}

          {step.key === "publish" && (
            <>
              <fieldset className="flex flex-col gap-2.5">
                <legend className="mb-1.5 text-sm font-medium text-foreground">Nettoyage initial</legend>
                <div className="flex flex-col gap-2.5 sm:flex-row">
                  <Choice name="initial" checked={!form.initialCleaning} onChange={() => set("initialCleaning", false)} title="Pas de nettoyage initial" description="La formule démarre directement." />
                  <Choice name="initial" checked={form.initialCleaning} onChange={() => set("initialCleaning", true)} title="Obligatoire" description="Une remise à niveau payée à part avant le démarrage." />
                </div>
                {form.initialCleaning && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="initialService">Prestation de nettoyage initial</Label>
                    <select id="initialService" className={selectClass} value={form.initialServiceId ?? ""} onChange={(e) => set("initialServiceId", e.target.value ? Number(e.target.value) : null)} aria-describedby="initial-error">
                      <option value="">Choisir une prestation</option>
                      {services.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <FieldError id="initial-error" message={err("initialServiceId")} />
                  </div>
                )}
              </fieldset>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reminder">Rappel avant chaque prélèvement</Label>
                <select id="reminder" className={selectClass} value={form.reminderDays} onChange={(e) => set("reminderDays", Number(e.target.value) as WizardFormState["reminderDays"])}>
                  <option value={3}>3 jours avant (recommandé)</option>
                  <option value={0}>Aucun rappel</option>
                  <option value={7}>7 jours avant</option>
                </select>
              </div>
              <fieldset className="flex flex-col gap-2.5">
                <legend className="mb-1.5 text-sm font-medium text-foreground">Publication</legend>
                {!paymentsReady && (
                  <p className="rounded-lg border border-border bg-muted/50 p-3 text-sm leading-relaxed text-muted-foreground">
                    Pour publier, connectez d&apos;abord la réception des paiements en ligne dans{" "}
                    <Link href={withTenant("/admin/parametres", tenant)} className="font-medium text-primary underline-offset-4 hover:underline">
                      Paramètres
                    </Link>
                    . Vous pouvez enregistrer la formule en brouillon dès maintenant.
                  </p>
                )}
                <div className="flex flex-col gap-2.5 sm:flex-row">
                  {paymentsReady && <Choice name="status" checked={form.status === "active"} onChange={() => set("status", "active")} title="Publier maintenant" description="Visible sur votre page de réservation." />}
                  <Choice name="status" checked={form.status === "draft"} onChange={() => set("status", "draft")} title="Garder en brouillon" description="Invisible tant que vous ne la publiez pas." />
                </div>
                {form.status === "active" && publicMode === "disabled" && (
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Les abonnements sont actuellement « {PUBLIC_MODE_UI.disabled.label} » : la formule sera publiée, mais pas encore proposée. Vous pourrez l&apos;activer depuis la page Abonnements clients.
                  </p>
                )}
              </fieldset>
              {preview && (
                <div className="rounded-lg border border-border bg-muted/40 p-4">
                  <p className="mb-1 text-sm font-semibold text-muted-foreground">En résumé</p>
                  <p className="text-sm leading-relaxed text-foreground">{preview.sentence}</p>
                </div>
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
          <div className="flex flex-col gap-2 sm:flex-row">
            {stepIndex > 0 ? (
              <Button type="button" variant="ghost" className="h-11" onClick={() => goTo(stepIndex - 1)} disabled={pending}>
                Retour
              </Button>
            ) : (
              <Button variant="ghost" className="h-11" render={<Link href={plansListHref} />} nativeButton={false}>
                Annuler
              </Button>
            )}
            {planId !== null && (
              <Button type="button" variant="ghost" className="h-11 text-muted-foreground" onClick={archive} disabled={pending}>
                Archiver
              </Button>
            )}
          </div>
          {isLast ? (
            <Button type="button" onClick={save} disabled={pending} className="h-11 w-full sm:w-auto">
              {pending ? "Enregistrement…" : form.status === "active" ? "Publier la formule" : "Enregistrer le brouillon"}
            </Button>
          ) : (
            <Button type="button" onClick={next} className="h-11 w-full sm:w-auto">
              Continuer
            </Button>
          )}
        </div>
      </div>

      <aside aria-label="Ce que verra votre client" className="flex flex-col gap-3.5 rounded-xl border border-border bg-card p-5 lg:sticky lg:top-6 lg:w-80">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ce que verra votre client</p>
        <div className="flex flex-col gap-1">
          <p className="text-lg font-bold text-foreground text-balance">{form.name.trim() || "Nom de votre formule"}</p>
          <p className="text-sm text-foreground">
            {form.uses} {noun} {w.per}
          </p>
        </div>
        {!preview ? (
          <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
            {stepIndex === 0 ? "Le prix s'affichera à l'étape suivante." : "Le résumé client s'affichera dès que le prix sera saisi."}
          </p>
        ) : (
          <>
            <p className="text-3xl font-bold text-foreground">
              {preview.priceMain}
              <span className="text-sm font-medium text-muted-foreground"> {preview.priceSuffix}</span>
            </p>
            {split ? (
              <dl className="flex flex-col gap-2 border-t border-border pt-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Pendant</dt>
                  <dd className="font-semibold text-foreground">{preview.duration}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Total {w.of === "de l'année" ? "sur l'année" : `sur ${w.months}`}</dt>
                  <dd className="font-semibold text-foreground">{preview.total}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Engagement</dt>
                  <dd className="font-semibold text-foreground">{preview.commitment}</dd>
                </div>
              </dl>
            ) : (
              preview.commitment && <p className="text-sm text-muted-foreground">Engagement {preview.commitment}</p>
            )}
            <p className="text-sm text-muted-foreground">
              {noun.charAt(0).toUpperCase() + noun.slice(1)} à utiliser quand vous voulez {form.periodMonths === 12 ? "dans l'année" : form.periodMonths === 3 ? "dans le trimestre" : "dans le mois"}. Non utilisés à la fin : non reportés.
            </p>
          </>
        )}
      </aside>
    </div>
  )
}
