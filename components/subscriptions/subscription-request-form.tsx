"use client"

import { useActionState, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { submitSubscriptionRequest, type SubscriptionRequestState } from "@/app/(site)/formules/actions"

const initial: SubscriptionRequestState = { status: "idle", message: "" }

type ScheduleChoice = { value: "monthly" | "period"; title: string; description: string }

export function SubscriptionRequestForm({
  planId,
  planName,
  scheduleChoices = null,
  choiceNote = null,
}: {
  planId: number
  planName: string
  /** Formule « au choix du client » (L27) : le choix est re-vérifié côté serveur. */
  scheduleChoices?: ScheduleChoice[] | null
  choiceNote?: string | null
}) {
  const [choice, setChoice] = useState<ScheduleChoice["value"]>("monthly")
  const [state, action, pending] = useActionState(submitSubscriptionRequest, initial)
  // Stable par montage : un double envoi est rejoué côté serveur sans doublon.
  const [submissionId] = useState(() => crypto.randomUUID())
  const invalid = (f: string) => state.fields?.some((x) => x === f || x.startsWith(`${f}.`) || x.endsWith(f))

  if (state.status === "success") {
    return (
      <p role="status" className="rounded-md border border-border bg-muted p-4 text-sm leading-relaxed text-foreground">
        {state.message}
      </p>
    )
  }

  const field = (name: string, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`${name}-${planId}`}>{label}</Label>
      <Input id={`${name}-${planId}`} name={name} aria-invalid={invalid(name) || undefined} className="h-11" {...props} />
    </div>
  )

  return (
    <form action={action} className="flex flex-col gap-4" aria-label={`Demande pour ${planName}`}>
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="submissionId" value={submissionId} />
      <div aria-hidden="true" className="hidden">
        <label>
          Site web
          <input name="company_website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {scheduleChoices && (
        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-1.5 text-sm font-semibold text-foreground">Comment souhaitez-vous payer ?</legend>
          {scheduleChoices.map((c) => (
            <label key={c.value} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 ${choice === c.value ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border"}`}>
              <input type="radio" name="paymentScheduleChoice" value={c.value} checked={choice === c.value} onChange={() => setChoice(c.value)} className="mt-1 size-4 accent-primary" />
              <span className="flex flex-col gap-0.5">
                <span className="text-[15px] font-semibold text-foreground">{c.title}</span>
                <span className="text-sm text-muted-foreground">{c.description}</span>
              </span>
            </label>
          ))}
          {choiceNote && <p className="text-sm text-muted-foreground">{choiceNote}</p>}
        </fieldset>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {field("name", "Nom complet", { required: true, autoComplete: "name", maxLength: 120 })}
        {field("email", "Email", { required: true, type: "email", autoComplete: "email", maxLength: 254 })}
        {field("phone", "Téléphone (facultatif)", { type: "tel", autoComplete: "tel", maxLength: 30 })}
        {field("plate", "Immatriculation (facultatif)", { maxLength: 20 })}
        {field("brand", "Marque du véhicule", { required: true, maxLength: 60 })}
        {field("model", "Modèle", { required: true, maxLength: 60 })}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`message-${planId}`}>Message (facultatif)</Label>
        <Textarea id={`message-${planId}`} name="message" rows={3} maxLength={1000} />
      </div>
      {state.status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending} className="h-11 w-full sm:w-auto">
        {pending ? "Envoi…" : "Envoyer ma demande"}
      </Button>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Aucun paiement maintenant. Le professionnel valide votre demande avant toute activation.
      </p>
    </form>
  )
}
