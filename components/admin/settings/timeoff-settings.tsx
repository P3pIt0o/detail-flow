"use client"

import { useState, useTransition } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Trash2 } from "lucide-react"
import { formatDateShort } from "@/lib/format"
import { addTimeOff, deleteTimeOff } from "@/app/admin/(dashboard)/parametres/actions"

type TimeOff = { id: number; startDate: string; endDate: string; reason: string | null }

export function TimeOffSettings({ periods }: { periods: TimeOff[] }) {
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [reason, setReason] = useState("")
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function add() {
    setMsg(null)
    startTransition(async () => {
      const res = await addTimeOff({ startDate: start, endDate: end, reason })
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

  return (
    <Card className="p-6 space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Congés &amp; indisponibilités</h2>
        <p className="text-sm text-muted-foreground text-pretty">
          Bloquez des périodes (vacances, jours fériés). Aucune réservation ne sera possible sur
          ces dates.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1.5fr_auto] sm:items-end">
        <div className="space-y-2">
          <Label htmlFor="start">Du</Label>
          <Input id="start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="end">Au</Label>
          <Input id="end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="reason">Motif (optionnel)</Label>
          <Input
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Vacances d'été"
          />
        </div>
        <Button onClick={add} disabled={pending || !start || !end}>
          Ajouter
        </Button>
      </div>
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
                  {formatDateShort(p.startDate)} → {formatDateShort(p.endDate)}
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
