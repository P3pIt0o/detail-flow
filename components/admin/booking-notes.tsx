"use client"

import { useState, useTransition } from "react"
import { Check } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { updateBookingNotes } from "@/app/admin/(dashboard)/actions"

export function BookingNotes({
  bookingId,
  initialNotes,
}: {
  bookingId: number
  initialNotes: string
}) {
  const [notes, setNotes] = useState(initialNotes)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()
  const dirty = notes !== initialNotes

  function save() {
    startTransition(async () => {
      await updateBookingNotes(bookingId, notes)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Notes internes
      </h2>
      <Textarea
        value={notes}
        onChange={(e) => {
          setNotes(e.target.value)
          setSaved(false)
        }}
        placeholder="Ajouter une note (visible uniquement dans l'administration)…"
        rows={4}
      />
      <div className="mt-3 flex items-center gap-3">
        <Button size="sm" onClick={save} disabled={!dirty || pending}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-sm text-primary">
            <Check className="h-4 w-4" /> Enregistré
          </span>
        )}
      </div>
    </section>
  )
}
