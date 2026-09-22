"use client"

import { useActionState } from "react"
import { CheckCircle2, Send, AlertCircle } from "lucide-react"
import { submitCustomWebsiteRequest, type CustomWebsiteState } from "./actions"

type Defaults = {
  companyName: string
  city: string
  currentSite: string
  contactName: string
  contactEmail: string
  contactPhone: string
}

const initialState: CustomWebsiteState = {}

export function CustomWebsiteForm({ defaults }: { defaults: Defaults }) {
  const [state, formAction, isPending] = useActionState(submitCustomWebsiteRequest, initialState)

  if (state.ok) {
    return (
      <section
        role="status"
        className="rounded-xl border border-primary/30 bg-primary/5 p-6 text-center"
      >
        <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
          <CheckCircle2 className="size-6" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">Demande transmise</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground text-pretty">
          Votre demande de site personnalisé a bien été transmise à notre équipe. Nous revenons vers vous rapidement
          pour étudier votre projet et définir les prochaines étapes.
        </p>
      </section>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <Field label="Nom de l'entreprise" name="companyName" defaultValue={defaults.companyName} required />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Ville" name="city" defaultValue={defaults.city} />
        <Field
          label="Instagram (optionnel)"
          name="instagram"
          placeholder="@votre_compte"
          autoComplete="off"
        />
      </div>

      <Field
        label="Site actuel (optionnel)"
        name="currentSite"
        type="url"
        placeholder="https://..."
        defaultValue={defaults.currentSite}
        autoComplete="off"
      />

      <TextArea
        label="Vos besoins"
        name="needs"
        required
        placeholder="Décrivez votre activité, vos objectifs, le style recherché…"
      />

      <TextArea
        label="Fonctionnalités souhaitées (optionnel)"
        name="features"
        placeholder="Prise de rendez-vous, galerie avant/après, boutique, blog, multilingue…"
      />

      <fieldset className="grid gap-5 rounded-xl border border-border p-4 sm:grid-cols-2">
        <legend className="px-1 text-xs font-medium text-muted-foreground">Vos coordonnées</legend>
        <Field label="Votre nom" name="contactName" defaultValue={defaults.contactName} required />
        <Field
          label="Email"
          name="contactEmail"
          type="email"
          defaultValue={defaults.contactEmail}
          required
          autoComplete="email"
        />
        <Field
          label="Téléphone (optionnel)"
          name="contactPhone"
          type="tel"
          defaultValue={defaults.contactPhone}
          autoComplete="tel"
        />
      </fieldset>

      {state.error ? (
        <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          {state.error}
        </p>
      ) : null}

      <div>
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          <Send className="size-4" aria-hidden="true" />
          {isPending ? "Envoi en cours…" : "Transmettre ma demande"}
        </button>
      </div>
    </form>
  )
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  placeholder,
  required,
  autoComplete,
}: {
  label: string
  name: string
  type?: string
  defaultValue?: string
  placeholder?: string
  required?: boolean
  autoComplete?: string
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        className="min-h-11 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
    </label>
  )
}

function TextArea({
  label,
  name,
  placeholder,
  required,
}: {
  label: string
  name: string
  placeholder?: string
  required?: boolean
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </span>
      <textarea
        name={name}
        placeholder={placeholder}
        required={required}
        rows={4}
        className="min-h-24 resize-y rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
    </label>
  )
}
