"use client"

/**
 * Formulaire de contact accessible, relié à une Server Action.
 * Utilise useActionState (React 19) pour gérer l'état de soumission.
 */

import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { CheckCircle2, AlertCircle } from "lucide-react"
import { submitContactForm, type ContactFormState } from "@/app/(site)/contact/actions"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

const initialState: ContactFormState = { status: "idle", message: "" }

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-12 w-full items-center justify-center rounded-full bg-primary px-8 text-base font-semibold text-primary-foreground transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
    >
      {pending ? "Envoi en cours…" : "Envoyer le message"}
    </button>
  )
}

export function ContactForm() {
  const [state, formAction] = useActionState(submitContactForm, initialState)

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {/* Message de retour global */}
      {state.status === "success" && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/10 p-4 text-sm text-foreground"
        >
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <p>{state.message}</p>
        </div>
      )}
      {state.status === "error" && !state.errors && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-foreground"
        >
          <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
          <p>{state.message}</p>
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Nom complet</Label>
          <Input id="name" name="name" autoComplete="name" required aria-invalid={!!state.errors?.name} />
          {state.errors?.name && <p className="text-sm text-destructive">{state.errors.name}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Téléphone</Label>
          <Input id="phone" name="phone" type="tel" autoComplete="tel" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={!!state.errors?.email} />
        {state.errors?.email && <p className="text-sm text-destructive">{state.errors.email}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="message">Votre message</Label>
        <Textarea id="message" name="message" rows={5} required aria-invalid={!!state.errors?.message} />
        {state.errors?.message && <p className="text-sm text-destructive">{state.errors.message}</p>}
      </div>

      {/* Honeypot anti-spam (masqué aux utilisateurs) */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="company">Ne pas remplir</label>
        <input id="company" name="company" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <SubmitButton />
    </form>
  )
}
