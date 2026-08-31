"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Check } from "lucide-react"
import { PaymentCheckout } from "./payment-checkout"

/**
 * Mode "choice" : le client choisit lui-même entre l'acompte et le paiement
 * intégral avant d'ouvrir le checkout embarqué. Le montant réellement encaissé
 * est TOUJOURS recalculé côté serveur (createBookingCheckout) ; ce composant ne
 * fait que transmettre le type choisi. Une option sous le minimum Stripe est
 * désactivée (jamais de checkout voué à l'échec).
 */
type ChoiceType = "deposit" | "full_payment"

type Option = {
  type: ChoiceType
  title: string
  amountLabel: string
  hint: string
  /** Encaissable en ligne (montant ≥ minimum Stripe). */
  available: boolean
}

export function PaymentModeChoice({
  bookingId,
  depositLabel,
  totalLabel,
  remainingLabel,
  depositAvailable,
  fullAvailable,
  belowMinLabel,
}: {
  bookingId: number
  depositLabel: string
  totalLabel: string
  remainingLabel: string
  depositAvailable: boolean
  fullAvailable: boolean
  /** Message affiché quand une option est indisponible (montant trop faible). */
  belowMinLabel: string
}) {
  const options: Option[] = [
    {
      type: "deposit",
      title: "Payer l'acompte",
      amountLabel: depositLabel,
      hint: depositAvailable ? `Puis ${remainingLabel} à régler sur place` : belowMinLabel,
      available: depositAvailable,
    },
    {
      type: "full_payment",
      title: "Payer la totalité",
      amountLabel: totalLabel,
      hint: fullAvailable ? "Rien à régler le jour du rendez-vous" : belowMinLabel,
      available: fullAvailable,
    },
  ]

  // Présélection sur la première option encaissable en ligne.
  const firstAvailable = options.find((o) => o.available)?.type ?? null
  const [selected, setSelected] = useState<ChoiceType | null>(firstAvailable)
  const [confirmed, setConfirmed] = useState<ChoiceType | null>(null)

  // Aucune option encaissable en ligne : réservation enregistrée, règlement sur
  // place (aucune substitution silencieuse de montant).
  if (!depositAvailable && !fullAvailable) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-border bg-muted/50 p-6 text-sm leading-relaxed text-muted-foreground"
      >
        <p className="font-semibold text-foreground">Paiement en ligne indisponible pour ce montant</p>
        <p className="mt-2">
          Votre réservation reste enregistrée : le règlement sera effectué directement auprès du professionnel.
        </p>
      </div>
    )
  }

  if (confirmed) {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setConfirmed(null)}
          className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Modifier mon choix
        </button>
        <PaymentCheckout bookingId={bookingId} chosenType={confirmed} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((opt) => {
          const active = selected === opt.type
          return (
            <button
              key={opt.type}
              type="button"
              onClick={() => opt.available && setSelected(opt.type)}
              disabled={!opt.available}
              aria-pressed={active}
              className={`flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-colors ${
                active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
              } ${opt.available ? "" : "cursor-not-allowed opacity-60"}`}
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">{opt.title}</span>
                {active ? <Check className="size-4 text-primary" aria-hidden="true" /> : null}
              </span>
              <span className="text-lg font-semibold text-primary">{opt.amountLabel}</span>
              <span className="text-xs text-muted-foreground">{opt.hint}</span>
            </button>
          )
        })}
      </div>
      <Button className="w-full" disabled={!selected} onClick={() => setConfirmed(selected)}>
        Continuer
      </Button>
    </div>
  )
}
