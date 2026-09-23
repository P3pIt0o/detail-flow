"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { History, RotateCcw } from "lucide-react"
import { withTenant } from "@/lib/tenant-link"
import { useBookingDraft } from "@/components/booking/use-booking-draft"
import type { OptionRow, PriceMap, ServiceRow, VehicleRow } from "@/components/booking/shared"
import type { TravelResult } from "@/lib/booking/types"
import type { LocationType, PublicLocation } from "@/lib/booking/location-shared"
import { createBookingAction, validatePromoCodeAction } from "@/app/(site)/reservation/actions"
import {
  bookingEstimate,
  fromVehicleSelections,
  isV2VehicleComplete,
  joinName,
  newV2Vehicle,
  splitName,
  toVehicleSelections,
  type PaymentPlan,
  type V2Vehicle,
} from "@/lib/booking/v2"
import { BOOKING_V2_STEP_COUNT, StepHeader } from "./step-header"
import { StepService } from "./step-service"
import { StepVehicle } from "./step-vehicle"
import { StepDateTime } from "./step-datetime"
import { StepContact, type AppliedPromoV2, type ContactV2 } from "./step-contact"
import { StickyBar } from "./sticky-bar"
import { SuccessScreen } from "./success-screen"

export type BookingV2Props = {
  services: ServiceRow[]
  vehicleTypes: VehicleRow[]
  options: OptionRow[]
  priceMap: PriceMap
  depositType: string
  depositValue: number
  roundTrip: boolean
  freeDistanceKm: number
  paymentPlan: PaymentPlan
  maxVehicles: number
  location: PublicLocation
  embed?: boolean
}

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const STEP_COPY = [
  { title: "Choisissez votre prestation", subtitle: "Sélectionnez la formule qui vous convient." },
  { title: "Votre véhicule", subtitle: "Le prix s'ajuste selon le type de véhicule et les options." },
  { title: "Lieu, date et créneau", subtitle: "Seuls les créneaux réellement disponibles sont proposés." },
  { title: "Vos coordonnées", subtitle: "Vérifiez votre récapitulatif puis confirmez." },
]

