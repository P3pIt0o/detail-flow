"use client"

import { useState, useTransition } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { saveBusinessHours } from "@/app/admin/(dashboard)/parametres/actions"

type Day = {
  dayOfWeek: number
  isOpen: boolean
  openTime: string
  closeTime: string
  /** Heures de début fixes ("08:00,13:00") ; vide/null = pas global. */
  fixedStartTimes?: string | null
}

const MAX_STARTS = 12

function toList(v: string | null | undefined): string[] {
  return v ? v.split(",").filter(Boolean) : []
}

const DAY_NAMES = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"]
// Ordre d'affichage : lundi -> dimanche
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

export function HoursSettings({ hours }: { hours: Day[] }) {
  // On garantit une ligne par jour (0..6), même si absente en base.
  const initial: Day[] = DISPLAY_ORDER.map((dow) => {
    const found = hours.find((h) => h.dayOfWeek === dow)
    return found ?? { dayOfWeek: dow, isOpen: dow !== 0, openTime: "09:00", closeTime: "18:00" }
  })

  const [days, setDays] = useState<Day[]>(initial)
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function update(dow: number, patch: Partial<Day>) {
    setDays((prev) => prev.map((d) => (d.dayOfWeek === dow ? { ...d, ...patch } : d)))
  }

  function save() {
    setMsg(null)
    startTransition(async () => {
      const res = await saveBusinessHours(
        days.map((d) => ({
          dayOfWeek: d.dayOfWeek,
          isOpen: d.isOpen,
          openTime: d.openTime,
          closeTime: d.closeTime,
          fixedStartTimes: d.isOpen ? toList(d.fixedStartTimes).filter((t) => /^\d{2}:\d{2}$/.test(t)) : [],
        })),
      )
      setMsg(
        res.ok
          ? { type: "ok", text: "Horaires enregistrés." }
          : { type: "err", text: res.error ?? "Erreur" },
      )
    })
  }

  return (
    <Card className="p-6 space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Horaires d&apos;ouverture</h2>
        <p className="text-sm text-muted-foreground text-pretty">
          Les créneaux de réservation sont générés à partir de ces horaires.
        </p>
      </div>

      <div className="space-y-2">
        {days.map((d) => (
          <div
            key={d.dayOfWeek}
            className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
          >
            <div className="flex w-32 items-center gap-3">
              <Switch
                checked={d.isOpen}
                onCheckedChange={(v) => update(d.dayOfWeek, { isOpen: v })}
                aria-label={`Ouvert le ${DAY_NAMES[d.dayOfWeek]}`}
              />
              <span className="font-medium">{DAY_NAMES[d.dayOfWeek]}</span>
            </div>
            {d.isOpen ? (
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  value={d.openTime}
                  onChange={(e) => update(d.dayOfWeek, { openTime: e.target.value })}
                  className="w-32"
                  aria-label={`Heure d'ouverture ${DAY_NAMES[d.dayOfWeek]}`}
                />
                <span className="text-muted-foreground">→</span>
                <Input
                  type="time"
                  value={d.closeTime}
                  onChange={(e) => update(d.dayOfWeek, { closeTime: e.target.value })}
                  className="w-32"
                  aria-label={`Heure de fermeture ${DAY_NAMES[d.dayOfWeek]}`}
                />
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">Fermé</span>
            )}
            {d.isOpen && (
              <div className="basis-full space-y-2 border-t pt-3">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={toList(d.fixedStartTimes).length > 0}
                    onCheckedChange={(v) =>
                      update(d.dayOfWeek, { fixedStartTimes: v ? d.openTime : null })
                    }
                    aria-label={`Heures de début fixes le ${DAY_NAMES[d.dayOfWeek]}`}
                  />
                  <span className="text-sm">Heures de début fixes</span>
                </div>
                {toList(d.fixedStartTimes).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground text-pretty">
                      Seules ces heures de début seront proposées ce jour-là. Sans cette option, le
                      pas de réservation habituel s&apos;applique.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      {toList(d.fixedStartTimes).map((t, i, arr) => (
                        <div key={i} className="flex items-center gap-1">
                          <Input
                            type="time"
                            value={t}
                            onChange={(e) => {
                              const next = [...arr]
                              next[i] = e.target.value
                              update(d.dayOfWeek, { fixedStartTimes: next.join(",") })
                            }}
                            className="w-32"
                            aria-label={`Heure de début ${i + 1} ${DAY_NAMES[d.dayOfWeek]}`}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const next = arr.filter((_, j) => j !== i)
                              update(d.dayOfWeek, { fixedStartTimes: next.join(",") || null })
                            }}
                            aria-label={`Retirer l'heure ${t}`}
                          >
                            ✕
                          </Button>
                        </div>
                      ))}
                      {toList(d.fixedStartTimes).length < MAX_STARTS && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            update(d.dayOfWeek, {
                              fixedStartTimes: [...toList(d.fixedStartTimes), d.openTime].join(","),
                            })
                          }
                        >
                          + Ajouter une heure
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer les horaires"}
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
