"use client"

import { AlertCircle, CreditCard, Loader2, Wallet } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDateLong, formatDuration } from "@/lib/format"
import {
  formatPriceCompact,
  formatSlotLabel,
  previewDeposit,
  vehicleEstimate,
  type PaymentPlan,
  type V2Vehicle,
} from "@/lib/booking/v2"
import type { OptionRow, PriceMap, ServiceRow, VehicleRow } from "@/components/booking/shared"
import { SectionLabel, bv2InputClass, bv2LabelClass } from "./step-header"

export type ContactV2 = { firstName: string; lastName: string; email: string; phone: string; notes: string }

export type AppliedPromoV2 = {
  code: string
  discountType: "percent" | "fixed"
  discountValue: number
  discountCents: number
}

type Props = {
  contact: ContactV2
  onContact: (contact: ContactV2) => void
  serviceId: number | null
  vehicles: V2Vehicle[]
  services: ServiceRow[]
  vehicleTypes: VehicleRow[]
  options: OptionRow[]
  priceMap: PriceMap
  date: string | null
  startTime: string | null
  address: string
  atWorkshop?: boolean
  travelFeeCents: number
  durationMin: number
  subtotalCents: number
  totalCents: number
  paymentPlan: PaymentPlan
  depositType: string
  depositValue: number
  promo: {
    input: string
    onInput: (value: string) => void
    applied: AppliedPromoV2 | null
    error: string | null
    loading: boolean
    onApply: () => void
    onClear: () => void
  }
  remember: boolean
  onRemember: (value: boolean) => void
  error: string | null
}

function Field({
  id,
  label,
  className,
  ...input
}: { id: string; label: string; className?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={className}>
      <label htmlFor={id} className={bv2LabelClass}>
        {label}
      </label>
      <input id={id} className={bv2InputClass} {...input} />
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <dt className="shrink-0 text-[13px] text-muted-foreground">{label}</dt>
      <dd className={cn("text-right text-[13px] text-foreground", strong && "font-semibold")}>{value}</dd>
    </div>
  )
}

function PaymentNotice({
  plan,
  totalCents,
  depositCents,
}: {
  plan: PaymentPlan
  totalCents: number
  depositCents: number
}) {
  const remaining = Math.max(0, totalCents - depositCents)
  const content: Record<PaymentPlan, { icon: typeof Wallet; title: string; text: string }> = {
    on_site: {
      icon: Wallet,
      title: "Paiement sur place",
      text: "Vous réglez directement le jour du rendez-vous.",
    },
    offline_deposit: {
      icon: Wallet,
      title: `Acompte de ${formatPriceCompact(depositCents)} pour confirmer`,
      text: `Les instructions de règlement vous sont envoyées après la réservation. Solde de ${formatPriceCompact(remaining)} le jour du rendez-vous.`,
    },
    online_full: {
      icon: CreditCard,
      title: "Paiement en ligne sécurisé",
      text: `${formatPriceCompact(totalCents)} à régler à l'étape suivante.`,
    },
    online_deposit: {
      icon: CreditCard,
      title: `Acompte en ligne de ${formatPriceCompact(depositCents)}`,
      text: `Réglé à l'étape suivante. Solde de ${formatPriceCompact(remaining)} le jour du rendez-vous.`,
    },
    choice: {
      icon: CreditCard,
      title: "Paiement en ligne sécurisé",
      text: `Acompte de ${formatPriceCompact(depositCents)} ou totalité (${formatPriceCompact(totalCents)}), au choix à l'étape suivante.`,
    },
  }
  const { icon: Icon, title, text } = content[plan]
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span>
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className="mt-0.5 block text-pretty text-[13px] leading-relaxed text-muted-foreground">{text}</span>
      </span>
    </div>
  )
}

