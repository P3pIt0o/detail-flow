"use client"

import { useState, useTransition } from "react"
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
      setMsg(
        res.ok
          ? { type: "ok", text: "Paramètres enregistrés." }
          : { type: "err", text: res.error ?? "Erreur" },
      )
    })
  }

  return (
    <Card className="p-6 space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Coordonnées &amp; frais de déplacement</h2>
        <p className="text-sm text-muted-foreground text-pretty">
          L&apos;adresse de départ sert à calculer la distance jusqu&apos;au client. Elle est
          géocodée automatiquement à l&apos;enregistrement.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="businessAddress">Adresse de départ (atelier / domicile)</Label>
        <Input
          id="businessAddress"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="12 rue de l'Atelier, 75011 Paris"
        />
        {props.hasCoords && (
          <p className="text-xs text-muted-foreground">Coordonnées enregistrées ✓</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="freeKm">Distance offerte (km)</Label>
          <Input
            id="freeKm"
            type="number"
            step="0.1"
            value={freeKm}
            onChange={(e) => setFreeKm(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pricePerKm">Prix / km (€)</Label>
          <Input
            id="pricePerKm"
            type="number"
            step="0.01"
            value={pricePerKm}
            onChange={(e) => setPricePerKm(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="maxKm">Distance max. (km)</Label>
          <Input
            id="maxKm"
            type="number"
            step="1"
            value={maxKm}
            onChange={(e) => setMaxKm(e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <Label htmlFor="roundTrip" className="cursor-pointer">
            Facturer l&apos;aller-retour
          </Label>
          <p className="text-xs text-muted-foreground">
            Double la distance facturée (déplacement A/R).
          </p>
        </div>
        <Switch id="roundTrip" checked={roundTrip} onCheckedChange={setRoundTrip} />
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
        {msg && (
          <span className={msg.type === "ok" ? "text-sm text-primary" : "text-sm text-destructive"}>
            {msg.text}
          </span>
        )}
      </div>
    </Card>
  )
}