export function BookingV2(props: BookingV2Props) {
  const { services, vehicleTypes, options, priceMap, paymentPlan, location, embed } = props
  // Un seul lieu proposé : il est imposé, aucune question posée au client.
  const forcedLocation: LocationType | null =
    location.workshop && !location.mobile ? "workshop" : location.mobile && !location.workshop ? "client" : null
  const router = useRouter()
  const searchParams = useSearchParams()
  const tenant = searchParams.get("tenant")
  const rootRef = useRef<HTMLDivElement>(null)

  // Prestation pré-choisie (lien depuis une page prestation) ou unique : l'étape 1 est sautée.
  const requested = Number(searchParams.get("service"))
  const initialServiceId = services.some((s) => s.id === requested)
    ? requested
    : services.length === 1
      ? services[0].id
      : null

  const [step, setStep] = useState(initialServiceId != null ? 1 : 0)
  const [serviceId, setServiceId] = useState<number | null>(initialServiceId)
  const [vehicles, setVehicles] = useState<V2Vehicle[]>(() => [newV2Vehicle(vehicleTypes)])
  const [date, setDate] = useState<string | null>(null)
  const [startTime, setStartTime] = useState<string | null>(null)
  const [locationType, setLocationType] = useState<LocationType | null>(forcedLocation)
  const [address, setAddress] = useState("")
  const [travel, setTravel] = useState<TravelResult | null>(null)
  const [contact, setContact] = useState<ContactV2>({ firstName: "", lastName: "", email: "", phone: "", notes: "" })
  const [promoInput, setPromoInput] = useState("")
  const [appliedPromo, setAppliedPromo] = useState<AppliedPromoV2 | null>(null)
  const [promoError, setPromoError] = useState<string | null>(null)
  const [promoLoading, setPromoLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ reference: string; accessToken: string; confirmationUrl: string } | null>(
    null,
  )

  // Brouillon : même mécanisme (clé tenant, session/24 h sur consentement) que le tunnel historique.
  const { restored, hydrated, remember, setRemember, save, markPendingPayment, clear } = useBookingDraft(tenant)
  const [restoreResolved, setRestoreResolved] = useState(false)

  useEffect(() => {
    if (hydrated && !restored) setRestoreResolved(true)
  }, [hydrated, restored])

  function draftState() {
    return {
      step,
      vehicles: toVehicleSelections(vehicles, serviceId),
      date,
      startTime,
      contact: { name: joinName(contact.firstName, contact.lastName), email: contact.email, phone: contact.phone, address, notes: contact.notes },
      promoInput,
    }
  }

  useEffect(() => {
    if (!hydrated || !restoreResolved || success || restored?.pendingPayment) return
    save(draftState())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, restoreResolved, success, restored, save, step, serviceId, vehicles, date, startTime, contact, address, promoInput])

  function applyRestore() {
    if (!restored) return
    if (restored.pendingPayment) {
      router.push(withTenant(restored.pendingPayment.payPath, tenant))
      return
    }
    const r = fromVehicleSelections(restored.vehicles)
    if (r.serviceId != null && services.some((s) => s.id === r.serviceId)) setServiceId(r.serviceId)
    if (r.vehicles.length > 0) setVehicles(r.vehicles)
    setDate(restored.date)
    setStartTime(restored.startTime)
    const { firstName, lastName } = splitName(restored.contact.name)
    setContact({ firstName, lastName, email: restored.contact.email, phone: restored.contact.phone, notes: restored.contact.notes })
    setAddress(restored.contact.address)
    setPromoInput(restored.promoInput)
    setStep(Math.min(restored.step, BOOKING_V2_STEP_COUNT - 1))
    setRestoreResolved(true)
  }

  function discardRestore() {
    clear()
    setRestoreResolved(true)
  }

  const estimate = bookingEstimate(vehicles, serviceId, services, options, priceMap)
  const atWorkshop = locationType === "workshop"
  const travelFeeCents = !atWorkshop && travel?.ok ? travel.feeCents : 0
  const locationReady = atWorkshop || (locationType === "client" && Boolean(travel?.ok))
  const discountCents = appliedPromo?.discountCents ?? 0
  const totalCents = Math.max(0, estimate.priceCents + travelFeeCents - discountCents)

  const contactValid = Boolean(
    contact.firstName.trim() && contact.lastName.trim() && emailRe.test(contact.email.trim()) && contact.phone.trim(),
  )
  const stepValid = [
    serviceId != null,
    vehicles.length > 0 && vehicles.every(isV2VehicleComplete),
    Boolean(date && startTime && locationReady),
    contactValid,
  ]
  const stepHint = [
    null,
    "Renseignez le type, la marque et le modèle.",
    locationType === null
      ? "Choisissez où réaliser la prestation."
      : !locationReady
        ? "Vérifiez votre adresse d'intervention."
        : "Choisissez un créneau.",
    "Complétez vos coordonnées.",
  ]

  function goTo(next: number) {
    setError(null)
    setStep(next)
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  // Toute modification de la composition change la durée et l'assiette : créneau et promo sont revalidés.
  function invalidateSelection() {
    setStartTime(null)
    setAppliedPromo(null)
    setPromoError(null)
  }

  function selectService(id: number) {
    if (id !== serviceId) {
      setServiceId(id)
      invalidateSelection()
    }
    goTo(1)
  }

  function selectionsPayload() {
    return vehicles.map((v) => ({
      uid: v.uid,
      serviceId: serviceId as number,
      vehicleTypeId: v.vehicleTypeId as number,
      optionIds: v.optionIds,
      brand: v.brand.trim(),
      model: v.model.trim(),
    }))
  }

  async function applyPromo() {
    const code = promoInput.trim()
    if (!code || serviceId == null) return
    setPromoLoading(true)
    setPromoError(null)
    try {
      const res = await validatePromoCodeAction({ selections: selectionsPayload(), code })
      if (res.ok) {
        setAppliedPromo({ code: res.code, discountType: res.discountType, discountValue: res.discountValue, discountCents: res.discountCents })
      } else {
        setAppliedPromo(null)
        setPromoError(
          res.reason === "not_applicable_services"
            ? "Ce code ne s'applique pas à la prestation sélectionnée."
            : "Code promo invalide ou indisponible.",
        )
      }
    } catch {
      setAppliedPromo(null)
      setPromoError("Code promo invalide ou indisponible.")
    } finally {
      setPromoLoading(false)
    }
  }

  async function submit() {
    if (!date || !startTime || serviceId == null) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await createBookingAction({
        selections: selectionsPayload(),
        date,
        startTime,
        customer: {
          name: joinName(contact.firstName, contact.lastName),
          email: contact.email.trim(),
          phone: contact.phone.trim(),
        },
        address: atWorkshop ? "" : address,
        locationType: locationType ?? undefined,
        notes: contact.notes,
        promoCode: appliedPromo?.code,
      })
      if (!res.ok) {
        setError(res.error)
        if (res.code === "slot_taken") {
          setStartTime(null)
          goTo(2)
        } else if (res.code === "out_of_range") {
          setTravel(null)
          goTo(2)
        }
        return
      }
      if (res.payUrl) {
        // La réservation existe : on garde un brouillon « paiement en attente » (reprise sans doublon).
        const payPath = res.payUrl
        markPendingPayment(draftState(), { reference: res.reference, payPath })
        router.push(withTenant(payPath, tenant))
        return
      }
      clear()
      setSuccess({ reference: res.reference, accessToken: res.accessToken, confirmationUrl: res.confirmationUrl })
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    } catch {
      setError("Une erreur est survenue. Merci de réessayer.")
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div ref={rootRef} className="mx-auto w-full max-w-lg scroll-mt-24 px-4 pb-12">
        <SuccessScreen
          reference={success.reference}
          accessToken={success.accessToken}
          confirmationUrl={success.confirmationUrl}
          tenant={tenant}
        />
      </div>
    )
  }

  const online = paymentPlan === "online_full" || paymentPlan === "online_deposit" || paymentPlan === "choice"
  const ctaLabel = step < 3 ? "Continuer" : online ? "Payer et réserver" : "Confirmer"

  return (
    <div ref={rootRef} className={embed ? "w-full scroll-mt-4" : "w-full scroll-mt-24 pb-36"}>
      <div className="mx-auto w-full max-w-lg px-4">
        {hydrated && restored && !restoreResolved && (
          <div role="region" aria-label="Réservation en cours" className="mb-5 rounded-2xl border border-primary/40 bg-primary/10 p-4">
            <p className="text-sm font-semibold text-foreground">
              {restored.pendingPayment ? "Finaliser le paiement de votre réservation ?" : "Reprendre votre réservation ?"}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {restored.pendingPayment
                ? "Votre réservation est créée mais le paiement n'a pas été finalisé. Aucun doublon ne sera créé."
                : "Nous avons retrouvé une réservation commencée. Prix, code promo et créneau seront revérifiés."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={applyRestore}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                <History className="size-4" aria-hidden="true" />
                {restored.pendingPayment ? "Reprendre le paiement" : "Reprendre"}
              </button>
              <button
                type="button"
                onClick={discardRestore}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                <RotateCcw className="size-4" aria-hidden="true" />
                Recommencer
              </button>
            </div>
          </div>
        )}

        <StepHeader
          step={step}
          badge={`ÉTAPE ${step + 1} SUR ${BOOKING_V2_STEP_COUNT}`}
          title={step === 2 && forcedLocation === "workshop" ? "Date et créneau" : STEP_COPY[step].title}
          subtitle={STEP_COPY[step].subtitle}
          onBack={step > 0 ? () => goTo(step - 1) : undefined}
        />

        {step === 0 && (
          <StepService
            services={services}
            vehicleTypes={vehicleTypes}
            priceMap={priceMap}
            selectedId={serviceId}
            onSelect={selectService}
          />
        )}

        {step === 1 && (
          <StepVehicle
            vehicles={vehicles}
            vehicleTypes={vehicleTypes}
            options={options}
            maxVehicles={props.maxVehicles}
            onChange={(v) => {
              setVehicles(v)
              invalidateSelection()
            }}
          />
        )}

        {step === 2 && (
          <StepDateTime
            date={date}
            startTime={startTime}
            durationMin={estimate.durationMin}
            vehicleCount={vehicles.length}
            onSelectSlot={(d, t) => {
              setDate(d)
              setStartTime(t)
            }}
            location={location}
            locationType={locationType}
            onLocationType={setLocationType}
            address={address}
            onAddress={setAddress}
            travel={travel}
            onTravel={setTravel}
            roundTrip={props.roundTrip}
            freeDistanceKm={props.freeDistanceKm}
          />
        )}

        {step === 3 && (
          <StepContact
            contact={contact}
            onContact={setContact}
            serviceId={serviceId}
            vehicles={vehicles}
            services={services}
            vehicleTypes={vehicleTypes}
            options={options}
            priceMap={priceMap}
            date={date}
            startTime={startTime}
            address={atWorkshop ? `À l'atelier — ${location.workshopAddress ?? ""}` : travel?.ok ? travel.address : address}
            atWorkshop={atWorkshop}
            travelFeeCents={travelFeeCents}
            durationMin={estimate.durationMin}
            subtotalCents={estimate.priceCents}
            totalCents={totalCents}
            paymentPlan={paymentPlan}
            depositType={props.depositType}
            depositValue={props.depositValue}
            promo={{
              input: promoInput,
              onInput: setPromoInput,
              applied: appliedPromo,
              error: promoError,
              loading: promoLoading,
              onApply: applyPromo,
              onClear: () => {
                setAppliedPromo(null)
                setPromoInput("")
                setPromoError(null)
              },
            }}
            remember={remember}
            onRemember={setRemember}
            error={error}
          />
        )}

        {step < 3 && error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      {step > 0 && (
        <StickyBar
          embed={embed}
          priceCents={step >= 2 ? totalCents : estimate.priceCents}
          durationMin={estimate.durationMin}
          priceLabel={step === 3 ? "Total" : "Total estimé"}
          ctaLabel={ctaLabel}
          disabled={!stepValid[step]}
          loading={submitting}
          hint={stepHint[step]}
          onCta={() => (step === 3 ? submit() : goTo(step + 1))}
        />
      )}
    </div>
  )
}
