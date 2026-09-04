"use client"

/**
 * Formulaire public « Demande personnalisée », relié à la Server Action
 * submitCustomRequest. Les champs véhicule/flotte s'adaptent au type choisi.
 *
 * Soumission en plusieurs phases (photos facultatives) :
 *   1. enregistrement idempotent de la demande → jeton d'envoi signé ;
 *   2. envoi direct des photos vers le Blob privé (jamais dans le body) ;
 *   3. notification unique du professionnel (finalisation).
 * La demande n'est JAMAIS perdue si une photo échoue : elle est déjà
 * enregistrée et l'utilisateur peut relancer uniquement les envois en échec.
 */

import { useRef, useState } from "react"
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react"
import { submitCustomRequest, finalizeCustomRequest, type DemandeFormState } from "@/app/(site)/demande/actions"
import { type CustomRequestType, isFleetType } from "@/lib/custom-requests"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { QuotePhotoUploader, usePhotoUploads } from "@/components/quote-photo-uploader"

const initialState: DemandeFormState = { status: "idle", message: "" }

function newSubmissionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return `sub_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

type Phase = "form" | "success" | "partial"

export function CustomRequestForm({
  types,
  /**
   * Active le choix « Particulier / Professionnel » en tête de formulaire
   * (opt-in). Laissé à `false` par défaut : le formulaire standard (/demande
   * des autres tenants) reste STRICTEMENT inchangé — le champ identifiant légal
   * y demeure facultatif et toujours visible, sans sélecteur d'audience.
   */
  audienceToggle = false,
}: {
  types: CustomRequestType[]
  audienceToggle?: boolean
}) {
  const [state, setState] = useState<DemandeFormState>(initialState)
  const [phase, setPhase] = useState<Phase>("form")
  const [pending, setPending] = useState(false)
  const [selectedType, setSelectedType] = useState(types[0]?.key ?? "")
  const showFleet = isFleetType(selectedType)

  const uploader = usePhotoUploads()
  const formRef = useRef<HTMLFormElement>(null)
  const submissionIdRef = useRef<string>("")

  // Audience : uniquement pertinente quand `audienceToggle` est actif.
  const [audience, setAudience] = useState<"particulier" | "professionnel">("particulier")
  const isPro = audience === "professionnel"
  const showLegalField = audienceToggle ? isPro : true

  async function runSubmit() {
    if (pending) return
    const form = formRef.current
    if (!form) return
    // Empêche les doubles soumissions sans bloquer définitivement en cas d'erreur.
    setPending(true)
    try {
      const fd = new FormData(form)
      if (!submissionIdRef.current) submissionIdRef.current = newSubmissionId()
      fd.set("submissionId", submissionIdRef.current)
      fd.set("photosExpected", String(uploader.count))

      const result = await submitCustomRequest(initialState, fd)
      setState(result)
      if (result.status !== "success") return

      // Photos à envoyer : la demande est déjà enregistrée (jamais perdue).
      if (result.grant && result.uploadPrefix && uploader.count > 0) {
        const { failed } = await uploader.uploadAll(result.grant, result.uploadPrefix)
        // Notification unique du professionnel (idempotente).
        await finalizeCustomRequest({ grant: result.grant })
        setPhase(failed > 0 ? "partial" : "success")
      } else {
        setPhase("success")
      }
    } catch {
      setState({ status: "error", message: "Une erreur est survenue. Merci de réessayer." })
    } finally {
      setPending(false)
    }
  }

  if (phase === "success") {
    return (
      <div
        role="status"
        className="flex flex-col items-center gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-8 text-center"
      >
        <CheckCircle2 className="size-10 text-primary" aria-hidden="true" />
        <h2 className="font-serif text-2xl font-bold text-foreground">Demande envoyée</h2>
        <p className="text-pretty text-muted-foreground">
          Merci ! Votre demande a bien été transmise
          {uploader.count > 0 ? ", photos comprises" : ""}. Vous recevrez une proposition personnalisée par email.
        </p>
      </div>
    )
  }

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault()
        void runSubmit()
      }}
      className="space-y-5"
      noValidate
    >
      {phase === "partial" && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-foreground"
        >
          <AlertCircle className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden="true" />
          <p>
            Votre demande a bien été enregistrée, mais certaines photos n&apos;ont pas pu être envoyées. Vous pouvez
            réessayer leur envoi.
          </p>
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

      {audienceToggle && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">Vous êtes :</legend>
          <div role="radiogroup" aria-label="Type de client" className="grid grid-cols-2 gap-2">
            {[
              { value: "particulier", label: "Un particulier" },
              { value: "professionnel", label: "Un professionnel" },
            ].map((opt) => (
              <label key={opt.value} className="cursor-pointer">
                <input
                  type="radio"
                  name="customerType"
                  value={opt.value}
                  checked={audience === opt.value}
                  onChange={() => setAudience(opt.value as "particulier" | "professionnel")}
                  className="peer sr-only"
                />
                <span className="flex h-11 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted/50 peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2">
                  {opt.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

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

      {showLegalField && (
        <div className="space-y-2">
          <Label htmlFor="customerLegalRegistrationNumber">
            {audienceToggle ? "SIREN / SIRET ou numéro BCE" : "Numéro d'entreprise / identifiant légal (facultatif)"}
          </Label>
          <Input
            id="customerLegalRegistrationNumber"
            name="customerLegalRegistrationNumber"
            maxLength={60}
            autoComplete="off"
            required={audienceToggle}
            aria-invalid={audienceToggle && !!state.errors?.customerLegalRegistrationNumber}
          />
          <p className="text-sm text-muted-foreground">
            {audienceToggle
              ? "SIREN ou SIRET en France, numéro BCE en Belgique."
              : "Par exemple : numéro BCE en Belgique ou SIREN/SIRET en France."}
          </p>
          {audienceToggle && state.errors?.customerLegalRegistrationNumber && (
            <p className="text-sm text-destructive">{state.errors.customerLegalRegistrationNumber}</p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="description">Décrivez votre besoin</Label>
        <Textarea id="description" name="description" rows={5} required aria-invalid={!!state.errors?.description} />
        {state.errors?.description && <p className="text-sm text-destructive">{state.errors.description}</p>}
      </div>

      {/* Photos facultatives — commun à tous les tenants, thème hérité. */}
      <QuotePhotoUploader uploader={uploader} disabled={pending} />

      {/* Honeypot anti-spam */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="company_website">Ne pas remplir</label>
        <input id="company_website" name="company_website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-8 text-base font-semibold text-primary-foreground transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {pending
          ? "Envoi en cours…"
          : phase === "partial"
            ? "Réessayer l'envoi"
            : "Envoyer ma demande"}
      </button>
    </form>
  )
}
