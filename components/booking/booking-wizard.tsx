"use client"

import { useState, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { withTenant } from "@/lib/tenant-link"
import { Check, ChevronLeft, ChevronRight, Loader2, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { StepVehicles } from "./step-vehicles"
import { StepDateTime } from "./step-datetime"
import { StepContact, type ContactData } from "./step-contact"
import { BookingSummary } from "./booking-summary"
import {
  lineTotals,
  isVehicleComplete,
  type VehicleSelection,
  type ServiceRow,
  type CategoryRow,
  type VehicleRow,
  type OptionRow,
  type PriceMap,
} from "./shared"
import type { TravelResult } from "@/lib/booking/types"
import { createBookingAction } from "@/app/(site)/reservation/actions"
import { formatDateLong, formatPrice } from "@/lib/format"

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
  // Tenant courant (aperçu/local : via ?tenant=). Doit être conservé lors de la
  // redirection vers la page de confirmation, sinon celle-ci ne retrouve pas la
  // réservation (mauvais tenant) et renvoie une 404.
  const tenant = useSearchParams().get("tenant")

  const [step, setStep] = useState(0)
  const [vehicles, setVehicles] = useState<VehicleSelection[]>([
    { uid: typeof crypto !== "undefined" ? crypto.randomUUID() : "v1", serviceId: null, vehicleTypeId: null, optionIds: [] },
  ])
  const [date, setDate] = useState<string | null>(null)
  const [startTime, setStartTime] = useState<string | null>(null)
  const [contact, setContact] = useState<ContactData>({ name: "", email: "", phone: "", address: "", notes: "" })
  const [travel, setTravel] = useState<TravelResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const completeVehicles = vehicles.filter(isVehicleComplete)
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
        selections: completeVehicles.map((v) => ({
          uid: v.uid,
          serviceId: v.serviceId as number,
          vehicleTypeId: v.vehicleTypeId as number,
          optionIds: v.optionIds,
          brand: v.brand,
          model: v.model,
          plate: v.plate,
        })),
        date,
        startTime,
        customer: { name: contact.name, email: contact.email, phone: contact.phone },
        address: contact.address,
        notes: contact.notes,
      })

      if (res.ok) {
        router.push(withTenant(`/reservation/confirmation?ref=${encodeURIComponent(res.reference)}`, tenant))
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
            onChange={setVehicles}
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
        />
      </aside>
    </div>
  )
}
