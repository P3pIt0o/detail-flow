"use client"

/**
 * ============================================================================
 *  CONFIGURATEUR SPIRIT ACS (Phase 5) — UI progressive au-dessus du moteur
 *  existant de demandes personnalisées.
 * ============================================================================
 *
 *  Ce composant N'EST QU'UNE INTERFACE : il assemble une sélection structurée
 *  (prestation → options → véhicule → coordonnées → demande → photos → récap)
 *  puis alimente EXACTEMENT la même Server Action `submitCustomRequest` que le
 *  formulaire libre. Aucun calcul de prix, aucun rendez-vous automatique,
 *  aucune écriture directe en base, aucun Stripe : le moteur reste unique.
 *
 *  Deux entrées (cf. cahier des charges) :
 *   1. depuis une page prestation → `?prestation=<slug>` : la prestation est
 *      VERROUILLÉE (le client ne la re-choisit pas) ;
 *   2. depuis « Demander un devis » (accueil) → le client choisit d'abord la
 *      prestation.
 *
 *  Repli « Autre demande » : le formulaire libre historique reste accessible
 *  (flotte, abonnement, besoin hors liste) sans dupliquer la logique.
 *
 *  Règles métier verrouillées (modèle validé) :
 *   - Polissage & Céramique : parcours combiné. Le client choisit un niveau de
 *     polissage (1/2/3) OU « Spirit ACS détermine après inspection » (exclusif),
 *     puis peut AJOUTER une protection céramique (facultative, indépendante).
 *     Une céramique carrosserie ne se commande jamais seule : l'entrée
 *     « Protection céramique » est ramenée vers ce parcours. Toujours sur devis.
 *   - PPF : sélection de zones, toujours sur devis (aucun prix par zone).
 *   - Photos : facultatives partout ; jamais bloquantes.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import { CheckCircle2, AlertCircle, Loader2, ChevronLeft, ArrowRight, Lock } from "lucide-react"
import { submitCustomRequest, finalizeCustomRequest, type DemandeFormState } from "@/app/(site)/demande/actions"
import type { CustomRequestType } from "@/lib/custom-requests"
import { CustomRequestForm } from "@/components/custom-request-form"
import { QuotePhotoUploader, usePhotoUploads } from "@/components/quote-photo-uploader"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  buildSummary,
  canonicalServiceSlug,
  CERAMIC_SLUG,
  formulaPriceLabel,
  getCeramicFormulas,
  getServiceFormulas,
  getServiceRule,
  listConfiguratorServices,
  POLISH_INSPECTION_VALUE,
  PPF_ZONES,
  serializeConfiguratorDescription,
  suggestedVehicleType,
  VEHICLE_TYPES,
  type ConfiguratorSelection,
} from "./config"
import { VehicleTypeIcon } from "./vehicle-icons"

type StepKey = "service" | "options" | "vehicle" | "contact" | "details" | "review"

const STEP_LABEL: Record<StepKey, string> = {
  service: "Prestation",
  options: "Détails",
  vehicle: "Véhicule",
  contact: "Coordonnées",
  details: "Votre demande",
  review: "Validation",
}

const initialServerState: DemandeFormState = { status: "idle", message: "" }

function newSubmissionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return `sub_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

const SERVICES = listConfiguratorServices()

export function SpiritConfigurator({ types }: { types: CustomRequestType[] }) {
  // Type de demande transmis au moteur : parcours « sur mesure » (repli sûr sur
  // le premier type actif si le tenant a désactivé « sur-mesure »).
  const quoteTypeKey = useMemo(
    () => types.find((t) => t.key === "sur-mesure")?.key ?? types[0]?.key ?? "sur-mesure",
    [types],
  )

  const [serviceSlug, setServiceSlug] = useState("")
  const [locked, setLocked] = useState(false)
  const [step, setStep] = useState<StepKey>("service")
  const [showClassic, setShowClassic] = useState(false)

  // Sélection
  const [formulaLabel, setFormulaLabel] = useState<string | null>(null)
  // Parcours Polissage & Céramique : deux états INDÉPENDANTS (l'un ne réinitialise
  // jamais l'autre) ; `polishLevel` requis, `ceramicLabel` facultatif.
  const [polishLevel, setPolishLevel] = useState<string | null>(null)
  const [ceramicLabel, setCeramicLabel] = useState<string | null>(null)
  // Vrai si le client est arrivé par l'entrée « Protection céramique » (ramené
  // vers le polissage) : sert uniquement à afficher une note pédagogique.
  const [cameFromCeramic, setCameFromCeramic] = useState(false)
  const [ppfZones, setPpfZones] = useState<string[]>([])
  const [ppfOther, setPpfOther] = useState("")
  const [vehicleType, setVehicleType] = useState("")
  const [vehicleBrand, setVehicleBrand] = useState("")
  const [vehicleModel, setVehicleModel] = useState("")
  const [audience, setAudience] = useState<"particulier" | "professionnel">("particulier")
  const [legal, setLegal] = useState("")
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [phase, setPhase] = useState<"form" | "success" | "partial">("form")

  const uploader = usePhotoUploads()
  const submissionIdRef = useRef<string>("")

  // POINT D'ENTRÉE DU PARCOURS — déterministe et piloté par l'URL.
  //
  //  CAS A · CTA général « Réserver ma prestation » (hero, CTA final, footer…) :
  //          aucun `?prestation=` valide → le parcours COMMENCE TOUJOURS par
  //          l'étape « Prestation » (le client choisit d'abord son service).
  //          Jamais « Véhicule » en premier sans prestation sélectionnée.
  //
  //  CAS B · Clic « Réserver » depuis une carte/page prestation :
  //          `?prestation=<slug>` valide → la prestation est VERROUILLÉE et le
  //          parcours saute directement à l'étape suivante (options ou véhicule).
  //
  //  La barre de progression et la numérotation se dérivent de `steps`
  //  (mémo ci-dessous) : elles s'adaptent donc automatiquement au parcours
  //  réellement affiché (avec ou sans étape « Prestation »).
  useEffect(() => {
    function applyEntryFromUrl() {
      const raw = new URLSearchParams(window.location.search).get("prestation")?.trim()
      const match = raw ? SERVICES.find((s) => s.slug === raw) : undefined

      // CAS A — pas de prestation valide : on repart du choix de prestation.
      if (!match) {
        setLocked(false)
        setServiceSlug("")
        setCameFromCeramic(false)
        setStep("service")
        return
      }

      // CAS B — prestation présélectionnée (verrouillée). Une céramique
      // carrosserie ne se commande jamais seule : l'entrée « Protection
      // céramique » est ramenée vers le parcours Polissage & Céramique.
      const slug = canonicalServiceSlug(match.slug)
      setServiceSlug(slug)
      setCameFromCeramic(match.slug === CERAMIC_SLUG)
      setLocked(true)
      setVehicleType(suggestedVehicleType(slug))
      const rule = getServiceRule(slug)
      setStep(rule.mode !== "none" ? "options" : "vehicle")
    }

    applyEntryFromUrl()
    // Réagit aux navigations d'historique (retour arrière / avant) pour rester
    // cohérent avec l'URL courante.
    window.addEventListener("popstate", applyEntryFromUrl)
    return () => window.removeEventListener("popstate", applyEntryFromUrl)
  }, [])

  const rule = getServiceRule(serviceSlug)
  const service = SERVICES.find((s) => s.slug === serviceSlug)
  const formulas = getServiceFormulas(serviceSlug)

  // Étapes actives (dépendent de la prestation choisie).
  const steps = useMemo<StepKey[]>(() => {
    const s: StepKey[] = []
    if (!locked) s.push("service")
    if (serviceSlug && rule.mode !== "none") s.push("options")
    s.push("vehicle", "contact", "details", "review")
    return s
  }, [locked, serviceSlug, rule.mode])

  const stepIndex = Math.max(0, steps.indexOf(step))

  function chooseService(rawSlug: string) {
    const slug = canonicalServiceSlug(rawSlug)
    setServiceSlug(slug)
    setCameFromCeramic(rawSlug === CERAMIC_SLUG)
    setFormulaLabel(null)
    setPolishLevel(null)
    setCeramicLabel(null)
    setPpfZones([])
    setPpfOther("")
    setVehicleType(suggestedVehicleType(slug))
    const r = getServiceRule(slug)
    setStep(r.mode !== "none" ? "options" : "vehicle")
  }

  function toggleZone(zone: string) {
    setPpfZones((prev) => (prev.includes(zone) ? prev.filter((z) => z !== zone) : [...prev, zone]))
  }

  function validateStep(current: StepKey): boolean {
    const e: Record<string, string> = {}
    if (current === "options") {
      if (rule.mode === "polish-and-ceramic" && !polishLevel) {
        e.polish = "Choisissez un niveau de polissage, ou laissez Spirit ACS le déterminer."
      }
      if (rule.mode === "select-formula" && !formulaLabel) {
        e.formula = "Sélectionnez une formule pour continuer."
      }
      if (rule.mode === "ppf-zones" && ppfZones.length === 0 && !ppfOther.trim()) {
        e.ppf = "Sélectionnez au moins une zone ou précisez votre besoin."
      }
    }
    if (current === "vehicle") {
      if (!vehicleType.trim()) e.vehicleType = "Indiquez le type de véhicule."
      if (!vehicleBrand.trim()) e.vehicleBrand = "Indiquez la marque."
    }
    if (current === "contact") {
      if (!name.trim()) e.name = "Votre nom est requis."
      if (!phone.trim()) e.phone = "Votre téléphone est requis."
      if (!/\S+@\S+\.\S+/.test(email)) e.email = "Email invalide."
      if (audience === "professionnel" && !legal.trim()) {
        e.legal = "Ce numéro est requis pour un professionnel (SIREN/SIRET ou BCE)."
      }
    }
    if (current === "details") {
      if (rule.mode === "none" && message.trim().length < 5) {
        e.message = "Décrivez votre besoin (5 caractères minimum)."
      }
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function goNext() {
    if (!validateStep(step)) return
    const idx = steps.indexOf(step)
    if (idx < steps.length - 1) setStep(steps[idx + 1])
  }

  function goPrev() {
    setErrors({})
    const idx = steps.indexOf(step)
    if (idx > 0) setStep(steps[idx - 1])
    else if (!locked) setStep("service")
  }

  const currentSelection = (): ConfiguratorSelection => ({
    serviceSlug,
    serviceTitle: service?.title ?? serviceSlug,
    formulaLabel,
    polishLevel,
    ceramicLabel,
    ppfZones,
    ppfOther,
    vehicleType,
    vehicleBrand,
    vehicleModel,
    audience,
    message,
  })

  async function submit() {
    if (pending) return
    setPending(true)
    setServerError(null)
    try {
      const fd = new FormData()
      fd.set("typeKey", quoteTypeKey)
      fd.set("customerName", name.trim())
      fd.set("customerPhone", phone.trim())
      fd.set("customerEmail", email.trim())
      fd.set("customerType", audience)
      if (audience === "professionnel") fd.set("customerLegalRegistrationNumber", legal.trim())
      fd.set("vehicleType", vehicleType.trim())
      fd.set("vehicleBrand", vehicleBrand.trim())
      fd.set("vehicleModel", vehicleModel.trim())
      fd.set("description", serializeConfiguratorDescription(currentSelection()))
      if (!submissionIdRef.current) submissionIdRef.current = newSubmissionId()
      fd.set("submissionId", submissionIdRef.current)
      fd.set("photosExpected", String(uploader.count))

      const result = await submitCustomRequest(initialServerState, fd)
      if (result.status !== "success") {
        setServerError(result.message || "Une erreur est survenue. Merci de réessayer.")
        return
      }
      if (result.grant && result.uploadPrefix && uploader.count > 0) {
        const { failed } = await uploader.uploadAll(result.grant, result.uploadPrefix)
        await finalizeCustomRequest({ grant: result.grant })
        setPhase(failed > 0 ? "partial" : "success")
      } else {
        setPhase("success")
      }
    } catch {
      setServerError("Une erreur est survenue. Merci de réessayer.")
    } finally {
      setPending(false)
    }
  }

  /* ----------------------------- Écran de succès --------------------------- */
  if (phase === "success") {
    const appointment = rule.finalAction === "appointment"
    return (
      <div
        role="status"
        className="flex flex-col items-center gap-3 rounded-2xl border border-[color:var(--spirit-pink)]/30 bg-[color:var(--spirit-pink)]/5 p-8 text-center"
      >
        <CheckCircle2 className="size-10 text-[color:var(--spirit-pink)]" aria-hidden="true" />
        <h3 className="spirit-title text-2xl">Votre demande a bien été envoyée</h3>
        <p className="text-pretty text-[color:var(--spirit-muted)]">
          Merci ! Votre demande de réservation a bien été transmise{uploader.count > 0 ? ", photos comprises" : ""}.{" "}
          Spirit ACS va l&apos;étudier et vous confirmer la prise en charge
          {appointment ? ", puis convenir d'un rendez-vous pour constater l'état de votre véhicule." : "."}
        </p>
      </div>
    )
  }

  /* ------------------------- Repli « Autre demande » ----------------------- */
  if (showClassic) {
    return (
      <div className="space-y-5">
        <button
          type="button"
          onClick={() => setShowClassic(false)}
          className="inline-flex items-center gap-1 text-sm font-medium text-[color:var(--spirit-teal)] hover:underline"
        >
          <ChevronLeft className="size-4" aria-hidden="true" /> Revenir au configurateur
        </button>
        <CustomRequestForm types={types} audienceToggle />
      </div>
    )
  }

  const totalSteps = steps.length

  /* ------------------------------- Rendu wizard ---------------------------- */
  return (
    <div className="space-y-6">
      {/* Progression */}
      <div>
        <div className="flex items-center justify-between text-sm">
          <span className="spirit-eyebrow" style={{ color: "var(--spirit-teal-strong)" }}>
            Étape {stepIndex + 1} / {totalSteps}
          </span>
          <span className="font-medium text-[color:var(--spirit-fg)]">{STEP_LABEL[step]}</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
          <div
            className="h-full rounded-full bg-[color:var(--spirit-pink)] transition-[width]"
            style={{ width: `${((stepIndex + 1) / totalSteps) * 100}%` }}
          />
        </div>
      </div>

      {serverError && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-[color:var(--destructive)]/30 bg-[color:var(--destructive)]/10 p-4 text-sm text-[color:var(--spirit-fg)]"
        >
          <AlertCircle className="mt-0.5 size-5 shrink-0 text-[color:var(--destructive)]" aria-hidden="true" />
          <p>{serverError}</p>
        </div>
      )}

      {phase === "partial" && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-[color:var(--spirit-fg)]"
        >
          <AlertCircle className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden="true" />
          <p>
            Votre demande a bien été enregistrée, mais certaines photos n&apos;ont pas pu être envoyées. Vous pouvez
            réessayer leur envoi.
          </p>
        </div>
      )}

      {/* ------------------------------- SERVICE ------------------------------ */}
      {step === "service" && (
        <div className="space-y-4">
          <p className="text-sm text-[color:var(--spirit-muted)]">
            Choisissez votre prestation et envoyez votre demande. Spirit ACS vous confirme ensuite la prise en charge.
          </p>
          {/*
            Cartes de SÉLECTION en format paysage compact (photo réelle +
            overlay sombre), une par ligne pour rester nettement plus larges que
            hautes. Toute la carte est cliquable (choix de la catégorie) : un
            seul CTA ici, contrairement à la homepage (Réserver + En savoir plus).
          */}
          <ul className="grid grid-cols-1 gap-3">
            {SERVICES.map((s) => (
              <li key={s.slug}>
                <button
                  type="button"
                  onClick={() => chooseService(s.slug)}
                  className="group relative flex min-h-[7.5rem] w-full flex-col justify-end overflow-hidden rounded-xl text-left ring-1 ring-white/12 transition-all duration-300 hover:ring-[color:var(--spirit-pink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--spirit-teal)] sm:min-h-[8.5rem]"
                >
                  {s.image && (
                    <Image
                      src={s.image || "/placeholder.svg"}
                      alt={s.imageAlt || s.title}
                      fill
                      sizes="(min-width: 640px) 560px, 100vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                    />
                  )}
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 bg-gradient-to-t from-[color:var(--spirit-navy)] via-[color:var(--spirit-navy)]/55 to-transparent"
                  />
                  <span className="relative z-10 flex items-end justify-between gap-3 p-4">
                    <span className="min-w-0">
                      <span className="spirit-title block font-semibold uppercase leading-tight tracking-wide text-white [font-size:clamp(1rem,4.5vw,1.2rem)]">
                        {s.title}
                      </span>
                      <span className="mt-1 block text-sm leading-snug text-white/85">{s.tagline}</span>
                    </span>
                    <ArrowRight
                      className="size-5 shrink-0 text-white/90 transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="pt-2 text-sm">
            <button
              type="button"
              onClick={() => setShowClassic(true)}
              className="font-medium text-[color:var(--spirit-teal)] hover:underline"
            >
              Autre demande (flotte, abonnement, besoin spécifique) →
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------- OPTIONS ------------------------------ */}
      {step === "options" && (
        <div className="space-y-5">
          {locked && service && (
            <p className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--spirit-navy-3)] px-3 py-1 text-sm text-[color:var(--spirit-fg)]">
              <Lock className="size-3.5 text-[color:var(--spirit-teal)]" aria-hidden="true" />
              Prestation : <span className="font-semibold">{service.title}</span>
            </p>
          )}

          {/* Polissage & Céramique : niveau de polissage (requis) + céramique (facultative). */}
          {rule.mode === "polish-and-ceramic" && (
            <div className="space-y-6">
              {cameFromCeramic && (
                <p className="rounded-xl border border-[color:var(--spirit-teal)]/30 bg-[color:var(--spirit-teal)]/5 p-3 text-sm text-[color:var(--spirit-fg)]">
                  Une protection céramique s&apos;applique toujours sur une carrosserie polie. Choisissez d&apos;abord
                  votre polissage ci-dessous, puis ajoutez la protection céramique souhaitée.
                </p>
              )}

              {/* Groupe A — Polissage (choix requis, exclusif) */}
              <fieldset className="space-y-2">
                <legend className="font-medium text-[color:var(--spirit-fg)]">Polissage</legend>
                <p className="text-sm text-[color:var(--spirit-muted)]">
                  Choisissez un niveau, ou laissez Spirit ACS le déterminer après inspection de la carrosserie.
                </p>
                <div className="grid gap-2">
                  {formulas.map((f) => {
                    const value = `${f.label} (${formulaPriceLabel(f)})`
                    const checked = polishLevel === value
                    return (
                      <label key={f.label} className="cursor-pointer">
                        <input
                          type="radio"
                          name="polish-level"
                          value={value}
                          checked={checked}
                          onChange={() => setPolishLevel(value)}
                          className="peer sr-only"
                        />
                        <span className="flex items-start justify-between gap-3 rounded-xl border border-white/12 bg-[color:var(--spirit-navy-3)] p-3 transition-colors peer-checked:border-[color:var(--spirit-pink)] peer-checked:bg-[color:var(--spirit-pink)]/5 peer-focus-visible:ring-2 peer-focus-visible:ring-[color:var(--spirit-teal)]">
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-[color:var(--spirit-fg)]">{f.label}</span>
                            {f.note && (
                              <span className="mt-0.5 block text-xs text-[color:var(--spirit-muted)]">{f.note}</span>
                            )}
                          </span>
                          <span className="shrink-0 whitespace-nowrap text-sm font-semibold text-[color:var(--spirit-teal-strong)]">
                            {formulaPriceLabel(f)}
                          </span>
                        </span>
                      </label>
                    )
                  })}

                  {/* Alternative EXCLUSIVE : détermination après inspection (jamais un niveau). */}
                  <label className="cursor-pointer">
                    <input
                      type="radio"
                      name="polish-level"
                      value={POLISH_INSPECTION_VALUE}
                      checked={polishLevel === POLISH_INSPECTION_VALUE}
                      onChange={() => setPolishLevel(POLISH_INSPECTION_VALUE)}
                      className="peer sr-only"
                    />
                    <span className="flex items-start gap-2 rounded-xl border border-dashed border-white/25 bg-[color:var(--spirit-navy-3)] p-3 transition-colors peer-checked:border-[color:var(--spirit-pink)] peer-checked:bg-[color:var(--spirit-pink)]/5 peer-focus-visible:ring-2 peer-focus-visible:ring-[color:var(--spirit-teal)]">
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-[color:var(--spirit-fg)]">
                          Laisser Spirit ACS déterminer le niveau après inspection
                        </span>
                        <span className="mt-0.5 block text-xs text-[color:var(--spirit-muted)]">
                          Le niveau de correction est défini après examen de la carrosserie, sans être choisi à
                          l&apos;avance.
                        </span>
                      </span>
                    </span>
                  </label>
                </div>
                {errors.polish && <p className="text-sm text-[color:var(--destructive)]">{errors.polish}</p>}
              </fieldset>

              {/* Groupe B — Protection céramique (facultative, indépendante du polissage) */}
              <fieldset className="space-y-2">
                <legend className="font-medium text-[color:var(--spirit-fg)]">
                  Protection céramique{" "}
                  <span className="font-normal text-[color:var(--spirit-muted)]">(facultatif)</span>
                </legend>
                <p className="text-sm text-[color:var(--spirit-muted)]">
                  Ajoutez une protection si vous le souhaitez. Votre choix est confirmé par Spirit ACS après analyse.
                </p>
                <div className="grid gap-2">
                  <label className="cursor-pointer">
                    <input
                      type="radio"
                      name="ceramic-option"
                      checked={ceramicLabel === null}
                      onChange={() => setCeramicLabel(null)}
                      className="peer sr-only"
                    />
                    <span className="flex items-center rounded-xl border border-white/12 bg-[color:var(--spirit-navy-3)] p-3 text-sm font-medium text-[color:var(--spirit-fg)] transition-colors peer-checked:border-[color:var(--spirit-pink)] peer-checked:bg-[color:var(--spirit-pink)]/5 peer-focus-visible:ring-2 peer-focus-visible:ring-[color:var(--spirit-teal)]">
                      Sans protection céramique
                    </span>
                  </label>
                  {getCeramicFormulas().map((f) => {
                    const value = `${f.label} (${formulaPriceLabel(f)})`
                    const checked = ceramicLabel === value
                    return (
                      <label key={f.label} className="cursor-pointer">
                        <input
                          type="radio"
                          name="ceramic-option"
                          value={value}
                          checked={checked}
                          onChange={() => setCeramicLabel(value)}
                          className="peer sr-only"
                        />
                        <span className="flex items-center justify-between gap-3 rounded-xl border border-white/12 bg-[color:var(--spirit-navy-3)] p-3 transition-colors peer-checked:border-[color:var(--spirit-pink)] peer-checked:bg-[color:var(--spirit-pink)]/5 peer-focus-visible:ring-2 peer-focus-visible:ring-[color:var(--spirit-teal)]">
                          <span className="text-sm font-medium text-[color:var(--spirit-fg)]">{f.label}</span>
                          <span className="shrink-0 whitespace-nowrap text-sm font-semibold text-[color:var(--spirit-teal-strong)]">
                            {formulaPriceLabel(f)}
                          </span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              </fieldset>
            </div>
          )}

          {/* Céramique : sélection d'une formule par le client. */}
          {rule.mode === "select-formula" && (
            <fieldset className="space-y-2">
              <legend className="font-medium text-[color:var(--spirit-fg)]">Quelle protection souhaitez-vous ?</legend>
              <p className="text-sm text-[color:var(--spirit-muted)]">
                Votre choix est confirmé par Spirit ACS après analyse de la carrosserie (une préparation ou un polissage
                peuvent être conseillés).
              </p>
              <div className="grid gap-2">
                {formulas.map((f) => {
                  const value = `${f.label} (${formulaPriceLabel(f)})`
                  const checked = formulaLabel === value
                  return (
                    <label key={f.label} className="cursor-pointer">
                      <input
                        type="radio"
                        name="ceramic-formula"
                        value={value}
                        checked={checked}
                        onChange={() => setFormulaLabel(value)}
                        className="peer sr-only"
                      />
                      <span className="flex items-center justify-between gap-3 rounded-xl border border-white/12 bg-[color:var(--spirit-navy-3)] p-3 transition-colors peer-checked:border-[color:var(--spirit-pink)] peer-checked:bg-[color:var(--spirit-pink)]/5 peer-focus-visible:ring-2 peer-focus-visible:ring-[color:var(--spirit-teal)]">
                        <span className="text-sm font-medium text-[color:var(--spirit-fg)]">{f.label}</span>
                        <span className="shrink-0 whitespace-nowrap text-sm font-semibold text-[color:var(--spirit-teal-strong)]">
                          {formulaPriceLabel(f)}
                        </span>
                      </span>
                    </label>
                  )
                })}
              </div>
              {errors.formula && <p className="text-sm text-[color:var(--destructive)]">{errors.formula}</p>}
            </fieldset>
          )}

          {/* Polissage : formules INFORMATIVES, aucune sélection. Aboutit à un RDV. */}
          {rule.mode === "info-formula" && (
            <div className="space-y-3">
              <div className="rounded-xl border border-[color:var(--spirit-teal)]/30 bg-[color:var(--spirit-teal)]/5 p-4 text-sm text-[color:var(--spirit-fg)]">
                {rule.photoHint}
              </div>
              {formulas.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-[color:var(--spirit-fg)]">
                    Formules à titre indicatif
                  </p>
                  <ul className="mt-2 divide-y divide-white/10 rounded-xl border border-white/12 bg-[color:var(--spirit-navy-3)]">
                    {formulas.map((f) => (
                      <li key={f.label} className="flex items-baseline justify-between gap-3 p-3">
                        <span className="min-w-0 text-sm text-[color:var(--spirit-fg)]">
                          {f.label}
                          {f.note && <span className="mt-0.5 block text-xs text-[color:var(--spirit-muted)]">{f.note}</span>}
                        </span>
                        <span className="shrink-0 whitespace-nowrap text-sm font-semibold text-[color:var(--spirit-teal-strong)]">
                          {formulaPriceLabel(f)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-[color:var(--spirit-muted)]">
                    Le niveau de correction adapté est déterminé par Spirit ACS lors du rendez-vous : il n&apos;est pas
                    choisi à l&apos;avance.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* PPF : sélection de zones (toujours sur devis, aucun prix par zone). */}
          {rule.mode === "ppf-zones" && (
            <fieldset className="space-y-2">
              <legend className="font-medium text-[color:var(--spirit-fg)]">Quelles zones souhaitez-vous protéger ?</legend>
              <p className="text-sm text-[color:var(--spirit-muted)]">
                La pose PPF est toujours établie sur devis, après analyse du véhicule.
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {PPF_ZONES.map((zone) => {
                  const checked = ppfZones.includes(zone)
                  return (
                    <label key={zone} className="cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleZone(zone)}
                        className="peer sr-only"
                      />
                      <span className="flex items-center gap-2 rounded-xl border border-white/12 bg-[color:var(--spirit-navy-3)] p-3 text-sm text-[color:var(--spirit-fg)] transition-colors peer-checked:border-[color:var(--spirit-pink)] peer-checked:bg-[color:var(--spirit-pink)]/5 peer-focus-visible:ring-2 peer-focus-visible:ring-[color:var(--spirit-teal)]">
                        <span
                          aria-hidden="true"
                          className={`flex size-4 shrink-0 items-center justify-center rounded border ${checked ? "border-[color:var(--spirit-pink)] bg-[color:var(--spirit-pink)] text-white" : "border-white/30"}`}
                        >
                          {checked && <CheckCircle2 className="size-3" />}
                        </span>
                        {zone}
                      </span>
                    </label>
                  )
                })}
              </div>
              <div className="space-y-2 pt-1">
                <Label htmlFor="ppf-other">Autre zone ou « je ne sais pas » (facultatif)</Label>
                <Input
                  id="ppf-other"
                  value={ppfOther}
                  onChange={(e) => setPpfOther(e.target.value)}
                  placeholder="Décrivez la zone ou indiquez que vous hésitez"
                />
              </div>
              {errors.ppf && <p className="text-sm text-[color:var(--destructive)]">{errors.ppf}</p>}
            </fieldset>
          )}
        </div>
      )}

      {/* ------------------------------- VEHICLE ------------------------------ */}
      {step === "vehicle" && (
        <div className="space-y-5">
          <fieldset className="space-y-2">
            <legend className="font-medium text-[color:var(--spirit-fg)]">Type de véhicule</legend>
            {/* Grille de 6 (2 × 3) alignée sur la maquette. L'état sélectionné
                est signalé par TROIS indices cumulés (pas uniquement la couleur,
                a11y) : fond magenta, bordure magenta et picto en blanc. */}
            <div className="grid grid-cols-3 gap-2.5">
              {VEHICLE_TYPES.map((t) => {
                const checked = vehicleType === t
                return (
                  <label key={t} className="cursor-pointer">
                    <input
                      type="radio"
                      name="vehicle-type"
                      value={t}
                      checked={checked}
                      onChange={() => setVehicleType(t)}
                      className="peer sr-only"
                    />
                    <span className="flex h-full min-h-[5.5rem] flex-col items-center justify-center gap-2 rounded-xl border border-white/15 bg-[color:var(--spirit-navy-3)] px-2 py-3 text-center text-xs font-medium text-[color:var(--spirit-fg)] transition-colors peer-checked:border-[color:var(--spirit-pink)] peer-checked:bg-[color:var(--spirit-pink)] peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-[color:var(--spirit-teal)] peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[color:var(--spirit-navy-2)]">
                      <VehicleTypeIcon
                        type={t}
                        className={`block w-10 ${checked ? "text-white" : "text-[color:var(--spirit-teal)]"}`}
                      />
                      <span className="leading-tight text-balance">{t}</span>
                    </span>
                  </label>
                )
              })}
            </div>
            {errors.vehicleType && <p className="text-sm text-[color:var(--destructive)]">{errors.vehicleType}</p>}
          </fieldset>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="vehicle-brand">Marque</Label>
              <Input
                id="vehicle-brand"
                value={vehicleBrand}
                onChange={(e) => setVehicleBrand(e.target.value)}
                placeholder="Peugeot, BMW, Porsche…"
                aria-invalid={!!errors.vehicleBrand}
              />
              {errors.vehicleBrand && <p className="text-sm text-[color:var(--destructive)]">{errors.vehicleBrand}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="vehicle-model">Modèle (facultatif)</Label>
              <Input
                id="vehicle-model"
                value={vehicleModel}
                onChange={(e) => setVehicleModel(e.target.value)}
                placeholder="308, Série 3, 911…"
              />
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------- CONTACT ------------------------------ */}
      {step === "contact" && (
        <div className="space-y-5">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-[color:var(--spirit-fg)]">Vous êtes :</legend>
            <div role="radiogroup" aria-label="Type de client" className="grid grid-cols-2 gap-2">
              {[
                { value: "particulier", label: "Un particulier" },
                { value: "professionnel", label: "Un professionnel" },
              ].map((opt) => (
                <label key={opt.value} className="cursor-pointer">
                  <input
                    type="radio"
                    name="audience"
                    value={opt.value}
                    checked={audience === opt.value}
                    onChange={() => setAudience(opt.value as "particulier" | "professionnel")}
                    className="peer sr-only"
                  />
                  <span className="flex h-11 items-center justify-center rounded-md border border-white/15 bg-[color:var(--spirit-navy-3)] px-4 text-sm font-medium text-[color:var(--spirit-fg)] transition-colors peer-checked:border-[color:var(--spirit-pink)] peer-checked:bg-[color:var(--spirit-pink)] peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-[color:var(--spirit-teal)]">
                    {opt.label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cfg-name">Nom complet</Label>
              <Input id="cfg-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" aria-invalid={!!errors.name} />
              {errors.name && <p className="text-sm text-[color:var(--destructive)]">{errors.name}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="cfg-phone">Téléphone</Label>
              <Input id="cfg-phone" value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" autoComplete="tel" aria-invalid={!!errors.phone} />
              {errors.phone && <p className="text-sm text-[color:var(--destructive)]">{errors.phone}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cfg-email">Email</Label>
            <Input id="cfg-email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" aria-invalid={!!errors.email} />
            {errors.email && <p className="text-sm text-[color:var(--destructive)]">{errors.email}</p>}
          </div>

          {audience === "professionnel" && (
            <div className="space-y-2">
              <Label htmlFor="cfg-legal">SIREN / SIRET ou numéro BCE</Label>
              <Input id="cfg-legal" value={legal} onChange={(e) => setLegal(e.target.value)} maxLength={60} autoComplete="off" aria-invalid={!!errors.legal} />
              <p className="text-sm text-[color:var(--spirit-muted)]">SIREN ou SIRET en France, numéro BCE en Belgique.</p>
              {errors.legal && <p className="text-sm text-[color:var(--destructive)]">{errors.legal}</p>}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------- DETAILS ------------------------------ */}
      {step === "details" && (
        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="cfg-message">
              {rule.mode === "none" ? "Décrivez votre besoin" : "Précisions (facultatif)"}
            </Label>
            <Textarea
              id="cfg-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              placeholder="État du véhicule, résultat recherché, contraintes de date…"
              aria-invalid={!!errors.message}
            />
            {errors.message && <p className="text-sm text-[color:var(--destructive)]">{errors.message}</p>}
          </div>

          <div className="rounded-xl border border-white/12 bg-[color:var(--spirit-navy-3)] p-4 text-sm text-[color:var(--spirit-fg)]">
            {rule.photoHint}
          </div>
          <QuotePhotoUploader uploader={uploader} disabled={pending} />
        </div>
      )}

      {/* ------------------------------- REVIEW ------------------------------- */}
      {step === "review" && (
        <div className="space-y-5">
          <p className="text-sm text-[color:var(--spirit-muted)]">
            Vérifiez votre demande avant l&apos;envoi. Vous pouvez revenir en arrière pour la modifier.
          </p>
          <dl className="divide-y divide-white/10 rounded-xl border border-white/12 bg-[color:var(--spirit-navy-3)]">
            {buildSummary(currentSelection()).map((line) => (
              <div key={line.label} className="flex flex-col gap-0.5 p-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                <dt className="shrink-0 text-sm font-medium text-[color:var(--spirit-muted)]">{line.label}</dt>
                <dd className="text-sm text-[color:var(--spirit-fg)] sm:text-right">{line.value}</dd>
              </div>
            ))}
            {uploader.count > 0 && (
              <div className="flex items-baseline justify-between gap-4 p-3">
                <dt className="text-sm font-medium text-[color:var(--spirit-muted)]">Photos</dt>
                <dd className="text-sm text-[color:var(--spirit-fg)]">
                  {uploader.count} photo{uploader.count > 1 ? "s" : ""} à envoyer
                </dd>
              </div>
            )}
          </dl>
          {/* Rappel systématique : la réservation n'est jamais confirmée à
              l'envoi (aucun paiement, aucun créneau garanti). */}
          <p className="rounded-xl border border-[color:var(--spirit-teal)]/30 bg-[color:var(--spirit-teal)]/5 p-4 text-sm text-[color:var(--spirit-fg)]">
            {rule.finalAction === "appointment"
              ? "Votre demande sera étudiée et confirmée par Spirit ACS, qui vous recontacte ensuite pour convenir d'un rendez-vous et constater l'état de votre véhicule."
              : "Votre demande sera étudiée et confirmée par Spirit ACS. Aucun paiement à cette étape."}
          </p>
        </div>
      )}

      {/* ------------------------------ Navigation ---------------------------- */}
      <div className="flex items-center justify-between gap-3 pt-2">
        {stepIndex > 0 || (!locked && step !== "service") ? (
          <button
            type="button"
            onClick={goPrev}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-full border border-white/20 px-4 py-2.5 text-sm font-medium text-[color:var(--spirit-fg)] transition-colors hover:bg-white/5 disabled:opacity-60"
          >
            <ChevronLeft className="size-4" aria-hidden="true" /> Retour
          </button>
        ) : (
          <span />
        )}

        {step !== "service" &&
          (step === "review" ? (
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[color:var(--spirit-pink)] px-8 text-base font-semibold text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {pending
                ? "Envoi en cours…"
                : phase === "partial"
                  ? "Réessayer l'envoi"
                  : "Envoyer ma demande de réservation"}
            </button>
          ) : (
            <button
              type="button"
              onClick={goNext}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[color:var(--spirit-pink)] px-8 text-base font-semibold text-white transition-all hover:brightness-110"
            >
              Continuer <ArrowRight className="size-4" aria-hidden="true" />
            </button>
          ))}
      </div>
    </div>
  )
}
