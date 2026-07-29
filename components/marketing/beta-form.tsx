"use client"

/**
 * Formulaire public de candidature au Programme Beta Tester.
 * Utilise useActionState (React 19) + l'action serveur submitBetaLead.
 * Aucune dépendance nouvelle : réutilise les primitives UI existantes.
 */

import { useActionState } from "react"
import { CheckCircle2, Loader2 } from "lucide-react"
import { submitBetaLead, type BetaLeadResult } from "@/app/marketing/actions"
import { marketing } from "@/config/marketing"

const inputClass =
  "h-11 w-full rounded-lg border border-input bg-card/60 px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

export function BetaForm() {
  const [state, formAction, pending] = useActionState<BetaLeadResult | null, FormData>(submitBetaLead, null)

  if (state?.ok) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-primary/30 bg-card p-8 text-center">
        <CheckCircle2 className="size-12 text-primary" aria-hidden="true" />
        <h3 className="text-xl font-semibold text-foreground">Candidature reçue</h3>
        <p className="max-w-sm text-pretty leading-relaxed text-muted-foreground">
          Merci ! Nous étudions votre candidature au programme Beta et revenons vers vous très vite pour préparer votre
          espace DetailFlow.
        </p>
      </div>
    )
  }

  return (
    <form action={formAction} className="rounded-2xl border border-border bg-card p-6 sm:p-8">
      <h3 className="text-lg font-semibold text-foreground">{marketing.beta.formTitle}</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{marketing.beta.formNote}</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="businessName" className="mb-1.5 block text-sm font-medium text-foreground">
            Nom de l&apos;entreprise
          </label>
          <input id="businessName" name="businessName" required className={inputClass} placeholder="Ex. AutoShine Detailing" />
        </div>
        <div>
          <label htmlFor="contactName" className="mb-1.5 block text-sm font-medium text-foreground">
            Votre nom
          </label>
          <input id="contactName" name="contactName" required className={inputClass} placeholder="Prénom Nom" />
        </div>
        <div>
          <label htmlFor="city" className="mb-1.5 block text-sm font-medium text-foreground">
            Ville
          </label>
          <input id="city" name="city" className={inputClass} placeholder="Ex. Lyon" />
        </div>
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-foreground">
            Email
          </label>
          <input id="email" name="email" type="email" required className={inputClass} placeholder="vous@entreprise.fr" />
        </div>
        <div>
          <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-foreground">
            Téléphone
          </label>
          <input id="phone" name="phone" className={inputClass} placeholder="06 12 34 56 78" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="message" className="mb-1.5 block text-sm font-medium text-foreground">
            Votre activité en quelques mots
          </label>
          <textarea
            id="message"
            name="message"
            rows={3}
            className="w-full rounded-lg border border-input bg-card/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Type de prestations, zone d'intervention…"
          />
        </div>
      </div>

      {state && !state.ok ? (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-8 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:brightness-110 disabled:opacity-60"
      >
        {pending ? (
          <>
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            Envoi…
          </>
        ) : (
          "Envoyer ma candidature"
        )}
      </button>
    </form>
  )
}