export function StepContact(props: Props) {
  const {
    contact,
    onContact,
    serviceId,
    vehicles,
    services,
    vehicleTypes,
    options,
    priceMap,
    date,
    startTime,
    address,
    atWorkshop,
    travelFeeCents,
    durationMin,
    subtotalCents,
    totalCents,
    paymentPlan,
    depositType,
    depositValue,
    promo,
    remember,
    onRemember,
    error,
  } = props

  const set = <K extends keyof ContactV2>(key: K, value: ContactV2[K]) => onContact({ ...contact, [key]: value })
  const service = services.find((s) => s.id === serviceId)
  const depositCents = previewDeposit(totalCents, depositType, depositValue)

  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5">
        <Field
          id="bv2-first"
          label="Prénom"
          value={contact.firstName}
          onChange={(e) => set("firstName", e.target.value)}
          autoComplete="given-name"
          required
        />
        <Field
          id="bv2-last"
          label="Nom"
          value={contact.lastName}
          onChange={(e) => set("lastName", e.target.value)}
          autoComplete="family-name"
          required
        />
        <Field
          id="bv2-email"
          label="Email"
          type="email"
          inputMode="email"
          value={contact.email}
          onChange={(e) => set("email", e.target.value)}
          autoComplete="email"
          placeholder="vous@exemple.fr"
          required
          className="col-span-2"
        />
        <Field
          id="bv2-phone"
          label="Téléphone"
          type="tel"
          inputMode="tel"
          value={contact.phone}
          onChange={(e) => set("phone", e.target.value)}
          autoComplete="tel"
          placeholder="06 12 34 56 78"
          required
          className="col-span-2"
        />
        <div className="col-span-2">
          <label htmlFor="bv2-notes" className={bv2LabelClass}>
            Précisions (facultatif)
          </label>
          <textarea
            id="bv2-notes"
            value={contact.notes}
            onChange={(e) => set("notes", e.target.value)}
            rows={2}
            placeholder="Code d'accès, étage, stationnement…"
            className={cn(bv2InputClass, "resize-none")}
          />
        </div>
      </div>

      <SectionLabel>RÉCAPITULATIF</SectionLabel>
      <div className="rounded-2xl border border-border bg-card p-4">
        <dl className="divide-y divide-border">
          <div className="pb-2">
            <Row label="Prestation" value={service?.name ?? "—"} strong />
            {vehicles.map((v, i) => {
              const type = vehicleTypes.find((t) => t.id === v.vehicleTypeId)
              const chosen = v.optionIds.map((id) => options.find((o) => o.id === id)?.name).filter(Boolean)
              const est = vehicleEstimate(v, serviceId, services, options, priceMap)
              return (
                <div key={v.uid}>
                  <Row
                    label={vehicles.length > 1 ? `Véhicule ${i + 1}` : "Véhicule"}
                    value={
                      <>
                        {[v.brand, v.model].filter((s) => s.trim()).join(" ")}
                        {type && <span className="text-muted-foreground"> · {type.name}</span>}
                        {vehicles.length > 1 && (
                          <span className="block font-semibold">{formatPriceCompact(est.priceCents)}</span>
                        )}
                      </>
                    }
                  />
                  {chosen.length > 0 && <Row label="Options" value={chosen.join(", ")} />}
                </div>
              )
            })}
          </div>
          <div className="py-2">
            <Row label="Lieu" value={address || "—"} />
            <Row label="Date" value={<span className="capitalize">{date ? formatDateLong(date) : "—"}</span>} />
            <Row label="Heure" value={startTime ? formatSlotLabel(startTime) : "—"} />
            <Row label="Durée totale" value={formatDuration(durationMin)} />
          </div>
          <div className="pt-2">
            <Row label="Prestations" value={formatPriceCompact(subtotalCents)} />
            {!atWorkshop && (
              <Row
                label="Déplacement"
                value={travelFeeCents === 0 ? "Offert" : formatPriceCompact(travelFeeCents)}
              />
            )}
            {promo.applied && (
              <Row
                label={`Code ${promo.applied.code}`}
                value={<span className="text-success">−{formatPriceCompact(promo.applied.discountCents)}</span>}
              />
            )}
            <div className="mt-1 flex items-baseline justify-between border-t border-border pt-2.5">
              <dt className="text-sm font-semibold text-foreground">Total</dt>
              <dd className="text-lg font-bold text-foreground">{formatPriceCompact(totalCents)}</dd>
            </div>
          </div>
        </dl>
      </div>

      <div className="mt-3">
        {promo.applied ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3.5 py-2.5 text-[13px]">
            <span className="text-foreground">
              Code <span className="font-semibold">{promo.applied.code}</span> appliqué
            </span>
            <button
              type="button"
              onClick={promo.onClear}
              className="text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
            >
              Retirer
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <label htmlFor="bv2-promo" className="sr-only">
              Code promo
            </label>
            <input
              id="bv2-promo"
              value={promo.input}
              onChange={(e) => promo.onInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                  e.preventDefault()
                  promo.onApply()
                }
              }}
              placeholder="Code promo"
              autoComplete="off"
              className={cn(bv2InputClass, "uppercase placeholder:normal-case")}
            />
            <button
              type="button"
              onClick={promo.onApply}
              disabled={promo.loading || !promo.input.trim()}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:border-primary/50 disabled:opacity-40"
            >
              {promo.loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Appliquer
            </button>
          </div>
        )}
        {promo.error && <p className="mt-1.5 text-xs text-destructive">{promo.error}</p>}
      </div>

      <SectionLabel>PAIEMENT</SectionLabel>
      <PaymentNotice plan={paymentPlan} totalCents={totalCents} depositCents={depositCents} />

      <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-muted-foreground">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => onRemember(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 rounded border-border accent-primary"
        />
        Mémoriser ma réservation sur cet appareil pendant 24 h. Aucune donnée de paiement n&apos;est enregistrée.
      </label>
      <p className="mt-3 text-pretty text-xs leading-relaxed text-muted-foreground">
        En confirmant, vous acceptez les conditions générales de vente du professionnel. Le montant final est
        recalculé et vérifié à la validation.
      </p>

      {error && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}
