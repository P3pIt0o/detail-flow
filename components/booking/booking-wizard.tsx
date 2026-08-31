"use client"

import { useState, useMemo, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { withTenant } from "@/lib/tenant-link"
import { Check, ChevronLeft, ChevronRight, Loader2, AlertCircle, RotateCcw, History } from "lucide-react"
import { cn } from "@/lib/utils"
import { useBookingDraft } from "./use-booking-draft"
import { StepVehicles } from "./step-vehicles"
import { StepDateTime } from "./step-datetime"
import { StepContact, type ContactData } from "./step-contact"
import { BookingSummary } from "./booking-summary"
import {
  lineTotals,
  isVehicleComplete,
  completeServiceLines,
  newServiceLine,
  type VehicleSelection,
  type ServiceRow,
  type CategoryRow,
  type VehicleRow,
  type OptionRow,
  type PriceMap,
} from "./shared"
import type { TravelResult } from "@/lib/booking/types"
import { createBookingAction, validatePromoCodeAction } from "@/app/(site)/reservation/actions"
import { formatDateLong, formatPrice } from "@/lib/format"

type AppliedPromoUI = { code: string; discountType: "percent" | "fixed"; discountValue: number; discountCents: number }

type Props = {
  services: ServiceRow[]
  categories: CategoryRow[]
  vehicleTypes: VehicleRow[]
  options: OptionRow[]
  priceMap: PriceMap
  depositType: string
  depositValue: number
  roundTrip: boolean
  freeDistanceKm: number
}

const STEPS = ["Prestations", "Date & créneau", "Coordonnées", "Confirmation"]
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function BookingWizard(props: Props) {
  const { services, categories, vehicleTypes, options, priceMap, depositType, depositValue, roundTrip, freeDistanceKm } =
    props
 const router = useRouter()
const searchParams = useSearchParams()

// Tenant courant
const tenant = searchParams.get("tenant")

// Prestation éventuellement choisie depuis la page Prestations
const serviceParam = searchParams.get("service")
const requestedServiceId = serviceParam ? Number(serviceParam) : NaN

const initialServiceId =
  Number.isInteger(requestedServiceId) &&
  services.some((service) => service.id === requestedServiceId)
    ? requestedServiceId
    : null

const [step, setStep] = useState(0)

const [vehicles, setVehicles] = useState<VehicleSelection[]>([
  {
    uid: typeof crypto !== "undefined" ? crypto.randomUUID() : "v1",
    vehicleTypeId: null,
    services: [newServiceLine(initialServiceId)],
  },
])
  const [date, setDate] = useState<string | null>(null)
  const [startTime, setStartTime] = useState<string | null>(null)
  const [contact, setContact] = useState<ContactData>({ name: "", email: "", phone: "", address: "", notes: "" })
  const [travel, setTravel] = useState<TravelResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Code promo (validation 100 % serveur ; l'aperçu ne fait qu'afficher).
  const [promoInput, setPromoInput] = useState("")
  const [appliedPromo, setAppliedPromo] = useState<AppliedPromoUI | null>(null)
  const [promoError, setPromoError] = useState<string | null>(null)
  const [promoLoading, setPromoLoading] = useState(false)

  // Brouillon (LOT B, point 3) : sauvegarde/reprise. `restoreResolved` garantit
  // qu'on n'écrase JAMAIS un brouillon restauré avec les valeurs vides du montage.
  const { restored, hydrated, remember, setRemember, save, clear } = useBookingDraft(tenant)
  const [restoreResolved, setRestoreResolved] = useState(false)

  // S'il n'y a rien à restaurer, on autorise la sauvegarde dès l'hydratation.
  useEffect(() => {
    if (hydrated && !restored) setRestoreResolved(true)
  }, [hydrated, restored])

  // Auto-save (session par défaut, local 24 h si consentement) — uniquement
  // après hydratation ET résolution de la reprise. Le promo n'est stocké que
  // sous forme de texte saisi (jamais la remise, revalidée côté serveur).
  useEffect(() => {
    if (!hydrated || !restoreResolved) return
    save({ step, vehicles, date, startTime, contact, promoInput })
  }, [hydrated, restoreResolved, step, vehicles, date, startTime, contact, promoInput, save])

  function applyRestore() {
    if (!restored) return
    if (Array.isArray(restored.vehicles) && restored.vehicles.length > 0) setVehicles(restored.vehicles)
    setDate(restored.date)
    setStartTime(restored.startTime)
    setContact(restored.contact)
    setPromoInput(restored.promoInput)
    // La remise est réinitialisée : elle sera revalidée serveur si le client réapplique.
    setAppliedPromo(null)
    setStep(Math.min(restored.step, STEPS.length - 1))
    setRestoreResolved(true)
  }

  function discardRestore() {
    clear()
    setRestoreResolved(true)
  }

  const completeVehicles = vehicles.filter(isVehicleComplete)

  /**
   * Aplatit les véhicules (1 véhicule → N prestations) en une collection plate
   * de `BookingSelection` : une entrée par prestation, partageant les infos du
   * véhicule. Le serveur reste la seule source de vérité (prix/durée/dispo).
   */
  function selectionsPayload() {
    return completeVehicles.flatMap((v) =>
      completeServiceLines(v).map((line) => ({
        uid: `${v.uid}:${line.lid}`,
        serviceId: line.serviceId as number,
        vehicleTypeId: v.vehicleTypeId as number,
        optionIds: line.optionIds,
        brand: v.brand,
        model: v.model,
        plate: v.plate,
      })),
    )
  }

  async function applyPromo() {
    const code = promoInput.trim()
    if (!code) return
    setPromoLoading(true)
    setPromoError(null)
    try {
      const res = await validatePromoCodeAction({ selections: selectionsPayload(), code })
      if (res.ok) {
        setAppliedPromo({
          code: res.code,
          discountType: res.discountType,
          discountValue: res.discountValue,
          discountCents: res.discountCents,
        })
      } else {
        setAppliedPromo(null)
        setPromoError("Code promo invalide ou indisponible.")
      }
    } catch {
      setAppliedPromo(null)
      setPromoError("Code promo invalide ou indisponible.")
    } finally {
      setPromoLoading(false)
    }
  }

  function clearPromo() {
    setAppliedPromo(null)
    setPromoInput("")
    setPromoError(null)
  }
  const totalDuration = useMemo(
    () => completeVehicles.reduce((sum, v) => sum + lineTotals(v, services, options, priceMap).durationMin, 0),
    [completeVehicles, services, options, priceMap],
  )

  // Conditions de validation par étape.
  const stepValid = [
    completeVehicles.length > 0,
    Boolean(date && startTime),
    Boolean(contact.name.trim() && emailRe.test(contact.email) && contact.phone.trim() && travel?.ok),
    true,
  ]

  function next() {
    setError(null)
    // Changer de véhicules réinitialise le créneau (durée modifiée).
    if (step === 0) {
      setStartTime(null)
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  function prev() {
    setError(null)
    setStep((s) => Math.max(s - 1, 0))
  }

  async function submit() {
    if (!date || !startTime) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await createBookingAction({
        selections: selectionsPayload(),
        date,
        startTime,
        customer: { name: contact.name, email: contact.email, phone: contact.phone },
        address: contact.address,
        notes: contact.notes,
        promoCode: appliedPromo?.code,
      })

      if (res.ok) {
        // Réservation créée : le brouillon n'a plus lieu d'être (évite une
        // reprise fantôme, y compris au retour Stripe).
        clear()
        // Paiement en ligne activé par le pro → page de paiement DetailFlow.
        // Sinon, parcours actuel inchangé (page de confirmation).
        if (res.payUrl) {
          router.push(withTenant(`${res.payUrl}?ref=${encodeURIComponent(res.reference)}`, tenant))
        } else {
          router.push(withTenant(`/reservation/confirmation?ref=${encodeURIComponent(res.reference)}`, tenant))
        }
      } else {
        setError(res.error)
        // Créneau pris : renvoyer l'utilisateur à l'étape date.
        if (res.code === "slot_taken") {
          setStartTime(null)
          setStep(1)
        }
      }
    } catch {
      setError("Une erreur est survenue. Merci de réessayer.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <div>
        {/* Reprise d'un brouillon (LOT B) : proposition explicite, jamais
            d'écrasement automatique. Prix, promo et créneau seront revalidés. */}
        {hydrated && restored && !restoreResolved && (
          <div
            role="region"
            aria-label="Réservation en cours de saisie"
            className="mb-6 rounded-xl border border-primary/40 bg-primary/10 p-4"
          >
            <div className="flex items-start gap-3">
              <History className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-card-foreground">Reprendre votre réservation ?</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Nous avons retrouvé une réservation que vous aviez commencée. Le prix, le code promo et le créneau
                  seront revérifiés avant le paiement.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={applyRestore}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    <History className="h-4 w-4" />
                    Reprendre
                  </button>
                  <button
                    type="button"
                    onClick={discardRestore}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Recommencer
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Indicateur d'étapes */}
        <ol className="mb-8 flex items-center gap-2">
          {STEPS.map((label, i) => (
            <li key={label} className="flex flex-1 items-center gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors",
                    i < step
                      ? "bg-primary text-primary-foreground"
                      : i === step
                        ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {i < step ? <Check className="h-4 w-4" /> : i + 1}
                </span>
                <span
                  className={cn(
                    "hidden text-sm font-medium sm:inline",
                    i === step ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && <span className="h-px flex-1 bg-border" />}
            </li>
          ))}
        </ol>

        {/* Contenu de l'étape */}
        {step === 0 && (
          <StepVehicles
            vehicles={vehicles}
            onChange={(v) => {
              setVehicles(v)
              // Les choix changent : l'assiette éligible change → on réinitialise le promo.
              setAppliedPromo(null)
              setPromoError(null)
            }}
            services={services}
            categories={categories}
            vehicleTypes={vehicleTypes}
            options={options}
            priceMap={priceMap}
          />
        )}

        {step === 1 && (
          <StepDateTime
            date={date}
            startTime={startTime}
            durationMin={totalDuration}
            vehicleCount={completeVehicles.length}
            onSelectDate={(d) => {
              setDate(d)
              setStartTime(null)
            }}
            onSelectTime={setStartTime}
          />
        )}

        {step === 2 && (
          <StepContact
            contact={contact}
            onChange={setContact}
            travel={travel}
            onTravel={setTravel}
            roundTrip={roundTrip}
            freeDistanceKm={freeDistanceKm}
          />
        )}

        {step === 3 && (
          <div className="space-y-4 rounded-xl border border-border bg-card p-5">
            <h3 className="font-serif text-lg font-semibold text-card-foreground">Vérifiez votre réservation</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Date & heure</dt>
                <dd className="text-right capitalize text-card-foreground">
                  {date ? formatDateLong(date) : "—"} à {startTime}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Client</dt>
                <dd className="text-right text-card-foreground">
                  {contact.name}
                  <br />
                  {contact.email}
                  <br />
                  {contact.phone}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Adresse</dt>
                <dd className="max-w-[60%] text-right text-card-foreground">{contact.address}</dd>
              </div>
            </dl>

            {/* Code promo (validation serveur) */}
            <div className="border-t border-border pt-4">
              <label htmlFor="promo-code" className="mb-1.5 block text-sm font-medium text-card-foreground">
                Code promo
              </label>
              {appliedPromo ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm">
                  <span className="text-card-foreground">
                    Code <span className="font-semibold text-primary">{appliedPromo.code}</span> appliqué :{" "}
                    <span className="font-semibold">
                      {appliedPromo.discountType === "percent"
                        ? `-${appliedPromo.discountValue} %`
                        : `-${formatPrice(appliedPromo.discountValue)}`}
                    </span>{" "}
                    ({formatPrice(appliedPromo.discountCents)})
                  </span>
                  <button
                    type="button"
                    onClick={clearPromo}
                    className="shrink-0 text-xs font-medium text-muted-foreground underline hover:text-foreground"
                  >
                    Retirer
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    id="promo-code"
                    type="text"
                    value={promoInput}
                    onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                        e.preventDefault()
                        applyPromo()
                      }
                    }}
                    placeholder="Ex : WELCOME10"
                    className="h-11 flex-1 rounded-lg border border-border bg-background px-3 text-sm uppercase text-foreground placeholder:normal-case placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <button
                    type="button"
                    onClick={applyPromo}
                    disabled={promoLoading || !promoInput.trim()}
                    className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-40"
                  >
                    {promoLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                    Appliquer
                  </button>
                </div>
              )}
              {promoError && <p className="mt-1.5 text-xs text-destructive">{promoError}</p>}
            </div>

            {/* Mémorisation sur l'appareil (LOT B) : opt-in explicite, 24 h.
                Par défaut le brouillon reste en session (vidé à la fermeture). */}
            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary"
              />
              <span className="leading-relaxed">
                Mémoriser ma réservation sur cet appareil pendant 24 h pour la reprendre plus tard. Aucune donnée de
                paiement n&apos;est enregistrée.
              </span>
            </label>

            <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              En confirmant, vous acceptez nos conditions générales de vente. Un acompte pourra vous être demandé pour
              valider définitivement le rendez-vous ; vous recevrez toutes les instructions par email.
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="mt-8 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={prev}
            disabled={step === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
            Retour
          </button>

          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={next}
              disabled={!stepValid[step]}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Continuer
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmer la réservation
            </button>
          )}
        </div>
      </div>

      {/* Récapitulatif (sticky desktop) */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <BookingSummary
          vehicles={vehicles}
          services={services}
          vehicleTypes={vehicleTypes}
          options={options}
          priceMap={priceMap}
          travel={travel}
          depositType={depositType}
          depositValue={depositValue}
          discountCents={appliedPromo?.discountCents ?? 0}
          promoCode={appliedPromo?.code ?? null}
        />
      </aside>
    </div>
  )
}
