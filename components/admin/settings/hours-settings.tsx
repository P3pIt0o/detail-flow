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

/**
 * Ajoute une heure de début saisie dans le champ vide (aperçu validé : pastilles + champ d'ajout).
 * Pas de pré-remplissage, pas de doublon silencieux : chaque refus a un message.
 */
export function addFixedStart(
  list: string[],
  draft: string,
): { ok: true; list: string[] } | { ok: false; error: string } {
  const t = draft.trim()
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) return { ok: false, error: "Saisissez une heure valide." }
  if (list.includes(t)) return { ok: false, error: `${t} est déjà dans la liste.` }
  if (list.length >= MAX_STARTS) return { ok: false, error: `${MAX_STARTS} heures maximum par jour.` }
  return { ok: true, list: [...list, t].sort() }
}

/** Valeur envoyée au serveur : option désactivée = liste vide (retour au pas global). */
export function fixedStartsToSave(enabled: boolean, v: string | null | undefined): string[] {
  return enabled ? toList(v) : []
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
  // Option « heures fixes » activée par jour (indépendante du contenu : activer = champ vide).
  const [fixedOn, setFixedOn] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(initial.map((d) => [d.dayOfWeek, toList(d.fixedStartTimes).length > 0])),
  )
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const [draftErr, setDraftErr] = useState<Record<number, string | undefined>>({})
  const [msg, setMsg] = useState<{ type: "ok" | "warn" | "err"; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function update(dow: number, patch: Partial<Day>) {
    setDays((prev) => prev.map((d) => (d.dayOfWeek === dow ? { ...d, ...patch } : d)))
  }

  function addStart(d: Day) {
    const r = addFixedStart(toList(d.fixedStartTimes), drafts[d.dayOfWeek] ?? "")
    if (!r.ok) {
      setDraftErr((p) => ({ ...p, [d.dayOfWeek]: r.error }))
      return
    }
    update(d.dayOfWeek, { fixedStartTimes: r.list.join(",") })
    setDrafts((p) => ({ ...p, [d.dayOfWeek]: "" }))
    setDraftErr((p) => ({ ...p, [d.dayOfWeek]: undefined }))
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
          // Conservées même si le jour est fermé (ignorées à la réservation) : rouvrir le jour les retrouve.
          fixedStartTimes: fixedStartsToSave(fixedOn[d.dayOfWeek] ?? false, d.fixedStartTimes),
        })),
      )
      setMsg(
        !res.ok
          ? { type: "err", text: res.error ?? "Erreur" }
          : res.warning
            ? { type: "warn", text: res.warning }
            : { type: "ok", text: "Horaires enregistrés." },
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
                    checked={fixedOn[d.dayOfWeek] ?? false}
                    onCheckedChange={(v) => {
                      // Activer : champ d'ajout vide (aucun pré-remplissage). Désactiver : retour au pas global.
                      setFixedOn((p) => ({ ...p, [d.dayOfWeek]: v }))
                      if (!v) update(d.dayOfWeek, { fixedStartTimes: null })
                      setDraftErr((p) => ({ ...p, [d.dayOfWeek]: undefined }))
                    }}
                    aria-label={`Heures de début fixes le ${DAY_NAMES[d.dayOfWeek]}`}
                  />
                  <span className="text-sm">Heures de début fixes</span>
                </div>
                {fixedOn[d.dayOfWeek] && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground text-pretty">
                      Seules ces heures de début seront proposées ce jour-là. Sans cette option, le
                      pas de réservation habituel s&apos;applique.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      {toList(d.fixedStartTimes).map((t, i, arr) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => {
                            const next = arr.filter((_, j) => j !== i)
                            update(d.dayOfWeek, { fixedStartTimes: next.join(",") || null })
                          }}
                          className="inline-flex items-center gap-1 rounded-full border bg-muted px-3 py-1 text-sm font-medium tabular-nums hover:bg-muted/70"
                          aria-label={`Retirer l'heure ${t}`}
                        >
                          {t} <span aria-hidden="true">✕</span>
                        </button>
                      ))}
                      {toList(d.fixedStartTimes).length < MAX_STARTS && (
                        <>
                          <Input
                            type="time"
                            value={drafts[d.dayOfWeek] ?? ""}
                            onChange={(e) => {
                              const value = e.target.value
                              setDrafts((p) => ({ ...p, [d.dayOfWeek]: value }))
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault()
                                addStart(d)
                              }
                            }}
                            className="w-32"
                            aria-label={`Nouvelle heure de début ${DAY_NAMES[d.dayOfWeek]}`}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => addStart(d)}
                            disabled={!drafts[d.dayOfWeek]}
                          >
                            + Ajouter
                          </Button>
                        </>
                      )}
                    </div>
                    {draftErr[d.dayOfWeek] && (
                      <p className="text-xs text-destructive">{draftErr[d.dayOfWeek]}</p>
                    )}
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
          <span
            role={msg.type === "ok" ? undefined : "status"}
            className={
              msg.type === "ok"
                ? "text-sm text-primary"
                : msg.type === "warn"
                  ? "text-sm text-amber-600"
                  : "text-sm text-destructive"
            }
          >
            {msg.text}
          </span>
        )}
      </div>
    </Card>
  )
}
