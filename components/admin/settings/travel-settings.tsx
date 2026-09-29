"use client"

import { useState, useTransition } from "react"
import { Check } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { saveBusinessAndTravel } from "@/app/admin/(dashboard)/parametres/actions"

type Props = {
  businessAddress: string
  freeDistanceKm: number
  pricePerKmCents: number
  maxDistanceKm: number
  roundTrip: boolean
  hasCoords: boolean
}

/** Zone et frais de déplacement — moteur existant, présentation simplifiée. */
export function TravelSettings(props: Props) {
  const [address, setAddress] = useState(props.businessAddress)
  const [freeKm, setFreeKm] = useState(props.freeDistanceKm.toString())
  const [pricePerKm, setPricePerKm] = useState((props.pricePerKmCents / 100).toString())
  const [maxKm, setMaxKm] = useState(props.maxDistanceKm.toString())
  const [roundTrip, setRoundTrip] = useState(props.roundTrip)
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function save() {
    setMsg(null)
    startTransition(async () => {
      const res = await saveBusinessAndTravel({
        businessAddress: address,
        freeDistanceKm: Number.parseFloat(freeKm) || 0,
        pricePerKmCents: Math.round((Number.parseFloat(pricePerKm) || 0) * 100),
        maxDistanceKm: Number.parseFloat(maxKm) || 0,
        roundTrip,
      })
      setMsg(res.ok ? { type: "ok", text: "Zone enregistrée." } : { type: "err", text: res.error ?? "Erreur" })
    })
  }

  return (
    <Card className="flex flex-col gap-5 p-4 sm:p-6">
      <div>
        <h3 className="text-base font-semibold text-foreground">Votre zone de déplacement</h3>
        <p className="text-sm text-muted-foreground text-pretty">
          Les frais sont calculés automatiquement selon la distance jusqu&apos;au client.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="businessAddress">Adresse de départ</Label>
        <Input
          id="businessAddress"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="12 rue de l'Atelier, 75011 Paris"
          autoComplete="street-address"
          className="h-12 text-base"
        />
        {props.hasCoords && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Check className="size-3.5 text-primary" aria-hidden="true" />
            Adresse reconnue
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="maxKm">Jusqu&apos;où vous déplacez-vous ?</Label>
        <UnitInput id="maxKm" unit="km" step="1" value={maxKm} onChange={setMaxKm} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="freeKm">Kilomètres offerts</Label>
          <UnitInput id="freeKm" unit="km" step="0.1" value={freeKm} onChange={setFreeKm} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="pricePerKm">Prix par km au-delà</Label>
          <UnitInput id="pricePerKm" unit="€" step="0.01" value={pricePerKm} onChange={setPricePerKm} />
        </div>
      </div>

      <label
        htmlFor="roundTrip"
        className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border p-4"
      >
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-foreground">Compter l&apos;aller et le retour</span>
          <span className="text-xs text-muted-foreground">La distance facturée est doublée.</span>
        </span>
        <Switch id="roundTrip" checked={roundTrip} onCheckedChange={setRoundTrip} />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={pending} className="h-12 px-6 text-base">
          {pending ? "Enregistrement…" : "Enregistrer ma zone"}
        </Button>
        {msg && (
          <span role={msg.type === "ok" ? "status" : "alert"} className={msg.type === "ok" ? "text-sm text-primary" : "text-sm text-destructive"}>
            {msg.text}
          </span>
        )}
      </div>
    </Card>
  )
}

function UnitInput({
  id,
  unit,
  step,
  value,
  onChange,
}: {
  id: string
  unit: string
  step: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="relative">
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min="0"
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 pr-12 text-base"
      />
      <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-muted-foreground">
        {unit}
      </span>
    </div>
  )
}
