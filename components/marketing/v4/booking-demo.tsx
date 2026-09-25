"use client"

import { useMemo, useState } from "react"
import {
  CalendarPlus,
  Check,
  ChevronLeft,
  CreditCard,
  Lock,
  Plus,
  Store,
  UserRound,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  DEMO_DEPOSIT_RATE,
  DEMO_OPTIONS,
  DEMO_SERVICES,
  DEMO_VEHICLE_TYPES,
  formatEuro,
  formatMinutes,
} from "./demo-data"
import { EventToast } from "./primitives"

const STEPS = [
  { title: "Véhicule", hint: "Le client choisit sa catégorie de véhicule." },
  { title: "Prestation", hint: "Vos prestations, avec le bon prix pour ce véhicule." },
  { title: "Options", hint: "Chaque option ajuste le prix et la durée." },
  { title: "Prix et durée", hint: "Calculés automatiquement, sans surprise." },
  { title: "Créneau", hint: "Uniquement les créneaux réellement libres." },
  { title: "Informations", hint: "Client et véhicule, saisis une seule fois." },
  { title: "Acompte", hint: "Demandé ou non, selon votre configuration." },
  { title: "Confirmation", hint: "La réservation arrive dans votre planning." },
]

type Day = { id: string; label: string; busy: [number, number][]; timeOff?: boolean }

const DAYS: Day[] = [
  { id: "jeu", label: "Jeu. 24", busy: [[600, 780]] },
  { id: "ven", label: "Ven. 25", busy: [[540, 720], [840, 960]] },
  { id: "sam", label: "Sam. 26", busy: [], timeOff: true },
  { id: "lun", label: "Lun. 28", busy: [] },
]

const OPEN = 540
const CLOSE = 1110
const STEP_MIN = 30
const BUFFER = 30

function computeSlots(day: Day, duration: number) {
  if (day.timeOff) return []
  const slots: string[] = []
  for (let start = OPEN; start + duration <= CLOSE; start += STEP_MIN) {
    const end = start + duration
    const overlaps = day.busy.some(([bs, be]) => start < be + BUFFER && end + BUFFER > bs)
    if (!overlaps) {
      slots.push(`${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`)
    }
  }
  return slots
}

function Choice({
  selected,
  onClick,
  children,
  className,
}: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "rounded-xl border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "border-primary bg-primary/10" : "border-border bg-background hover:border-primary/50",
        className,
      )}
    >
      {children}
    </button>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 text-[11.5px] font-medium text-muted-foreground">{label}</p>
      <p className="flex h-10 items-center rounded-lg border border-border bg-background px-3 text-[13px]">{value}</p>
    </div>
  )
}

