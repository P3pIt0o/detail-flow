"use client"

/**
 * CONFIGURATEUR DE RÉSERVATION AUTOMOBILE — CLEANYZER (maquette Phase 1).
 *
 * UX inspirée de la SIMPLICITÉ d'un configurateur moderne (réf. vista-clean.fr)
 * SANS copier sa marque, son contenu ni son code (cahier §4) : étapes courtes,
 * grosses zones tactiles, choix visuels, progression évidente, prix en direct,
 * retour arrière SANS perte des choix (cahier §10).
 *
 * DONNÉES = cahier uniquement. Diamond / "Sur mesure" → jamais de prix
 * fabriqué : bascule vers la demande adaptée. Déplacement = règle A/R exacte
 * (§9). Adresse (Google Maps) et disponibilités réelles (DetailFlow) seront
 * branchées en Phase 2 ; ici, sélecteurs de démonstration clairement signalés.
 */

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Car,
  Sparkles,
  Droplets,
  MapPin,
  CalendarDays,
  Clock,
  User,
  ShieldCheck,
  Info,
} from "lucide-react"
import { CleanyzerShell } from "./site-shell"
import { CLZ_NAV_ITEMS } from "./nav"
import { CLZ_PREVIEW_BASE } from "./tokens"
import {
  VEHICLES,
  formulasFor,
  optionsFor,
  travelFee,
  TRAVEL,
  type CleaningKind,
  type VehicleKey,
} from "./content"

const STEPS = [
  "Type de nettoyage",
  "Véhicule",
  "Formule",
  "Options",
  "Adresse",
  "Date & créneau",
  "Coordonnées",
  "Récapitulatif",
] as const

// Distances de démonstration (à l'aller). Phase 2 : calcul auto via Google Maps.
const DEMO_DISTANCES = [8, 15, 20, 25, 32] as const

function euro(n: number) {
  return `${n} €`
}

