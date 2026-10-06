"use client"

import { useActionState, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { submitSubscriptionRequest, type SubscriptionRequestState } from "@/app/(site)/formules/actions"

const initial: SubscriptionRequestState = { status: "idle", message: "" }

export function SubscriptionRequestForm({ planId, planName }: { planId: number; planName: string }) {
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
