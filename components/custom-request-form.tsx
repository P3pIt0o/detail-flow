"use client"

/**
 * Formulaire public « Demande personnalisée », relié à la Server Action
 * submitCustomRequest. Les champs véhicule/flotte s'adaptent au type choisi.
 */

import { useActionState, useState } from "react"
import { useFormStatus } from "react-dom"
import { CheckCircle2, AlertCircle } from "lucide-react"
import { submitCustomRequest, type DemandeFormState } from "@/app/(site)/demande/actions"
import { type CustomRequestType, isFleetType } from "@/lib/custom-requests"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

const initialState: DemandeFormState = { status: "idle", message: "" }

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-12 w-full items-center justify-center rounded-full bg-primary px-8 text-base font-semibold text-primary-foreground transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
    >
      {pending ? "Envoi en cours…" : "Envoyer ma demande"}
    </button>
  )
}

export function CustomRequestForm({ types }: { types: CustomRequestType[] }) {
  const [state, formAction] = useActionState(submitCustomRequest, initialState)
  const [selectedType, setSelectedType] = useState(types[0]?.key ?? "")
  const showFleet = isFleetType(selectedType)

  if (state.status === "success") {
    return (
      <div
        role="status"
        className="flex flex-col items-center gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-8 text-center"
      >
        <CheckCircle2 className="size-10 text-primary" aria-hidden="true" />
        <h2 className="font-serif text-2xl font-bold text-foreground">Demande envoyée</h2>
        <p className="text-pretty text-muted-foreground">
          Merci ! Votre demande a bien été transmise. Vous recevrez une proposition personnalisée par email.
        </p>
      </div>
    )
  }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.status === "error" && !state.errors && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-foreground"
        >
          <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
          <p>{state.message}</p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="typeKey">Type de demande</Label>
        <select
          id="typeKey"
          name="typeKey"
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {types.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
        {state.errors?.typeKey && <p className="text-sm text-destructive">{state.errors.typeKey}</p>}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="customerName">Nom complet</Label>
          <Input id="customerName" name="customerName" autoComplete="name" required aria-invalid={!!state.errors?.customerName} />
          {state.errors?.customerName && <p className="text-sm text-destructive">{state.errors.customerName}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="customerPhone">Téléphone</Label>
          <Input id="customerPhone" name="customerPhone" type="tel" autoComplete="tel" required aria-invalid={!!state.errors?.customerPhone} />
          {state.errors?.customerPhone && <p className="text-sm text-destructive">{state.errors.customerPhone}</p>}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="customerEmail">Email</Label>
        <Input id="customerEmail" name="customerEmail" type="email" autoComplete="email" required aria-invalid={!!state.errors?.customerEmail} />
        {state.errors?.customerEmail && <p className="text-sm text-destructive">{state.errors.customerEmail}</p>}
      </div>

      {showFleet ? (
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="fleetCompanyName">Nom de la société</Label>
            <Input id="fleetCompanyName" name="fleetCompanyName" autoComplete="organization" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vehicleCount">Nombre de véhicules</Label>
            <Input id="vehicleCount" name="vehicleCount" inputMode="numeric" />
          </div>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="vehicleType">Type de véhicule</Label>
            <Input id="vehicleType" name="vehicleType" placeholder="Berline, SUV…" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vehicleBrand">Marque</Label>
            <Input id="vehicleBrand" name="vehicleBrand" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vehicleModel">Modèle</Label>
            <Input id="vehicleModel" name="vehicleModel" />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="frequency">Fréquence souhaitée (facultatif)</Label>
        <Input id="frequency" name="frequency" placeholder="Ponctuel, mensuel, hebdomadaire…" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="customerLegalRegistrationNumber">
          Numéro d&apos;entreprise / identifiant légal (facultatif)
        </Label>
        <Input
          id="customerLegalRegistrationNumber"
          name="customerLegalRegistrationNumber"
          maxLength={60}
          autoComplete="off"
        />
        <p className="text-sm text-muted-foreground">
          Par exemple : numéro BCE en Belgique ou SIREN/SIRET en France.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Décrivez votre besoin</Label>
        <Textarea id="description" name="description" rows={5} required aria-invalid={!!state.errors?.description} />
        {state.errors?.description && <p className="text-sm text-destructive">{state.errors.description}</p>}
      </div>

      {/* Honeypot anti-spam */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="company_website">Ne pas remplir</label>
        <input id="company_website" name="company_website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <SubmitButton />
    </form>
  )
}