export function CleanyzerConfigurator() {
  const [step, setStep] = useState(0)
  const [kind, setKind] = useState<CleaningKind | null>(null)
  const [vehicle, setVehicle] = useState<VehicleKey | null>(null)
  const [formulaKey, setFormulaKey] = useState<string | null>(null)
  const [selectedOptions, setSelectedOptions] = useState<Record<string, number>>({}) // key -> quantity
  const [distanceOneWay, setDistanceOneWay] = useState<number | null>(null)
  const [address, setAddress] = useState("")
  const [date, setDate] = useState<string | null>(null)
  const [slot, setSlot] = useState<string | null>(null)
  const [contact, setContact] = useState({ firstName: "", lastName: "", phone: "", email: "", notes: "" })
  const [confirmed, setConfirmed] = useState(false)

  const formulas = kind ? formulasFor(kind) : []
  const options = kind ? optionsFor(kind) : []
  const formula = formulas.find((f) => f.key === formulaKey) ?? null
  const isDiamond = formula ? Object.values(formula.prices).every((p) => p == null) : false
  const formulaPrice = formula && vehicle ? formula.prices[vehicle] : null

  const { optionsTotal, hasQuoteOption } = useMemo(() => {
    let total = 0
    let quote = false
    for (const [key, qty] of Object.entries(selectedOptions)) {
      if (qty <= 0) continue
      const opt = options.find((o) => o.key === key)
      if (!opt) continue
      if (opt.price == null) quote = true
      else total += opt.price * qty
    }
    return { optionsTotal: total, hasQuoteOption: quote }
  }, [selectedOptions, options])

  const travel = distanceOneWay != null ? travelFee(distanceOneWay) : 0
  const total = (formulaPrice ?? 0) + optionsTotal + travel

  // Validité par étape → "Continuer" jamais bloqué après un choix valide (cahier §10).
  const canContinue = (() => {
    switch (step) {
      case 0:
        return kind != null
      case 1:
        return vehicle != null
      case 2:
        return formulaKey != null && !isDiamond
      case 3:
        return true // options facultatives
      case 4:
        return distanceOneWay != null && address.trim().length > 3
      case 5:
        return date != null && slot != null
      case 6:
        return (
          contact.firstName.trim() !== "" &&
          contact.lastName.trim() !== "" &&
          contact.phone.trim() !== "" &&
          contact.email.trim() !== ""
        )
      default:
        return true
    }
  })()

  function toggleOption(key: string) {
    setSelectedOptions((prev) => {
      const next = { ...prev }
      if (next[key]) delete next[key]
      else next[key] = 1
      return next
    })
  }
  function setQty(key: string, qty: number) {
    setSelectedOptions((prev) => ({ ...prev, [key]: Math.max(1, qty) }))
  }

  const perUnit = (label?: string) => Boolean(label && label.includes("/"))

  return (
    <CleanyzerShell navItems={CLZ_NAV_ITEMS} active="Réservation">
      <div className="clz-form-skin bg-[var(--clz-surface-2)]">
        <div className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-12">
          {!confirmed && <Stepper step={step} onGo={(i) => i < step && setStep(i)} />}

          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
            {/* Colonne principale */}
            <div className="clz-card min-h-[420px] p-5 md:p-8">
              {confirmed ? (
                <ConfirmationView
                  kind={kind}
                  onRestart={() => {
                    setConfirmed(false)
                    setStep(0)
                    setKind(null)
                    setVehicle(null)
                    setFormulaKey(null)
                    setSelectedOptions({})
                    setDistanceOneWay(null)
                    setAddress("")
                    setDate(null)
                    setSlot(null)
                  }}
                />
              ) : (
                <>
                  <StepHeader step={step} />

                  {/* Étape 1 — Type de nettoyage */}
                  {step === 0 && (
                    <div className="mt-6 grid gap-4 sm:grid-cols-2">
                      <ChoiceCard
                        active={kind === "interieur"}
                        icon={Sparkles}
                        title="Intérieur"
                        text="Habitacle, sièges, tapis, plastiques, vitres intérieures."
                        onClick={() => {
                          setKind("interieur")
                          setFormulaKey(null)
                          setSelectedOptions({})
                        }}
                      />
                      <ChoiceCard
                        active={kind === "exterieur"}
                        icon={Droplets}
                        title="Extérieur"
                        text="Carrosserie, jantes, séchage à la main, détails au pinceau."
                        onClick={() => {
                          setKind("exterieur")
                          setFormulaKey(null)
                          setSelectedOptions({})
                        }}
                      />
                    </div>
                  )}

                  {/* Étape 2 — Véhicule */}
                  {step === 1 && (
                    <div className="mt-6 grid gap-4 sm:grid-cols-3">
                      {VEHICLES.map((v) => (
                        <ChoiceCard
                          key={v.key}
                          active={vehicle === v.key}
                          icon={Car}
                          title={v.label}
                          text={v.hint}
                          onClick={() => setVehicle(v.key)}
                        />
                      ))}
                    </div>
                  )}

                  {/* Étape 3 — Formule (compatibles) */}
                  {step === 2 && (
                    <div className="mt-6 grid gap-4 sm:grid-cols-2">
                      {formulas.map((f) => {
                        const custom = Object.values(f.prices).every((p) => p == null)
                        const price = vehicle ? f.prices[vehicle] : null
                        const active = formulaKey === f.key
                        return (
                          <button
                            key={f.key}
                            type="button"
                            onClick={() => setFormulaKey(f.key)}
                            className={`clz-card relative flex flex-col p-5 text-left transition-colors ${
                              active ? "ring-2 ring-[var(--clz-blue)]" : "hover:border-[var(--clz-blue)]"
                            }`}
                          >
                            {f.highlight && (
                              <span className={`clz-badge absolute -top-2.5 left-5 ${f.highlight === "best-seller" ? "clz-badge-gold" : "clz-badge-blue"}`}>
                                {f.highlight === "best-seller" ? "Best seller" : "Populaire"}
                              </span>
                            )}
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="clz-display text-lg font-semibold text-[var(--clz-fg)]">{f.name}</span>
                              <span className="font-semibold text-[var(--clz-blue)]">
                                {custom ? "Sur mesure" : price != null ? euro(price) : "—"}
                              </span>
                            </div>
                            <span className="mt-2 text-sm leading-relaxed text-[var(--clz-muted)]">{f.content}</span>
                          </button>
                        )
                      })}

                      {isDiamond && (
                        <div className="sm:col-span-2 flex items-start gap-3 rounded-xl border border-[var(--clz-blue)] bg-[var(--clz-blue-soft)] p-4 text-sm">
                          <Info className="mt-0.5 h-4 w-4 flex-none text-[var(--clz-blue-strong)]" />
                          <div className="flex-1">
                            <p className="font-medium text-[var(--clz-fg)]">
                              La formule Diamond est entièrement personnalisée : aucun prix automatique.
                            </p>
                            <Link href={`${CLZ_PREVIEW_BASE}/demande`} className="clz-btn clz-btn-primary mt-3 !py-2 !text-sm">
                              Faire une demande sur mesure
                            </Link>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Étape 4 — Options */}
                  {step === 3 && (
                    <div className="mt-6">
                      {options.length === 0 && <p className="text-[var(--clz-muted)]">Aucune option pour cette prestation.</p>}
                      <ul className="grid gap-3">
                        {options.map((o) => {
                          const active = Boolean(selectedOptions[o.key])
                          const unit = perUnit(o.priceLabel)
                          return (
                            <li key={o.key} className={`clz-card flex items-center gap-3 p-3.5 ${active ? "ring-1 ring-[var(--clz-blue)]" : ""}`}>
                              <button
                                type="button"
                                onClick={() => toggleOption(o.key)}
                                aria-pressed={active}
                                className={`flex h-6 w-6 flex-none items-center justify-center rounded-md border ${
                                  active ? "border-[var(--clz-blue)] bg-[var(--clz-blue)] text-white" : "border-[var(--clz-line)]"
                                }`}
                              >
                                {active && <Check className="h-4 w-4" />}
                              </button>
                              <div className="min-w-0 flex-1">
                                <button type="button" onClick={() => toggleOption(o.key)} className="block text-left">
                                  <span className="text-[var(--clz-fg)]">{o.label}</span>
                                  {o.note && <span className="block text-xs text-[var(--clz-muted)]">{o.note}</span>}
                                </button>
                              </div>
                              {active && unit && o.price != null && (
                                <div className="flex items-center overflow-hidden rounded-lg border border-[var(--clz-line)]">
                                  <button type="button" onClick={() => setQty(o.key, (selectedOptions[o.key] ?? 1) - 1)} className="px-2.5 py-1 text-[var(--clz-fg)]">−</button>
                                  <span className="min-w-6 text-center text-sm text-[var(--clz-fg)]">{selectedOptions[o.key]}</span>
                                  <button type="button" onClick={() => setQty(o.key, (selectedOptions[o.key] ?? 1) + 1)} className="px-2.5 py-1 text-[var(--clz-fg)]">+</button>
                                </div>
                              )}
                              <span className="whitespace-nowrap text-sm font-semibold text-[var(--clz-fg)]">
                                {o.priceLabel ?? euro(o.price ?? 0)}
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                      {hasQuoteOption && (
                        <p className="mt-4 flex items-start gap-2 text-xs text-[var(--clz-muted)]">
                          <Info className="mt-0.5 h-3.5 w-3.5 flex-none" />
                          Certaines options sont chiffrées après état des lieux : elles ne sont pas ajoutées au total automatique.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Étape 5 — Adresse + déplacement */}
                  {step === 4 && (
                    <div className="mt-6">
                      <label htmlFor="clz-address" className="block text-sm font-medium text-[var(--clz-fg)]">Adresse d'intervention</label>
                      <input
                        id="clz-address"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="Numéro, rue, commune…"
                        className="mt-2 w-full rounded-xl border border-[var(--clz-line)] bg-white px-4 py-3 text-[var(--clz-fg)] outline-none focus:border-[var(--clz-blue)] focus:ring-2 focus:ring-[var(--clz-blue-soft)]"
                      />
                      <div className="mt-3 flex items-start gap-2 rounded-lg bg-[var(--clz-blue-soft)] p-3 text-xs text-[var(--clz-blue-strong)]">
                        <Info className="mt-0.5 h-3.5 w-3.5 flex-none" />
                        Maquette : la saisie d'adresse Google Maps et le calcul de distance automatique seront branchés en Phase 2. Choisissez une distance de démonstration ci-dessous.
                      </div>

                      <p className="mt-6 text-sm font-medium text-[var(--clz-fg)]">Distance estimée à l'aller (depuis Annecy)</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {DEMO_DISTANCES.map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setDistanceOneWay(d)}
                            className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                              distanceOneWay === d
                                ? "border-[var(--clz-blue)] bg-[var(--clz-blue)] text-white"
                                : "border-[var(--clz-line)] text-[var(--clz-fg)] hover:border-[var(--clz-blue)]"
                            }`}
                          >
                            {d} km
                          </button>
                        ))}
                      </div>

                      {distanceOneWay != null && (
                        <div className="mt-5 rounded-xl border border-[var(--clz-line)] p-4 text-sm">
                          <div className="flex justify-between">
                            <span className="text-[var(--clz-muted)]">Zone incluse ({TRAVEL.includedKmOneWay} km aller / {TRAVEL.includedKmRoundTrip} km A-R)</span>
                            <span className="font-medium text-[var(--clz-fg)]">Incluse</span>
                          </div>
                          <div className="mt-1.5 flex justify-between">
                            <span className="text-[var(--clz-muted)]">
                              {distanceOneWay <= TRAVEL.includedKmOneWay
                                ? "Aucun kilomètre supplémentaire"
                                : `${(distanceOneWay - TRAVEL.includedKmOneWay) * 2} km supplémentaires A-R × ${TRAVEL.pricePerExtraKm} €`}
                            </span>
                            <span className="font-semibold text-[var(--clz-fg)]">{euro(travel)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Étape 6 — Date & créneau */}
                  {step === 5 && <DateSlotStep date={date} slot={slot} setDate={setDate} setSlot={setSlot} />}

                  {/* Étape 7 — Coordonnées */}
                  {step === 6 && (
                    <div className="mt-6 grid gap-4 sm:grid-cols-2">
                      <Field label="Prénom" value={contact.firstName} onChange={(v) => setContact((c) => ({ ...c, firstName: v }))} />
                      <Field label="Nom" value={contact.lastName} onChange={(v) => setContact((c) => ({ ...c, lastName: v }))} />
                      <Field label="Téléphone" type="tel" value={contact.phone} onChange={(v) => setContact((c) => ({ ...c, phone: v }))} />
                      <Field label="E-mail" type="email" value={contact.email} onChange={(v) => setContact((c) => ({ ...c, email: v }))} />
                      <div className="sm:col-span-2">
                        <label htmlFor="clz-notes" className="block text-sm font-medium text-[var(--clz-fg)]">Précisions (facultatif)</label>
                        <textarea
                          id="clz-notes"
                          value={contact.notes}
                          onChange={(e) => setContact((c) => ({ ...c, notes: e.target.value }))}
                          rows={3}
                          className="mt-2 w-full rounded-xl border border-[var(--clz-line)] bg-white px-4 py-3 text-[var(--clz-fg)] outline-none focus:border-[var(--clz-blue)] focus:ring-2 focus:ring-[var(--clz-blue-soft)]"
                          placeholder="État du véhicule, accès, demandes particulières…"
                        />
                      </div>
                    </div>
                  )}

                  {/* Étape 8 — Récapitulatif */}
                  {step === 7 && (
                    <RecapView
                      kind={kind}
                      vehicleLabel={VEHICLES.find((v) => v.key === vehicle)?.label ?? null}
                      formulaName={formula?.name ?? null}
                      formulaPrice={formulaPrice}
                      options={Object.entries(selectedOptions)
                        .filter(([, q]) => q > 0)
                        .map(([key, q]) => {
                          const o = options.find((op) => op.key === key)!
                          return { label: o.label, qty: q, price: o.price, priceLabel: o.priceLabel }
                        })}
                      address={address}
                      distanceOneWay={distanceOneWay}
                      travel={travel}
                      date={date}
                      slot={slot}
                      contact={contact}
                      total={total}
                      hasQuoteOption={hasQuoteOption}
                    />
                  )}

                  {/* Navigation */}
                  <div className="mt-8 flex items-center justify-between gap-3 border-t border-[var(--clz-line)] pt-6">
                    {step > 0 ? (
                      <button type="button" onClick={() => setStep((s) => s - 1)} className="clz-btn clz-btn-ghost">
                        <ChevronLeft className="h-4 w-4" />
                        Retour
                      </button>
                    ) : (
                      <span />
                    )}
                    {step < STEPS.length - 1 ? (
                      <button
                        type="button"
                        disabled={!canContinue}
                        onClick={() => setStep((s) => s + 1)}
                        className="clz-btn clz-btn-primary disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Continuer
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    ) : (
                      <button type="button" onClick={() => setConfirmed(true)} className="clz-btn clz-btn-primary">
                        Valider ma réservation
                        <Check className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Récapitulatif live (desktop) */}
            {!confirmed && (
              <aside className="hidden lg:block">
                <div className="sticky top-24">
                  <LiveSummary
                    kind={kind}
                    vehicleLabel={VEHICLES.find((v) => v.key === vehicle)?.label ?? null}
                    formulaName={formula?.name ?? null}
                    formulaPrice={formulaPrice}
                    optionsCount={Object.values(selectedOptions).filter((q) => q > 0).length}
                    optionsTotal={optionsTotal}
                    travel={travel}
                    hasDistance={distanceOneWay != null}
                    total={total}
                    isDiamond={isDiamond}
                    hasQuoteOption={hasQuoteOption}
                  />
                </div>
              </aside>
            )}
          </div>
        </div>

        {/* Barre total sticky (mobile) */}
        {!confirmed && !isDiamond && (
          <div className="sticky bottom-16 z-30 border-t border-[var(--clz-line)] bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-[var(--clz-muted)]">Total estimé</p>
                <p className="clz-display text-xl font-semibold text-[var(--clz-fg)]">{formulaPrice != null ? euro(total) : "—"}</p>
              </div>
              <p className="text-xs text-[var(--clz-muted)]">
                {hasQuoteOption ? "+ options sur devis" : "déplacement inclus"}
              </p>
            </div>
          </div>
        )}
      </div>
    </CleanyzerShell>
  )
}

/* ---------- Sous-composants ---------- */

function Stepper({ step, onGo }: { step: number; onGo: (i: number) => void }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
      {STEPS.map((label, i) => {
        const done = i < step
        const active = i === step
        return (
          <li key={label} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onGo(i)}
              disabled={i >= step}
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "bg-[var(--clz-blue)] text-white"
                  : done
                    ? "bg-[var(--clz-blue-soft)] text-[var(--clz-blue-strong)]"
                    : "text-[var(--clz-muted)]"
              } ${i < step ? "cursor-pointer" : "cursor-default"}`}
            >
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${done ? "bg-[var(--clz-blue)] text-white" : active ? "bg-white/25" : "bg-[var(--clz-line)]"}`}>
                {done ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </button>
            {i < STEPS.length - 1 && <ChevronRight className="hidden h-3 w-3 text-[var(--clz-line)] md:block" />}
          </li>
        )
      })}
    </ol>
  )
}

const STEP_HEADINGS = [
  { t: "Que voulez-vous nettoyer ?", s: "Intérieur ou extérieur du véhicule." },
  { t: "Quel type de véhicule ?", s: "Le tarif s'ajuste selon le gabarit." },
  { t: "Choisissez votre formule", s: "Seules les formules compatibles s'affichent." },
  { t: "Ajoutez des options", s: "Facultatif — le total se met à jour en direct." },
  { t: "Où intervenons-nous ?", s: "Adresse et calcul du déplacement." },
  { t: "Choisissez un créneau", s: "Du lundi au dimanche, de 7 h 30 à 20 h 30." },
  { t: "Vos coordonnées", s: "Pour confirmer et vous tenir informé." },
  { t: "Récapitulatif", s: "Vérifiez avant de valider." },
]

function StepHeader({ step }: { step: number }) {
  const h = STEP_HEADINGS[step]
  return (
    <div>
      <h1 className="clz-display clz-h3 text-[var(--clz-fg)]">{h.t}</h1>
      <p className="mt-1 text-sm text-[var(--clz-muted)]">{h.s}</p>
    </div>
  )
}

function ChoiceCard({
  active,
  icon: Icon,
  title,
  text,
  onClick,
}: {
  active: boolean
  icon: React.ComponentType<{ className?: string }>
  title: string
  text: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`clz-card flex flex-col items-start gap-3 p-6 text-left transition-all ${
        active ? "ring-2 ring-[var(--clz-blue)]" : "hover:-translate-y-0.5 hover:border-[var(--clz-blue)]"
      }`}
    >
      <span className={`flex h-12 w-12 items-center justify-center rounded-full ${active ? "bg-[var(--clz-blue)] text-white" : "bg-[var(--clz-blue-soft)] text-[var(--clz-blue)]"}`}>
        <Icon className="h-6 w-6" />
      </span>
      <span className="clz-display text-lg font-semibold text-[var(--clz-fg)]">{title}</span>
      <span className="text-sm leading-relaxed text-[var(--clz-muted)]">{text}</span>
    </button>
  )
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
}) {
  const id = `clz-field-${label.toLowerCase().replace(/[^a-z]/g, "")}`
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-[var(--clz-fg)]">{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-xl border border-[var(--clz-line)] bg-white px-4 py-3 text-[var(--clz-fg)] outline-none focus:border-[var(--clz-blue)] focus:ring-2 focus:ring-[var(--clz-blue-soft)]"
      />
    </div>
  )
}

function DateSlotStep({
  date,
  slot,
  setDate,
  setSlot,
}: {
  date: string | null
  slot: string | null
  setDate: (d: string) => void
  setSlot: (s: string) => void
}) {
  const days = useMemo(() => {
    const out: { iso: string; label: string }[] = []
    const now = new Date()
    for (let i = 1; i <= 14; i++) {
      const d = new Date(now)
      d.setDate(now.getDate() + i)
      out.push({
        iso: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }),
      })
    }
    return out
  }, [])
  const slots = ["08:00", "09:30", "11:00", "14:00", "15:30", "17:00", "18:30"]
  return (
    <div className="mt-6">
      <div className="flex items-start gap-2 rounded-lg bg-[var(--clz-blue-soft)] p-3 text-xs text-[var(--clz-blue-strong)]">
        <Info className="mt-0.5 h-3.5 w-3.5 flex-none" />
        Maquette : créneaux de démonstration. Les disponibilités réelles proviendront de DetailFlow en Phase 2.
      </div>
      <p className="mt-5 flex items-center gap-2 text-sm font-medium text-[var(--clz-fg)]"><CalendarDays className="h-4 w-4" /> Date</p>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
        {days.map((d) => (
          <button
            key={d.iso}
            type="button"
            onClick={() => setDate(d.iso)}
            className={`flex-none whitespace-nowrap rounded-xl border px-4 py-3 text-sm capitalize transition-colors ${
              date === d.iso ? "border-[var(--clz-blue)] bg-[var(--clz-blue)] text-white" : "border-[var(--clz-line)] text-[var(--clz-fg)] hover:border-[var(--clz-blue)]"
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>
      <p className="mt-6 flex items-center gap-2 text-sm font-medium text-[var(--clz-fg)]"><Clock className="h-4 w-4" /> Créneau</p>
      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {slots.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSlot(s)}
            className={`rounded-xl border px-3 py-2.5 text-sm transition-colors ${
              slot === s ? "border-[var(--clz-blue)] bg-[var(--clz-blue)] text-white" : "border-[var(--clz-line)] text-[var(--clz-fg)] hover:border-[var(--clz-blue)]"
            }`}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}

type RecapProps = {
  kind: CleaningKind | null
  vehicleLabel: string | null
  formulaName: string | null
  formulaPrice: number | null
  options: { label: string; qty: number; price: number | null; priceLabel?: string }[]
  address: string
  distanceOneWay: number | null
  travel: number
  date: string | null
  slot: string | null
  contact: { firstName: string; lastName: string; phone: string; email: string; notes: string }
  total: number
  hasQuoteOption: boolean
}

function RecapView(p: RecapProps) {
  const dateLabel = p.date ? new Date(p.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) : "—"
  return (
    <div className="mt-6 space-y-4 text-sm">
      <RecapRow label="Prestation" value={p.kind === "interieur" ? "Nettoyage intérieur" : p.kind === "exterieur" ? "Nettoyage extérieur" : "—"} />
      <RecapRow label="Véhicule" value={p.vehicleLabel ?? "—"} />
      <RecapRow label="Formule" value={p.formulaName ?? "—"} price={p.formulaPrice != null ? euro(p.formulaPrice) : undefined} />
      {p.options.length > 0 && (
        <div className="border-t border-[var(--clz-line)] pt-3">
          <p className="mb-2 font-medium text-[var(--clz-fg)]">Options</p>
          <ul className="space-y-1.5">
            {p.options.map((o) => (
              <li key={o.label} className="flex justify-between gap-3 text-[var(--clz-muted)]">
                <span>{o.label}{o.qty > 1 ? ` × ${o.qty}` : ""}</span>
                <span className="text-[var(--clz-fg)]">{o.price != null ? euro(o.price * o.qty) : o.priceLabel ?? "sur devis"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <RecapRow
        label="Déplacement"
        value={p.address ? `${p.address}${p.distanceOneWay != null ? ` · ${p.distanceOneWay} km aller` : ""}` : "—"}
        price={euro(p.travel)}
      />
      <RecapRow label="Date & créneau" value={`${dateLabel}${p.slot ? ` · ${p.slot}` : ""}`} />
      <RecapRow label="Client" value={`${p.contact.firstName} ${p.contact.lastName} · ${p.contact.phone}`} />
      {p.contact.notes && <RecapRow label="Précisions" value={p.contact.notes} />}

      <div className="mt-2 flex items-center justify-between border-t-2 border-[var(--clz-black)] pt-4">
        <span className="clz-display text-lg font-semibold text-[var(--clz-fg)]">Total</span>
        <span className="clz-display text-2xl font-semibold text-[var(--clz-blue)]">{p.formulaPrice != null ? euro(p.total) : "Sur devis"}</span>
      </div>
      {p.hasQuoteOption && <p className="text-xs text-[var(--clz-muted)]">Options sur devis non incluses : chiffrées après état des lieux.</p>}
    </div>
  )
}

function RecapRow({ label, value, price }: { label: string; value: string; price?: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-[var(--clz-muted)]">{label}</span>
      <span className="flex-1 text-right font-medium text-[var(--clz-fg)]">
        {value} {price && <span className="ml-2 text-[var(--clz-blue)]">{price}</span>}
      </span>
    </div>
  )
}

function LiveSummary({
  kind,
  vehicleLabel,
  formulaName,
  formulaPrice,
  optionsCount,
  optionsTotal,
  travel,
  hasDistance,
  total,
  isDiamond,
  hasQuoteOption,
}: {
  kind: CleaningKind | null
  vehicleLabel: string | null
  formulaName: string | null
  formulaPrice: number | null
  optionsCount: number
  optionsTotal: number
  travel: number
  hasDistance: boolean
  total: number
  isDiamond: boolean
  hasQuoteOption: boolean
}) {
  return (
    <div className="clz-card overflow-hidden">
      <div className="clz-dark px-5 py-4">
        <p className="text-xs uppercase tracking-wider text-[var(--clz-on-dark-muted)]">Votre réservation</p>
        <p className="clz-display mt-1 text-2xl font-semibold text-white">
          {isDiamond ? "Sur mesure" : formulaPrice != null ? euro(total) : "—"}
        </p>
      </div>
      <dl className="space-y-2.5 p-5 text-sm">
        <SummaryRow label="Prestation" value={kind === "interieur" ? "Intérieur" : kind === "exterieur" ? "Extérieur" : null} />
        <SummaryRow label="Véhicule" value={vehicleLabel} />
        <SummaryRow label="Formule" value={formulaName} price={formulaPrice != null ? euro(formulaPrice) : isDiamond ? "Sur mesure" : undefined} />
        <SummaryRow label="Options" value={optionsCount > 0 ? `${optionsCount} sélectionnée${optionsCount > 1 ? "s" : ""}` : "Aucune"} price={optionsTotal > 0 ? euro(optionsTotal) : undefined} />
        <SummaryRow label="Déplacement" value={hasDistance ? (travel > 0 ? "Hors zone incluse" : "Zone incluse") : "À définir"} price={hasDistance ? euro(travel) : undefined} />
      </dl>
      {hasQuoteOption && (
        <p className="border-t border-[var(--clz-line)] px-5 py-3 text-xs text-[var(--clz-muted)]">
          + options sur devis (après état des lieux)
        </p>
      )}
      <p className="flex items-center gap-1.5 border-t border-[var(--clz-line)] px-5 py-3 text-xs text-[var(--clz-muted)]">
        <ShieldCheck className="h-3.5 w-3.5" /> Prix transparents, déplacement A/R inclus dans le total.
      </p>
    </div>
  )
}

function SummaryRow({ label, value, price }: { label: string; value: string | null; price?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[var(--clz-muted)]">{label}</dt>
      <dd className="text-right font-medium text-[var(--clz-fg)]">
        {value ?? "—"} {price && <span className="ml-1.5 text-[var(--clz-blue)]">{price}</span>}
      </dd>
    </div>
  )
}

function ConfirmationView({ kind, onRestart }: { kind: CleaningKind | null; onRestart: () => void }) {
  void kind
  return (
    <div className="flex flex-col items-center py-10 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--clz-blue-soft)] text-[var(--clz-blue)]">
        <Check className="h-8 w-8" />
      </span>
      <h1 className="clz-display clz-h2 mt-6 text-[var(--clz-fg)]">Demande de réservation envoyée</h1>
      <p className="mt-3 max-w-md text-pretty leading-relaxed text-[var(--clz-muted)]">
        Merci ! Votre demande a bien été prise en compte. CLEANYZER vous confirme le créneau et les
        détails. Aucun double envoi n'est effectué.
      </p>
      <p className="mt-2 max-w-md text-xs text-[var(--clz-muted)]">
        Maquette : en Phase 2, la réservation sera enregistrée dans DetailFlow (admin, notifications, paiement d'acompte éventuel).
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link href={CLZ_PREVIEW_BASE} className="clz-btn clz-btn-ghost">Retour à l'accueil</Link>
        <button type="button" onClick={onRestart} className="clz-btn clz-btn-primary">Nouvelle réservation</button>
      </div>
    </div>
  )
}
