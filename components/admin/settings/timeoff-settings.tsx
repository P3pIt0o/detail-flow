"use client"

import { useState, useTransition } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Trash2 } from "lucide-react"
import { formatDateShort } from "@/lib/format"
import { addTimeOff, deleteTimeOff } from "@/app/admin/(dashboard)/parametres/actions"

type TimeOff = {
  id: number
  startDate: string
  endDate: string
  reason: string | null
  startTime?: string | null
  endTime?: string | null
  publicLabel?: string | null
}

type Mode = "day" | "range"
type PublicLabel = "Complet" | "Indisponible"

export function TimeOffSettings({ periods }: { periods: TimeOff[] }) {
  const [mode, setMode] = useState<Mode>("day")
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [startTime, setStartTime] = useState("13:00")
  const [endTime, setEndTime] = useState("16:00")
  const [publicLabel, setPublicLabel] = useState<PublicLabel>("Indisponible")
  const [reason, setReason] = useState("")
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function add() {
    setMsg(null)
    startTransition(async () => {
      const res = await addTimeOff({
        startDate: start,
        // Une plage horaire concerne un seul jour : fin = début.
        endDate: mode === "range" ? start : end,
        reason,
        startTime: mode === "range" ? startTime : null,
        endTime: mode === "range" ? endTime : null,
        publicLabel,
      })
      if (res.ok) {
        setStart("")
        setEnd("")
        setReason("")
      } else {
        setMsg(res.error ?? "Erreur")
      }
    })
  }

  function remove(id: number) {
    startTransition(async () => {
      await deleteTimeOff(id)
    })
  }

  const canAdd = mode === "range" ? Boolean(start && startTime && endTime) : Boolean(start && end)

  return (
    <Card className="p-6 space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Congés &amp; indisponibilités</h2>
        <p className="text-sm text-muted-foreground text-pretty">
          Bloquez une journée entière ou une plage horaire précise. Aucune réservation ne sera
          possible sur les créneaux concernés.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant={mode === "day" ? "default" : "outline"} onClick={() => setMode("day")}>
          Journée entière
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === "range" ? "default" : "outline"}
          onClick={() => setMode("range")}
        >
          Plage horaire
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="start">{mode === "range" ? "Date" : "Du"}</Label>
          <Input id="start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        {mode === "day" ? (
          <div className="space-y-2">
            <Label htmlFor="end">Au</Label>
            <Input id="end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="startTime">Début</Label>
              <Input id="startTime" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endTime">Fin</Label>
              <Input id="endTime" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="reason">Motif interne (optionnel)</Label>
          <Input
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Rendez-vous privé"
          />
        </div>
        <div className="space-y-2">
          <Label>Affichage public</Label>
          <div className="flex gap-2">
            {(["Indisponible", "Complet"] as PublicLabel[]).map((label) => (
              <Button
                key={label}
                type="button"
                size="sm"
                variant={publicLabel === label ? "default" : "outline"}
                onClick={() => setPublicLabel(label)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <Button onClick={add} disabled={pending || !canAdd}>
        Ajouter
      </Button>
      {msg && <p className="text-sm text-destructive">{msg}</p>}

      <div className="space-y-2">
        {periods.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune période bloquée.</p>
        ) : (
          periods.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-lg border p-3 text-sm"
            >
              <div>
                <span className="font-medium">
                  {formatDateShort(p.startDate)}
                  {p.startDate !== p.endDate && ` → ${formatDateShort(p.endDate)}`}
                  {p.startTime && p.endTime && ` · ${p.startTime}–${p.endTime}`}
                </span>
                <span className="text-muted-foreground">
                  {" · "}
                  {p.startTime && p.endTime ? "Plage" : "Journée"}
                  {p.publicLabel ? ` · ${p.publicLabel}` : ""}
                </span>
                {p.reason && <span className="text-muted-foreground"> · {p.reason}</span>}
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => remove(p.id)}
                disabled={pending}
                aria-label="Supprimer la période"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))
        )}
      </div>
    </Card>
  )
}
