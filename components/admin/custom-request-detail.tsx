"use client"

import { type ChangeEvent, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { AlertCircle, CheckCircle2, CalendarPlus, Send } from "lucide-react"
import { sendProposalAction, convertToBookingAction } from "@/app/admin/(dashboard)/demandes/actions"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { withTenant } from "@/lib/tenant-link"
import { formatDuration } from "@/lib/format"

type RequestVM = {
  id: number
  status: string
  customerName: string
  vehicleBrand: string | null
  vehicleModel: string | null
  proposalTitle: string | null
  proposalDescription: string | null
  proposalPriceCents: number | null
  proposalDurationMin: number | null
  proposalMessage: string | null
  bookingId: number | null
}

function centsToInput(cents: number | null): string {
  if (cents == null) return ""
  return (cents / 100).toFixed(2)
}

export function CustomRequestDetail({
  request,
  tenantParam,
}: {
  request: RequestVM
  tenantParam: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Saisie de la durée en heures/minutes (UX), stockée en minutes (DB inchangée).
  // La valeur envoyée au serveur reste le champ `proposalDuration` = total minutes.
  const [durHours, setDurHours] = useState<string>(
    request.proposalDurationMin != null ? String(Math.floor(request.proposalDurationMin / 60)) : "",
  )
  const [durMinutes, setDurMinutes] = useState<string>(
    request.proposalDurationMin != null ? String(request.proposalDurationMin % 60) : "",
  )

  const hoursNum = Number.parseInt(durHours, 10)
  const minutesNum = Number.parseInt(durMinutes, 10)
  const totalDurationMin =
    (Number.isFinite(hoursNum) && hoursNum > 0 ? hoursNum : 0) * 60 +
    (Number.isFinite(minutesNum) && minutesNum > 0 ? minutesNum : 0)

  function onHoursChange(e: ChangeEvent<HTMLInputElement>) {
    setDurHours(e.target.value.replace(/\D/g, "").slice(0, 2))
  }
  function onMinutesChange(e: ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 2)
    if (digits === "") {
      setDurMinutes("")
      return
    }
    // Minutes bornées 0–59 (les heures pleines passent par le champ « h »).
    setDurMinutes(String(Math.min(59, Number.parseInt(digits, 10))))
  }

  const isConverted = request.status === "converted"
  const isAccepted = request.status === "accepted"
  const isDeclined = request.status === "declined"

  function runProposal(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const res = await sendProposalAction(formData)
      if (!res.ok) setError(res.error ?? "Une erreur est survenue.")
      else router.refresh()
    })
  }

  function runConvert(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const res = await convertToBookingAction(formData)
      if (!res.ok) setError(res.error ?? "Une erreur est survenue.")
      else router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-foreground"
        >
          <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
          <p>{error}</p>
        </div>
      )}

      {/* Bandeau d'état décision client */}
      {isAccepted && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <p className="text-foreground">
            {request.customerName} a accepté votre proposition. Ajoutez le rendez-vous au calendrier ci-dessous.
          </p>
        </div>
      )}
      {isDeclined && (
        <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          Le client a refusé la proposition. Vous pouvez en envoyer une nouvelle.
        </div>
      )}

      {/* Conversion effectuée : lien vers le rendez-vous */}
      {isConverted && request.bookingId != null && (
        <div className="flex flex-col gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            Convertie en rendez-vous
          </div>
          <Link
            href={withTenant("/admin/reservations", tenantParam)}
            className="inline-flex h-10 w-fit items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:brightness-110"
          >
            Voir le rendez-vous
          </Link>
        </div>
      )}

      {/* Formulaire de proposition (tant que non converti) */}
      {!isConverted && (
        <form
          action={runProposal}
          className="space-y-4 rounded-xl border border-border bg-card p-5"
        >
          <input type="hidden" name="id" value={request.id} />
          <div className="flex items-center gap-2">
            <Send className="size-4 text-primary" aria-hidden="true" />
            <h2 className="font-semibold text-foreground">
              {request.proposalTitle ? "Modifier / renvoyer la proposition" : "Envoyer une proposition"}
            </h2>
          </div>

          <div className="space-y-2">
            <Label htmlFor="proposalTitle">Titre de la prestation</Label>
            <Input
              id="proposalTitle"
              name="proposalTitle"
              defaultValue={request.proposalTitle ?? ""}
              placeholder="Ex. Rénovation complète intérieur + extérieur"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="proposalDescription">Description (facultatif)</Label>
            <Textarea
              id="proposalDescription"
              name="proposalDescription"
              rows={3}
              defaultValue={request.proposalDescription ?? ""}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="proposalPrice">Prix TTC (€)</Label>
              <Input
                id="proposalPrice"
                name="proposalPrice"
                inputMode="decimal"
                defaultValue={centsToInput(request.proposalPriceCents)}
                placeholder="0.00"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proposalDurationHours">Durée estimée</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="proposalDurationHours"
                  inputMode="numeric"
                  value={durHours}
                  onChange={onHoursChange}
                  placeholder="2"
                  aria-label="Durée estimée — heures"
                  className="w-16 text-center"
                />
                <span className="text-sm text-muted-foreground" aria-hidden="true">
                  h
                </span>
                <Input
                  id="proposalDurationMinutes"
                  inputMode="numeric"
                  value={durMinutes}
                  onChange={onMinutesChange}
                  placeholder="30"
                  aria-label="Durée estimée — minutes"
                  className="w-16 text-center"
                />
                <span className="text-sm text-muted-foreground" aria-hidden="true">
                  min
                </span>
              </div>
              {/* Valeur réellement envoyée : total en minutes (stockage DB inchangé). */}
              <input
                type="hidden"
                name="proposalDuration"
                value={totalDurationMin > 0 ? String(totalDurationMin) : ""}
              />
              {totalDurationMin > 0 && (
                <p className="text-xs text-muted-foreground">Soit {formatDuration(totalDurationMin)}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="proposalMessage">Message au client (facultatif)</Label>
            <Textarea
              id="proposalMessage"
              name="proposalMessage"
              rows={3}
              defaultValue={request.proposalMessage ?? ""}
            />
          </div>

          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60"
          >
            {pending ? "Envoi…" : request.proposalTitle ? "Renvoyer la proposition" : "Envoyer la proposition"}
          </button>
        </form>
      )}

      {/* Conversion : uniquement quand acceptée */}
      {isAccepted && (
        <form action={runConvert} className="space-y-4 rounded-xl border border-border bg-card p-5">
          <input type="hidden" name="id" value={request.id} />
          <div className="flex items-center gap-2">
            <CalendarPlus className="size-4 text-primary" aria-hidden="true" />
            <h2 className="font-semibold text-foreground">Ajouter au calendrier</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            La prestation « {request.proposalTitle} » ({centsToInput(request.proposalPriceCents)} €) sera créée comme
            une vraie réservation. Choisissez la date et l&apos;heure.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input id="date" name="date" type="date" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="startTime">Heure</Label>
              <Input id="startTime" name="startTime" type="time" required />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Adresse d&apos;intervention (facultatif)</Label>
            <Input id="address" name="address" placeholder="Adresse du rendez-vous" />
          </div>

          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60"
          >
            {pending ? "Conversion…" : "Confirmer le rendez-vous"}
          </button>
        </form>
      )}
    </div>
  )
}