export function BookingDemo() {
  const [step, setStep] = useState(0)
  const [vehicle, setVehicle] = useState(1)
  const [serviceId, setServiceId] = useState("interieur")
  const [optionIds, setOptionIds] = useState<string[]>(["poils"])
  const [dayId, setDayId] = useState("jeu")
  const [slot, setSlot] = useState<string | null>("14:30")
  const [paid, setPaid] = useState(false)

  const service = DEMO_SERVICES.find((s) => s.id === serviceId) ?? DEMO_SERVICES[0]
  const selectedOptions = DEMO_OPTIONS.filter((o) => optionIds.includes(o.id))
  const basePrice = service.prices[vehicle]
  const baseMinutes = service.durations[vehicle]
  const total = basePrice + selectedOptions.reduce((s, o) => s + o.price, 0)
  const minutes = baseMinutes + selectedOptions.reduce((s, o) => s + o.minutes, 0)
  const deposit = Math.round(total * DEMO_DEPOSIT_RATE * 100) / 100
  const day = DAYS.find((d) => d.id === dayId) ?? DAYS[0]
  const slots = useMemo(() => computeSlots(day, minutes), [day, minutes])
  const validSlot = slot && slots.includes(slot) ? slot : null
  const vehicleModel = DEMO_VEHICLE_TYPES[vehicle].examples.split(",")[0]

  const canContinue = step !== 4 || Boolean(validSlot)
  const isLast = step === STEPS.length - 1

  function next() {
    if (step === 6) setPaid(true)
    if (!isLast && canContinue) setStep(step + 1)
  }

  function restart() {
    setStep(0)
    setPaid(false)
  }

  function toggleOption(id: string) {
    setOptionIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] lg:gap-14">
      <ol className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
        {STEPS.map((s, i) => {
          const done = i < step
          const active = i === step
          return (
            <li key={s.title} className="shrink-0 lg:shrink">
              <button
                type="button"
                onClick={() => setStep(i)}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "group flex w-full items-start gap-3.5 rounded-2xl px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:px-4 lg:py-3",
                  active ? "bg-card shadow-sm ring-1 ring-border" : "hover:bg-muted/70",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-semibold transition-colors",
                    done && "bg-foreground text-background",
                    active && "bg-primary text-primary-foreground",
                    !done && !active && "bg-muted text-muted-foreground",
                  )}
                >
                  {done ? <Check className="size-3.5" strokeWidth={3} aria-hidden="true" /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      "block whitespace-nowrap text-sm font-semibold",
                      active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
                    )}
                  >
                    {s.title}
                  </span>
                  <span
                    className={cn(
                      "hidden text-sm leading-relaxed text-muted-foreground lg:block",
                      !active && "lg:hidden",
                    )}
                  >
                    {s.hint}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>

      <div className="relative">
        <div className="df-product flex min-h-[560px] flex-col overflow-hidden rounded-3xl border border-border bg-background text-foreground shadow-[0_40px_120px_-40px_oklch(0.25_0.08_260/0.55)]">
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Store className="size-3.5" aria-hidden="true" />
              </span>
              <span className="text-[13px] font-semibold">Atelier Lumière Detailing</span>
            </div>
            <span className="font-mono text-[11px] text-muted-foreground">
              {step + 1}/{STEPS.length}
            </span>
          </div>

          <div className="h-0.5 bg-border">
            <div
              className="h-full bg-primary transition-[width] duration-500 ease-out"
              style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            />
          </div>

          <div key={step} className="df-rise flex flex-1 flex-col px-5 py-6 sm:px-7">
            <div className="mb-5 flex items-start gap-2">
              {step > 0 && step < 7 && (
                <button
                  type="button"
                  onClick={() => setStep(step - 1)}
                  aria-label="Étape précédente"
                  className="-ml-1.5 mt-0.5 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronLeft className="size-4" aria-hidden="true" />
                </button>
              )}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">{STEPS[step].title}</p>
                <p className="mt-1 text-xl font-semibold tracking-tight">
                  {
                    [
                      "Quel est votre véhicule ?",
                      "Choisissez votre prestation",
                      "Ajoutez des options",
                      "Votre estimation",
                      "Choisissez votre créneau",
                      "Vos informations",
                      "Réglez votre acompte",
                      "Réservation confirmée",
                    ][step]
                  }
                </p>
              </div>
            </div>

            {step === 0 && (
              <div className="grid grid-cols-2 gap-2.5">
                {DEMO_VEHICLE_TYPES.map((t, i) => (
                  <Choice key={t.id} selected={vehicle === i} onClick={() => setVehicle(i)} className="px-3 py-4 text-center">
                    <span className="block text-[14px] font-semibold">{t.name}</span>
                    <span className="mt-0.5 block text-[11.5px] text-muted-foreground">{t.examples}</span>
                  </Choice>
                ))}
              </div>
            )}

            {step === 1 && (
              <div className="flex flex-col gap-2">
                {DEMO_SERVICES.map((s) => (
                  <Choice
                    key={s.id}
                    selected={serviceId === s.id}
                    onClick={() => setServiceId(s.id)}
                    className="flex items-center justify-between gap-3 px-4 py-3.5"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-semibold">{s.name}</span>
                      <span className="block text-[11.5px] text-muted-foreground">
                        {s.category} · {formatMinutes(s.durations[vehicle])}
                      </span>
                    </span>
                    <span className="shrink-0 text-[14px] font-semibold">{formatEuro(s.prices[vehicle])}</span>
                  </Choice>
                ))}
              </div>
            )}

            {step === 2 && (
              <div className="flex flex-col gap-2">
                {DEMO_OPTIONS.map((o) => {
                  const on = optionIds.includes(o.id)
                  return (
                    <Choice
                      key={o.id}
                      selected={on}
                      onClick={() => toggleOption(o.id)}
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      <span
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center rounded-md border",
                          on ? "border-primary bg-primary text-primary-foreground" : "border-border",
                        )}
                      >
                        {on ? <Check className="size-3" strokeWidth={3} aria-hidden="true" /> : <Plus className="size-3 text-muted-foreground" aria-hidden="true" />}
                      </span>
                      <span className="flex-1 text-[13.5px] font-medium">{o.name}</span>
                      <span className="shrink-0 text-right text-[12px] text-muted-foreground">
                        +{formatEuro(o.price)} · +{formatMinutes(o.minutes)}
                      </span>
                    </Choice>
                  )
                })}
              </div>
            )}

            {step === 3 && (
              <div className="rounded-2xl border border-border bg-card p-4">
                <dl className="flex flex-col gap-2.5 text-[13px]">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Véhicule</dt>
                    <dd className="font-medium">{vehicleModel} · {DEMO_VEHICLE_TYPES[vehicle].name}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{service.name}</dt>
                    <dd className="shrink-0 font-medium">
                      {formatEuro(basePrice)} · {formatMinutes(baseMinutes)}
                    </dd>
                  </div>
                  {selectedOptions.map((o) => (
                    <div key={o.id} className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">{o.name}</dt>
                      <dd className="shrink-0 font-medium">
                        +{formatEuro(o.price)} · +{formatMinutes(o.minutes)}
                      </dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-4 flex items-end justify-between border-t border-border pt-4">
                  <div>
                    <p className="text-[11.5px] text-muted-foreground">Durée estimée</p>
                    <p className="text-lg font-semibold">{formatMinutes(minutes)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11.5px] text-muted-foreground">Total TTC</p>
                    <p className="text-2xl font-semibold tracking-tight">{formatEuro(total)}</p>
                  </div>
                </div>
              </div>
            )}

            {step === 4 && (
              <div>
                <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
                  {DAYS.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setDayId(d.id)}
                      aria-pressed={dayId === d.id}
                      className={cn(
                        "shrink-0 rounded-lg px-3.5 py-2 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        dayId === d.id
                          ? "bg-primary text-primary-foreground"
                          : "border border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-[11.5px] text-muted-foreground">
                  Durée {formatMinutes(minutes)} · battement de {BUFFER} min entre deux rendez-vous
                </p>
                {slots.length > 0 ? (
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {slots.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSlot(s)}
                        aria-pressed={validSlot === s}
                        className={cn(
                          "rounded-lg border py-2.5 font-mono text-[12.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          validSlot === s
                            ? "border-primary bg-primary/10 font-semibold text-foreground"
                            : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">
                    {day.timeOff
                      ? "Congés : aucun créneau proposé ce jour-là."
                      : `Aucun créneau libre assez long pour ${formatMinutes(minutes)} ce jour-là.`}
                  </p>
                )}
              </div>
            )}

            {step === 5 && (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-2.5">
                  <Field label="Prénom et nom" value="Thomas Martin" />
                  <Field label="Téléphone" value="06 12 34 56 78" />
                </div>
                <Field label="E-mail" value="thomas.martin@exemple.fr" />
                <div className="grid grid-cols-2 gap-2.5">
                  <Field label="Marque et modèle" value={vehicleModel} />
                  <Field label="Lieu" value="À l'atelier" />
                </div>
              </div>
            )}

            {step === 6 && (
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <p className="text-[13px] text-muted-foreground">Acompte ({Math.round(DEMO_DEPOSIT_RATE * 100)} %)</p>
                  <p className="text-xl font-semibold">{formatEuro(deposit)}</p>
                </div>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  Solde de {formatEuro(total - deposit)} réglé après la prestation.
                </p>
                <div className="mt-4 flex h-11 items-center gap-2.5 rounded-lg border border-border bg-background px-3 text-[13px] text-muted-foreground">
                  <CreditCard className="size-4" aria-hidden="true" />
                  <span className="font-mono">4242 4242 4242 4242</span>
                  <span className="ml-auto font-mono">12/28</span>
                </div>
                <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                  <Lock className="size-3" aria-hidden="true" />
                  Paiement sécurisé par Stripe
                </p>
              </div>
            )}

            {step === 7 && (
              <div className="my-auto flex flex-col items-center pb-6 text-center">
                <span className="flex size-14 items-center justify-center rounded-full bg-success text-success-foreground">
                  <Check className="size-7" strokeWidth={3} aria-hidden="true" />
                </span>
                <p className="mt-4 text-[14px] text-muted-foreground">
                  {service.name} · {DEMO_VEHICLE_TYPES[vehicle].name}
                </p>
                <p className="mt-1 text-lg font-semibold">
                  {day.label} à {validSlot ?? "14:30"} · {formatMinutes(minutes)}
                </p>
                <ul className="mt-6 flex flex-wrap justify-center gap-2">
                  {["Client ajouté", "Planning mis à jour", paid ? "Acompte payé" : "Sans acompte", "E-mail de confirmation"].map(
                    (e) => (
                      <li
                        key={e}
                        className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 font-mono text-[11px] text-muted-foreground"
                      >
                        <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
                        {e}
                      </li>
                    ),
                  )}
                </ul>
                <button
                  type="button"
                  onClick={restart}
                  className="mt-6 text-[13px] font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Recommencer la démo
                </button>
              </div>
            )}
          </div>

          {step < 7 && (
            <div className="flex items-center justify-between gap-4 border-t border-border bg-card/60 px-5 py-4 sm:px-7">
              <div aria-live="polite">
                <p className="text-[11.5px] text-muted-foreground">
                  Total · {formatMinutes(minutes)}
                  {validSlot && step >= 4 ? ` · ${day.label} ${validSlot}` : ""}
                </p>
                <p className="text-lg font-semibold tracking-tight">{formatEuro(total)}</p>
              </div>
              <button
                type="button"
                onClick={next}
                disabled={!canContinue}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-[13.5px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
              >
                {step === 6 ? `Payer ${formatEuro(deposit)}` : "Continuer"}
              </button>
            </div>
          )}
        </div>

        <div
          className={cn(
            "pointer-events-none mt-4 grid gap-2.5 transition-all duration-500 sm:grid-cols-2 lg:absolute lg:-right-8 lg:top-full lg:mt-5 lg:w-[calc(100%+2rem)]",
            step === 7 ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
          )}
          aria-hidden={step !== 7}
        >
          <EventToast icon={CalendarPlus} title="Nouvelle réservation" meta={`Côté admin · ${day.label} ${validSlot ?? "14:30"}`} />
          <EventToast icon={UserRound} tone="success" title="Fiche client créée" meta={`Thomas Martin · ${vehicleModel}`} />
        </div>
      </div>
    </div>
  )
}
