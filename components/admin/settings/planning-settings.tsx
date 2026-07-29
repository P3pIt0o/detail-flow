"use client"

import { useState, useTransition } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { savePlanning, saveDeposit, saveVacationMode } from "@/app/admin/(dashboard)/parametres/actions"

type Props = {
  maxVehiclesPerDay: number
  slotIntervalMin: number
  bufferMin: number
  minNoticeHours: number
  depositType: "none" | "fixed" | "percent"
  depositValue: number
  vacationMode: boolean
  vacationMessage: string
}

export function PlanningSettings(props: Props) {
  const [maxVehicles, setMaxVehicles] = useState(props.maxVehiclesPerDay.toString())
  const [interval, setInterval] = useState(props.slotIntervalMin.toString())
  const [buffer, setBuffer] = useState(props.bufferMin.toString())
  const [notice, setNotice] = useState(props.minNoticeHours.toString())

  const [depositType, setDepositType] = useState(props.depositType)
  // Pour "fixed" la valeur stockée est en centimes -> on affiche en euros.
  const [depositValue, setDepositValue] = useState(
    props.depositType === "fixed"
      ? (props.depositValue / 100).toString()
      : props.depositValue.toString(),
  )

  const [vacationMode, setVacationMode] = useState(props.vacationMode)
  const [vacationMessage, setVacationMessage] = useState(props.vacationMessage)

  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const [vacPending, startVacTransition] = useTransition()
  const [vacMsg, setVacMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null)

  function saveVacation() {
    setVacMsg(null)
    startVacTransition(async () => {
      const r = await saveVacationMode({ vacationMode, vacationMessage })
      setVacMsg(
        r.ok
          ? { type: "ok", text: "Mode vacances mis à jour." }
          : { type: "err", text: r.error ?? "Erreur" },
      )
    })
  }

  function save() {
    setMsg(null)
    startTransition(async () => {
      const r1 = await savePlanning({
        maxVehiclesPerDay: Number(maxVehicles) || 1,
        slotIntervalMin: Number(interval) || 30,
        bufferMin: Number(buffer) || 0,
        minNoticeHours: Number(notice) || 0,
      })
      const rawValue = Number.parseFloat(depositValue) || 0
      const r2 = await saveDeposit({
        depositType,
        depositValue: depositType === "fixed" ? Math.round(rawValue * 100) : Math.round(rawValue),
      })
      const ok = r1.ok && r2.ok
      setMsg(
        ok
          ? { type: "ok", text: "Paramètres enregistrés." }
          : { type: "err", text: r1.error ?? r2.error ?? "Erreur" },
      )
    })
  }

  return (
    <div className="space-y-6">
      <Card className="p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Mode vacances</h2>
            <p className="text-sm text-muted-foreground text-pretty">
              Suspend temporairement la prise de réservation en ligne. Un message est affiché aux
              visiteurs sur la page de réservation.
            </p>
          </div>
          <Switch
            checked={vacationMode}
            onCheckedChange={setVacationMode}
            aria-label="Activer le mode vacances"
          />
        </div>
        {vacationMode && (
          <div className="space-y-2">
            <Label htmlFor="vacationMessage">Message affiché aux visiteurs</Label>
            <Textarea
              id="vacationMessage"
              rows={2}
              placeholder="Nous sommes actuellement en congés jusqu'au…"
              value={vacationMessage}
              onChange={(e) => setVacationMessage(e.target.value)}
            />
          </div>
        )}
        <div className="flex items-center gap-3">
          <Button onClick={saveVacation} disabled={vacPending} variant="secondary">
            {vacPending ? "Enregistrement…" : "Enregistrer le mode vacances"}
          </Button>
          {vacMsg && (
            <span
              className={vacMsg.type === "ok" ? "text-sm text-primary" : "text-sm text-destructive"}
            >
              {vacMsg.text}
            </span>
          )}
        </div>
      </Card>

      <Card className="p-6 space-y-5">
        <div>
          <h2 className="text-lg font-semibold">Planning &amp; créneaux</h2>
          <p className="text-sm text-muted-foreground text-pretty">
            Contrôlez la génération des créneaux disponibles côté réservation.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="maxVehicles">Véhicules max. par jour</Label>
            <Input
              id="maxVehicles"
              type="number"
              value={maxVehicles}
              onChange={(e) => setMaxVehicles(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="interval">Intervalle entre créneaux (min)</Label>
            <Input
              id="interval"
              type="number"
              value={interval}
              onChange={(e) => setInterval(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="buffer">Battement entre RDV (min)</Label>
            <Input
              id="buffer"
              type="number"
              value={buffer}
              onChange={(e) => setBuffer(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notice">Préavis minimum (heures)</Label>
            <Input
              id="notice"
              type="number"
              value={notice}
              onChange={(e) => setNotice(e.target.value)}
            />
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-5">
        <div>
          <h2 className="text-lg font-semibold">Acompte à la réservation</h2>
          <p className="text-sm text-muted-foreground text-pretty">
            Montant demandé pour confirmer une réservation en ligne.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="depositType">Type d&apos;acompte</Label>
            <select
              id="depositType"
              value={depositType}
              onChange={(e) => setDepositType(e.target.value as Props["depositType"])}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="none">Aucun acompte</option>
              <option value="percent">Pourcentage du total</option>
              <option value="fixed">Montant fixe</option>
            </select>
          </div>
          {depositType !== "none" && (
            <div className="space-y-2">
              <Label htmlFor="depositValue">
                {depositType === "percent" ? "Pourcentage (%)" : "Montant (€)"}
              </Label>
              <Input
                id="depositValue"
                type="number"
                step={depositType === "percent" ? "1" : "0.01"}
                value={depositValue}
                onChange={(e) => setDepositValue(e.target.value)}
              />
            </div>
          )}
        </div>
      </Card>

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
    </div>
  )
}
