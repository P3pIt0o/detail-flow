"use client"

/**
 * ============================================================================
 *  CONFIGURATEUR SPIRIT ACS — parcours de demande en 9 étapes (production)
 * ============================================================================
 *
 *  UI reproduite À L'IDENTIQUE de la maquette validée
 *  (`app/mockups/spirit-request`) : mêmes étapes, même ordre, mêmes composants,
 *  même barre de progression, mêmes boutons, même écran récapitulatif et même
 *  écran de confirmation. Le composant N'EST QU'UNE INTERFACE : il assemble une
 *  sélection structurée puis alimente EXACTEMENT la même Server Action
 *  `submitCustomRequest` que le formulaire libre, avec le pipeline de photos
 *  réel (`usePhotoUploads` → Blob privé + `finalizeCustomRequest`). Aucun
 *  Stripe, aucun rendez-vous automatique, aucune écriture directe en base.
 *
 *  Deux entrées :
 *   1. depuis une carte/page prestation → `?prestation=<slug>` : la prestation
 *      est présélectionnée (l'étape « Prestation » est retirée du parcours) ;
 *   2. depuis « Demander un devis » → le client choisit d'abord la prestation.
 *
 *  Estimation : PARTIELLE et jamais un devis ferme (cf. `flow-data.ts`). Le
 *  Nettoyage applique la grille officielle Spirit ACS (Intérieur + Extérieur =
 *  Int + Ext − 10 €). Un repli « Autre demande » ouvre le formulaire libre
 *  historique (flotte, abonnement, besoin hors liste).
 * ============================================================================
 */

import { useEffect, useMemo, useReducer, useRef, useState } from "react"
import { Oswald } from "next/font/google"
import { MAX_PHOTOS } from "@/lib/quote-photos/config"
import { submitCustomRequest, finalizeCustomRequest, type DemandeFormState } from "@/app/(site)/demande/actions"
import type { CustomRequestType } from "@/lib/custom-requests"
import { CustomRequestForm } from "@/components/custom-request-form"
import { usePhotoUploads, type UsePhotoUploads } from "@/components/quote-photo-uploader"
import {
  AVAILABILITY_CHOICES,
  cleaningBaseCents,
  cleaningVehicleKey,
  CLEANING_COMBO_FLOOR,
  CLEANING_DETAILS,
  CLEANING_LEVEL_LABEL,
  CLEANING_ZONE_LABEL,
  computeEstimate,
  ENTRETIEN_FLOOR,
  ENTRETIEN_FREQUENCY_LABEL,
  estimateHeadline,
  euros,
  getMainFamily,
  includedCleaningOptionIds,
  interiorAddonCentsFor,
  MAIN_FAMILIES,
  mainFamilyKeyForSlug,
  prestationsForFamily,
  type CleaningLevel,
  type CleaningZone,
  type EntretienFrequency,
  type Family,
  type FlowSelection,
  getFamily,
  priceText,
  serializeFlow,
  vehicleTypesForFamily,
} from "./flow-data"

/** Libellés courts des sous-prestations (niveau 2) affichés dans le sélecteur. */
const PRESTATION_LABELS: Record<string, string> = {
  nettoyage: "Nettoyage ponctuel",
  "entretien-regulier": "Entretien régulier",
  "moteur-echappement": "Moteur & échappement",
}

const oswald = Oswald({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-osw" })

const initialServerState: DemandeFormState = { status: "idle", message: "" }

function newSubmissionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return `sub_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

/* -------------------------------------------------------------------------- */
/*  STATE                                                                     */
/* -------------------------------------------------------------------------- */

type PpfBranch = "ppf" | "personnalisation"

type State = {
  /** NIVEAU 1 — grande famille choisie (l'une des 6). */
  familyKey: string | null
  /** Famille verrouillée (entrée depuis une carte homepage → pas d'écran familles). */
  familyLocked: boolean
  /** NIVEAU 2 — profil de prestation résolu (pilote la tarification). */
  serviceKey: string | null
  /** PPF : branche choisie (film PPF vs personnalisation) → étapes conditionnelles. */
  ppfBranch: PpfBranch | null
  i: number
  fromSummary: boolean
  formulas: Record<number, string>
  inspection: boolean
  cleaningLevel: CleaningLevel | null
  cleaningZone: CleaningZone | null
  entretienFrequency: EntretienFrequency | null
  /** Nettoyage textile : éléments à traiter (MULTI-sélection). */
  textileItems: string[]
  vehType: string | null
  vehBrand: string
  vehModel: string
  options: string[]
  contextual: string[]
  description: string
  avail: string[]
  availNote: string
  customerType: "particulier" | "professionnel"
  firstName: string
  lastName: string
  phone: string
  email: string
  legalNumber: string
}

const initialState: State = {
  familyKey: null,
  familyLocked: false,
  serviceKey: null,
  ppfBranch: null,
  i: 0,
  fromSummary: false,
  formulas: {},
  inspection: false,
  cleaningLevel: null,
  cleaningZone: null,
  entretienFrequency: null,
  textileItems: [],
  vehType: null,
  vehBrand: "",
  vehModel: "",
  options: [],
  contextual: [],
  description: "",
  avail: [],
  availNote: "",
  customerType: "particulier",
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  legalNumber: "",
}

type Action =
  | { type: "init"; familyKey: string | null; serviceKey: string | null; familyLocked: boolean; vehType: string | null }
  | { type: "reset" }
  | { type: "patch"; patch: Partial<State> }
  | { type: "chooseFamily"; familyKey: string }
  | { type: "chooseService"; serviceKey: string }
  | { type: "next" }
  | { type: "back" }
  | { type: "goto"; key: string; fromSummary?: boolean }
  | { type: "toggle"; field: "options" | "contextual" | "avail" | "textileItems"; value: string; multi?: boolean }

/** Réinitialise tous les choix dépendants d'une prestation (famille/profil). */
const RESET_DEPENDENT: Pick<
  State,
  "formulas" | "inspection" | "cleaningLevel" | "cleaningZone" | "entretienFrequency" | "textileItems" | "ppfBranch" | "options" | "contextual"
> = {
  formulas: {},
  inspection: false,
  cleaningLevel: null,
  cleaningZone: null,
  entretienFrequency: null,
  textileItems: [],
  ppfBranch: null,
  options: [],
  contextual: [],
}

/**
 * Étapes ACTIVES calculées dynamiquement à partir de l'état (§14) : la
 * hiérarchie famille → prestation → étapes conditionnelles + coordonnées. Le
 * dénominateur du compteur évolue si une réponse ajoute/retire une étape.
 */
function computeSteps(s: State): string[] {
  if (!s.familyKey) return s.familyLocked ? [] : ["famille"]
  const steps: string[] = []
  if (!s.familyLocked) steps.push("famille")
  const mf = getMainFamily(s.familyKey)
  const multi = (mf?.prestationKeys.length ?? 0) > 1
  if (multi) steps.push("prestation")
  // Profil résolu, ou représentatif (1er profil) pour projeter un compteur
  // réaliste tant que la sous-prestation n'est pas choisie.
  const profileKey = s.serviceKey ?? mf?.prestationKeys[0] ?? null
  const p = getFamily(profileKey)
  if (!p) return steps
  const isPpf = p.key === "ppf-personnalisation"
  // Nettoyage : le type de véhicule est demandé AVANT le choix de la formule,
  // afin d'afficher directement le tarif exact du gabarit sur les cartes
  // « Indispensable » / « Comme neuf ».
  const vehicleFirst = p.kind === "nettoyage" && !p.skipVehicle
  if (isPpf) {
    steps.push("formules")
    if (s.ppfBranch === "ppf") steps.push("ppfzones")
    else if (s.ppfBranch === "personnalisation" && p.options.length) steps.push("options")
    if (!p.skipVehicle) steps.push("vehicule")
  } else if (vehicleFirst) {
    steps.push("vehicule", "formules")
    if (p.options.length) steps.push("options")
  } else {
    steps.push("formules")
    if (!p.skipVehicle) steps.push("vehicule")
    if (p.options.length) steps.push("options")
  }
  steps.push("details", "photos", "dispos", "coordonnees", "recap", "confirmation")
  return steps
}

/** Index de l'étape suivant `curKey` dans les étapes calculées après mutation. */
function advanceFrom(next: State, curKey: string): number {
  const steps = computeSteps(next)
  if (next.fromSummary) return steps.indexOf("recap")
  const idx = steps.indexOf(curKey)
  return Math.min((idx < 0 ? next.i : idx) + 1, steps.length - 1)
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "init":
      return {
        ...initialState,
        familyKey: action.familyKey,
        serviceKey: action.serviceKey,
        familyLocked: action.familyLocked,
        vehType: action.vehType,
        i: 0,
      }
    case "reset":
      return {
        ...initialState,
        familyKey: state.familyLocked ? state.familyKey : null,
        familyLocked: state.familyLocked,
        serviceKey: state.familyLocked ? state.serviceKey : null,
        vehType: state.familyLocked && state.familyKey === "moto" ? "Moto" : null,
      }
    case "patch":
      return { ...state, ...action.patch }
    case "chooseFamily": {
      const mf = getMainFamily(action.familyKey)
      const single = (mf?.prestationKeys.length ?? 0) === 1
      const next: State = {
        ...state,
        ...RESET_DEPENDENT,
        familyKey: action.familyKey,
        serviceKey: single ? (mf?.prestationKeys[0] ?? null) : null,
        vehType: action.familyKey === "moto" ? "Moto" : null,
      }
      return { ...next, i: advanceFrom(next, "famille"), fromSummary: false }
    }
    case "chooseService": {
      // Changer de sous-prestation réinitialise les choix dépendants.
      const next: State = {
        ...state,
        ...RESET_DEPENDENT,
        serviceKey: action.serviceKey,
        vehType: state.familyKey === "moto" ? "Moto" : null,
      }
      return { ...next, i: advanceFrom(next, "prestation"), fromSummary: false }
    }
    case "next": {
      const steps = computeSteps(state)
      if (state.fromSummary) return { ...state, i: steps.indexOf("recap"), fromSummary: false }
      return { ...state, i: Math.min(state.i + 1, steps.length - 1) }
    }
    case "back":
      return { ...state, i: Math.max(state.i - 1, 0), fromSummary: false }
    case "goto": {
      const steps = computeSteps(state)
      const idx = steps.indexOf(action.key)
      return { ...state, i: idx < 0 ? state.i : idx, fromSummary: action.fromSummary ?? false }
    }
    case "toggle": {
      const arr = state[action.field]
      if (action.multi === false) {
        return { ...state, [action.field]: arr.includes(action.value) ? [] : [action.value] }
      }
      const next = arr.includes(action.value) ? arr.filter((v) => v !== action.value) : [...arr, action.value]
      return { ...state, [action.field]: next }
    }
    default:
      return state
  }
}

/* -------------------------------------------------------------------------- */
/*  COMPONENT                                                                 */
/* -------------------------------------------------------------------------- */

export function SpiritConfigurator({ types }: { types: CustomRequestType[] }) {
  const [s, dispatch] = useReducer(reducer, initialState)
  const patch = (p: Partial<State>) => dispatch({ type: "patch", patch: p })

  // Type de demande transmis au moteur (repli sûr sur le premier type actif).
  const quoteTypeKey = useMemo(
    () => types.find((t) => t.key === "sur-mesure")?.key ?? types[0]?.key ?? "sur-mesure",
    [types],
  )

  const [showClassic, setShowClassic] = useState(false)
  const [pending, setPending] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [phase, setPhase] = useState<"form" | "success" | "partial">("form")

  const uploader = usePhotoUploads()
  const submissionIdRef = useRef<string>("")
  // Racine du configurateur : cible du repositionnement au changement d'étape.
  const rootRef = useRef<HTMLDivElement | null>(null)
  const didMountRef = useRef(false)

  // Point d'entrée déterministe, piloté par l'URL (`?prestation=<slug>`). Une
  // carte de la homepage présélectionne UNIQUEMENT la GRANDE FAMILLE (§4) :
  // jamais une prestation interne. Sans paramètre → écran des 6 familles (§3).
  useEffect(() => {
    function applyEntryFromUrl() {
      const params = new URLSearchParams(window.location.search)
      // Contexte « flotte » (bandeau professionnels) : on ouvre directement le
      // formulaire libre, là où atterrissent déjà les demandes flotte /
      // abonnement / hors-liste. Aucune donnée inventée, même Server Action.
      if (params.get("demande")?.trim() === "flotte") {
        setShowClassic(true)
      }
      const raw = params.get("prestation")?.trim()
      const familyKey = raw ? mainFamilyKeyForSlug(raw) : null
      if (!familyKey) {
        dispatch({ type: "init", familyKey: null, serviceKey: null, familyLocked: false, vehType: null })
        return
      }
      const mf = getMainFamily(familyKey)
      const single = (mf?.prestationKeys.length ?? 0) === 1
      dispatch({
        type: "init",
        familyKey,
        // Famille à prestation unique (dont Nettoyage) → le profil est résolu
        // d'office : le client enchaîne directement sur le parcours (véhicule
        // puis formule). Seule une famille à prestations multiples afficherait
        // un écran de choix de prestation intermédiaire.
        serviceKey: single ? (mf?.prestationKeys[0] ?? null) : null,
        familyLocked: true,
        vehType: familyKey === "moto" ? "Moto" : null,
      })
    }
    applyEntryFromUrl()
    window.addEventListener("popstate", applyEntryFromUrl)
    return () => window.removeEventListener("popstate", applyEntryFromUrl)
  }, [])

  const steps = computeSteps(s)
  const stepKey = steps[Math.min(s.i, Math.max(steps.length - 1, 0))] ?? "famille"
  const family = getFamily(s.serviceKey)
  const mainFamily = getMainFamily(s.familyKey)
  const totalUserSteps = steps.filter((k) => k !== "confirmation").length
  const humanStep = Math.min(s.i + 1, totalUserSteps)

  async function submit() {
    if (pending || !family) return
    setPending(true)
    setServerError(null)
    try {
      const description = serializeFlow({
        family,
        vehType: s.vehType,
        formulas: s.formulas,
        inspection: s.inspection,
        cleaningLevel: s.cleaningLevel,
        cleaningZone: s.cleaningZone,
        entretienFrequency: s.entretienFrequency,
        textileItems: s.textileItems,
        options: s.options,
        description: s.description,
        contextual: s.contextual,
        availability: s.avail,
        availabilityNote: s.availNote,
        photoCount: uploader.count,
      })

      const fd = new FormData()
      fd.set("typeKey", quoteTypeKey)
      fd.set("customerName", `${s.firstName} ${s.lastName}`.trim())
      fd.set("customerPhone", s.phone.trim())
      fd.set("customerEmail", s.email.trim())
      fd.set("customerType", s.customerType)
      if (s.customerType === "professionnel") fd.set("customerLegalRegistrationNumber", s.legalNumber.trim())
      fd.set("vehicleType", s.vehType?.trim() ?? "")
      fd.set("vehicleBrand", s.vehBrand.trim())
      fd.set("vehicleModel", s.vehModel.trim())
      fd.set("description", description)
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
      dispatch({ type: "next" }) // → écran de confirmation
    } catch {
      setServerError("Une erreur est survenue. Merci de réessayer.")
    } finally {
      setPending(false)
    }
  }

  // À CHAQUE vrai changement d'étape (Continuer / Continuer sans option /
  // retour / navigation / « Modifier » depuis le récap), repositionner le
  // viewport en haut du configurateur, juste sous le header sticky du site.
  // Déclenché uniquement par un changement de `stepKey` / `s.i` : une simple
  // (dé)sélection d'option ou de carte ne modifie pas ces valeurs, donc l'écran
  // ne remonte JAMAIS pour ces interactions. Le premier rendu est ignoré pour
  // ne pas « sauter » au chargement de la page.
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true
      return
    }
    const el = rootRef.current
    if (!el || typeof window === "undefined") return
    // Hauteur réelle du header fixe/sticky du site (repli 80px), pour que le
    // haut du configurateur apparaisse juste dessous avec un petit espace.
    let headerH = 0
    document.querySelectorAll("header").forEach((h) => {
      if (el.contains(h)) return // ignore le header interne du configurateur
      const pos = getComputedStyle(h).position
      if (pos === "fixed" || pos === "sticky") headerH = Math.max(headerH, h.getBoundingClientRect().height)
    })
    if (headerH === 0) headerH = 80
    const top = window.scrollY + el.getBoundingClientRect().top - headerH - 12
    window.scrollTo({ top: Math.max(top, 0), behavior: "smooth" })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey, s.i])

  /* ------------------------- Repli « Autre demande » ----------------------- */
  if (showClassic) {
    return (
      <div className={`${oswald.variable} rq-flow`}>
        <style>{css}</style>
        <div className="rq-phone">
          <button type="button" className="rq-textlink" onClick={() => setShowClassic(false)}>
            ‹ Revenir au configurateur
          </button>
          <div className="mt-4">
            {/* Formulaire libre historique : particulier / professionnel via audienceToggle. */}
            <CustomRequestForm types={types} audienceToggle />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div ref={rootRef} className={`${oswald.variable} rq-flow`}>
      <style>{css}</style>
      <div className="rq-phone">
        {stepKey === "confirmation" ? (
          <Confirmation phase={phase} dispatch={dispatch} onReset={() => { uploader.reset(); setPhase("form"); submissionIdRef.current = "" }} />
        ) : (
          <>
            <FlowHeader
              label={STEP_LABEL[stepKey] ?? "Prestation"}
              humanStep={humanStep}
              total={totalUserSteps}
              // L'écran des 6 familles est un choix d'entrée (§15) : aucun
              // « Étape X / Y » artificiel tant que le parcours n'a pas commencé.
              showCounter={stepKey !== "famille"}
              canBack={s.i > 0}
              onBack={() => dispatch({ type: "back" })}
            />
            {serverError && (
              <p role="alert" className="rq-alert">
                {serverError}
              </p>
            )}
            {phase === "partial" && (
              <p role="status" className="rq-alert rq-alert-warn">
                Votre demande a bien été enregistrée, mais certaines photos n&apos;ont pas pu être envoyées.
              </p>
            )}
            <div className="rq-scroll">
              <Step s={s} dispatch={dispatch} patch={patch} family={family} mainFamily={mainFamily} stepKey={stepKey} uploader={uploader} />
            </div>
            <FlowFooter
              s={s}
              dispatch={dispatch}
              stepKey={stepKey}
              family={family}
              pending={pending}
              onSubmit={submit}
              onClassic={() => setShowClassic(true)}
            />
          </>
        )}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  HEADER / FOOTER                                                           */
/* -------------------------------------------------------------------------- */

const STEP_LABEL: Record<string, string> = {
  famille: "Prestation",
  prestation: "Prestation",
  formules: "Formules",
  ppfzones: "Zones PPF",
  vehicule: "Véhicule",
  options: "Options",
  details: "Votre demande",
  photos: "Photos",
  dispos: "Disponibilités",
  coordonnees: "Coordonnées",
  recap: "Récapitulatif",
}

/**
 * Étapes à AUTO-NAVIGATION : SEULS les écrans « famille » et « prestation »
 * avancent au clic (leurs boutons dispatchent `chooseFamily` / `chooseService`,
 * qui font progresser le parcours). TOUTES les autres étapes — y compris les
 * formules à choix unique (PPF, entretien, rénovation de phares) — conservent
 * un bouton « Continuer » validé (§11) : sinon, comme ces boutons ne font que
 * mémoriser la sélection sans avancer, une sélection valide restait bloquée.
 */
function isAutoNavStep(stepKey: string): boolean {
  return stepKey === "famille" || stepKey === "prestation"
}

function FlowHeader({
  label,
  humanStep,
  total,
  showCounter,
  canBack,
  onBack,
}: {
  label: string
  humanStep: number
  total: number
  showCounter: boolean
  canBack: boolean
  onBack: () => void
}) {
  return (
    <header className="rq-head">
      <button className="rq-icon-btn" onClick={onBack} disabled={!canBack} aria-label="Précédent">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>
      <div className="rq-head-mid">
        {showCounter && (
          <span className="rq-head-step">
            Étape {humanStep} / {total}
          </span>
        )}
        <span className="rq-head-label">{label}</span>
      </div>
      <span aria-hidden="true" />
      <div className="rq-progress" aria-hidden="true">
        <span style={{ width: showCounter ? `${(humanStep / total) * 100}%` : "0%" }} />
      </div>
    </header>
  )
}

function FlowFooter({
  s,
  dispatch,
  stepKey,
  family,
  pending,
  onSubmit,
  onClassic,
}: {
  s: State
  dispatch: React.Dispatch<Action>
  stepKey: string
  family?: Family
  pending: boolean
  onSubmit: () => void
  onClassic: () => void
}) {
  // Écran de choix (famille / prestation) et étapes à choix unique : le clic
  // fait avancer, aucun bouton « Continuer » (§12). On conserve seulement le
  // repli « Autre demande » sur l'écran des familles.
  const autoNav = isAutoNavStep(stepKey)
  const isRecap = stepKey === "recap"
  const disabled = pending || !canContinue(s, stepKey, family)
  const primaryLabel = isRecap
    ? pending
      ? "Envoi en cours…"
      : "Envoyer ma demande"
    : s.fromSummary
      ? "Enregistrer"
      : "Continuer"
  const showSkip = stepKey === "options" && s.options.length === 0
  // Étapes obligatoires : indication claire tant qu'un champ requis manque.
  const hint = pending || autoNav ? null : requiredHint(s, stepKey, family)

  return (
    <footer className="rq-foot">
      {hint && (
        <p className="rq-reqhint" role="status">
          {hint}
        </p>
      )}
      {!autoNav && (
        <button className="rq-btn rq-btn-pink" disabled={disabled} onClick={() => (isRecap ? onSubmit() : dispatch({ type: "next" }))}>
          {showSkip ? "Continuer sans option" : primaryLabel}
        </button>
      )}
      {isRecap && <p className="rq-foot-legal">Aucun paiement. Spirit ACS étudie votre demande avant toute confirmation.</p>}
      {stepKey === "famille" && (
        <button type="button" className="rq-textlink rq-foot-alt" onClick={onClassic}>
          Autre demande (flotte, abonnement, besoin spécifique) ›
        </button>
      )}
    </footer>
  )
}

/**
 * Validation par étape. Les questions OBLIGATOIRES du cahier des charges sont
 * 2 (formules), 3 (véhicule / textile), 5 (votre demande), 7 (disponibilités)
 * et 8 (coordonnées) : on empêche d'avancer tant qu'elles ne sont pas remplies.
 * Les étapes 4 (options) et 6 (photos) restent facultatives.
 */
function canContinue(s: State, stepKey: string, family?: Family): boolean {
  switch (stepKey) {
    case "famille":
      return s.familyKey != null
    case "prestation":
      return s.serviceKey != null
    case "formules": // Q2
      // Formule combinée (§8) : le périmètre « les-deux » suffit (aucun niveau).
      if (family?.kind === "nettoyage")
        return s.cleaningZone === "les-deux" || (s.cleaningZone != null && s.cleaningLevel != null)
      if (family?.kind === "entretien") return s.entretienFrequency != null
      if (family?.kind === "textile") return s.textileItems.length > 0
      if (family?.key === "ppf-personnalisation") return s.ppfBranch != null
      if (family?.kind === "formulas") return s.inspection || Object.keys(s.formulas).length > 0
      return true // « devis » (moteur & échappement) : pas de formule à choisir
    case "ppfzones":
      // Multi-sélection ; « Je ne sais pas » permet toujours de continuer (§9).
      return s.contextual.length > 0
    case "vehicule": // Q3
      return s.vehType != null
    case "details": // Q5
      return s.description.trim().length > 0 || s.contextual.length > 0
    case "dispos": // Q7
      return s.avail.length > 0 || s.availNote.trim().length > 0
    case "coordonnees": { // Q8
      const base = s.firstName.trim() && s.lastName.trim() && /\S+@\S+\.\S+/.test(s.email) && s.phone.trim()
      const pro = s.customerType === "professionnel" ? s.legalNumber.trim().length > 0 : true
      return Boolean(base && pro)
    }
    default:
      return true
  }
}

/** Message d'aide affiché tant qu'une étape obligatoire n'est pas complète. */
function requiredHint(s: State, stepKey: string, family?: Family): string | null {
  if (canContinue(s, stepKey, family)) return null
  switch (stepKey) {
    case "prestation":
      return "Sélectionnez une prestation pour continuer."
    case "formules":
      if (family?.kind === "nettoyage") return "Choisissez le périmètre et la formule pour continuer."
      if (family?.kind === "textile") return "Choisissez au moins un élément à nettoyer pour continuer."
      if (family?.key === "ppf-personnalisation") return "Choisissez PPF ou personnalisation pour continuer."
      return "Choisissez une formule (ou laissez Spirit ACS décider après inspection)."
    case "ppfzones":
      return "Sélectionnez au moins une zone (ou « Je ne sais pas ») pour continuer."
    case "vehicule":
      return "Sélectionnez le type de véhicule pour continuer."
    case "details":
      return "Décrivez votre demande pour continuer."
    case "dispos":
      return "Indiquez au moins une disponibilité pour continuer."
    case "coordonnees":
      return "Renseignez vos coordonnées (nom, téléphone et email valides)."
    default:
      return null
  }
}

/* -------------------------------------------------------------------------- */
/*  STEP ROUTER                                                               */
/* -------------------------------------------------------------------------- */

function Step({
  s,
  dispatch,
  patch,
  family,
  mainFamily,
  stepKey,
  uploader,
}: {
  s: State
  dispatch: React.Dispatch<Action>
  patch: (p: Partial<State>) => void
  family?: Family
  mainFamily?: ReturnType<typeof getMainFamily>
  stepKey: string
  uploader: UsePhotoUploads
}) {
  switch (stepKey) {
    case "famille":
      return <FamilleStep s={s} dispatch={dispatch} />
    case "prestation":
      return <PrestationSousStep s={s} dispatch={dispatch} mainFamily={mainFamily} />
    case "formules":
      return <FormulesStep s={s} patch={patch} dispatch={dispatch} family={family} />
    case "ppfzones":
      return <PpfZonesStep s={s} dispatch={dispatch} family={family} />
    case "vehicule":
      return <VehiculeStep s={s} patch={patch} family={family} />
    case "options":
      return <OptionsStep s={s} dispatch={dispatch} family={family} />
    case "details":
      return <DetailsStep s={s} dispatch={dispatch} patch={patch} family={family} />
    case "photos":
      return <PhotosStep uploader={uploader} family={family} />
    case "dispos":
      return <DisposStep s={s} dispatch={dispatch} patch={patch} />
    case "coordonnees":
      return <CoordonneesStep s={s} patch={patch} />
    case "recap":
      return <RecapStep s={s} dispatch={dispatch} family={family} mainFamily={mainFamily} uploader={uploader} />
    default:
      return null
  }
}

function StepIntro({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="rq-intro">
      <h2 className="rq-title rq-h2">{title}</h2>
      {sub && <p className="rq-sub">{sub}</p>}
    </div>
  )
}

/** NIVEAU 1 — écran des 6 grandes familles. Clic = famille + avance (§3). */
function FamilleStep({ s, dispatch }: { s: State; dispatch: React.Dispatch<Action> }) {
  return (
    <section>
      <StepIntro title="Choisissez votre prestation" sub="Sélectionnez la famille correspondant à votre besoin." />
      <div className="rq-cards">
        {MAIN_FAMILIES.map((f) => {
          const active = s.familyKey === f.key
          return (
            <button
              key={f.key}
              className={`rq-card${active ? " is-active" : ""}`}
              onClick={() => dispatch({ type: "chooseFamily", familyKey: f.key })}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.image || "/placeholder.svg"} alt={f.alt} className="rq-card-img" />
              <span className="rq-card-veil" />
              <span className="rq-card-body">
                <span className="rq-card-title">{f.title}</span>
                <span className="rq-card-price">{f.priceLabel}</span>
              </span>
              {active && (
                <span className="rq-card-check" aria-hidden="true">
                  ✓
                </span>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}

/** NIVEAU 2 — choix de la prestation d'une famille à branches multiples. */
function PrestationSousStep({
  s,
  dispatch,
  mainFamily,
}: {
  s: State
  dispatch: React.Dispatch<Action>
  mainFamily?: ReturnType<typeof getMainFamily>
}) {
  const prestations = prestationsForFamily(s.familyKey)
  return (
    <section>
      <StepIntro
        title={mainFamily?.title ?? "Prestation"}
        sub="Sélectionnez la prestation souhaitée dans cette famille."
      />
      <div className="rq-formulas">
        {prestations.map((p) => {
          const active = s.serviceKey === p.key
          return (
            <button
              key={p.key}
              className={`rq-formula${active ? " is-active" : ""}`}
              onClick={() => dispatch({ type: "chooseService", serviceKey: p.key })}
            >
              <span className="rq-formula-main">
                <span className="rq-formula-label">{PRESTATION_LABELS[p.key] ?? p.title}</span>
                <span className="rq-formula-note">{p.tagline}</span>
              </span>
              <span className="rq-formula-price">{p.priceLabel}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function FormulesStep({
  s,
  patch,
  dispatch,
  family,
}: {
  s: State
  patch: (p: Partial<State>) => void
  dispatch: React.Dispatch<Action>
  family?: Family
}) {
  // Accordéon « En savoir plus » des protections céramiques (§5) : un seul
  // ouvert à la fois. Déclaré avant tout retour anticipé (règle des hooks).
  const [openBlurb, setOpenBlurb] = useState<string | null>(null)
  if (!family) return null

  // PPF & personnalisation : deux branches distinctes (§9). Le choix pilote
  // les étapes suivantes — PPF → zones ; personnalisation → options — et
  // n'affiche JAMAIS les zones PPF pour une prestation de personnalisation.
  if (family.key === "ppf-personnalisation") {
    return <PpfBranchStep s={s} dispatch={dispatch} family={family} />
  }

  // Nettoyage textile : MULTI-sélection des éléments à traiter (§6).
  if (family.kind === "textile") {
    return <TextileFormulesStep s={s} dispatch={dispatch} family={family} />
  }

  return (
    <section>
      <StepIntro title={family.title} sub={family.tagline} />

      {/* L'encart « Ce qui est inclus » fait doublon pour le nettoyage : le
          détail complet est désormais affiché DANS chaque carte de formule
          (§2). On le conserve pour les autres familles dont les cartes ne
          répètent pas la liste. */}
      {family.kind !== "nettoyage" && (
        <div className="rq-included">
          <p className="rq-included-h">Ce qui est inclus</p>
          <ul>
            {family.included.map((it) => (
              <li key={it}>{it}</li>
            ))}
          </ul>
        </div>
      )}

      {family.kind === "nettoyage" ? (
        <NettoyageChooser s={s} patch={patch} />
      ) : family.kind === "entretien" ? (
        <EntretienChooser s={s} patch={patch} />
      ) : family.kind === "devis" ? (
        <div className="rq-devis-card">
          <span className="rq-devis-badge">Sur devis</span>
          <p>
            Cette prestation est établie sur devis, après étude de votre demande par Spirit ACS. Précisez les zones et
            options souhaitées aux étapes suivantes.
          </p>
        </div>
      ) : (
        family.formulaGroups.map((g, gi) => {
          // §4 : une protection céramique carrosserie (requiresPolish) ne peut
          // être choisie qu'après un polissage — niveau explicite (groupe 0) OU
          // « à déterminer après inspection ». Sinon elle reste verrouillée.
          const polishChosen = Boolean(s.formulas[0]) || s.inspection
          return (
            <div key={gi} className="rq-fgroup">
              {g.title && <p className="rq-fgroup-title">{g.title}</p>}
              {g.note && <p className="rq-fgroup-note">{g.note}</p>}
              <div className="rq-formulas">
                {g.formulas.map((f) => {
                  const active = s.formulas[gi] === f.label
                  const locked = Boolean(f.requiresPolish) && !polishChosen
                  const open = openBlurb === f.label
                  return (
                    <div key={f.label}>
                      <button
                        className={`rq-formula${active ? " is-active" : ""}${locked ? " is-locked" : ""}`}
                        disabled={locked}
                        aria-disabled={locked}
                        onClick={() => {
                          if (locked) return
                          const next = { ...s.formulas }
                          if (active) delete next[gi]
                          else next[gi] = f.label
                          if (gi === 0) {
                            // Choisir/retirer un niveau de polissage annule
                            // l'option « inspection » ; sans polissage, aucune
                            // céramique carrosserie ne peut subsister (§4).
                            if (!next[0]) delete next[1]
                            patch({ formulas: next, inspection: false })
                          } else {
                            patch({ formulas: next })
                          }
                        }}
                      >
                        <span className="rq-formula-main">
                          <span className="rq-formula-label">{f.label}</span>
                          {f.note && <span className="rq-formula-note">{f.note}</span>}
                          {locked && (
                            <span className="rq-formula-note rq-lock-note">
                              Sélectionnez d&apos;abord un niveau de polissage
                            </span>
                          )}
                        </span>
                        <span className="rq-formula-price">{priceText(f)}</span>
                      </button>
                      {f.blurb && (
                        <>
                          <button
                            type="button"
                            className="rq-more"
                            aria-expanded={open}
                            onClick={() => setOpenBlurb(open ? null : f.label)}
                          >
                            {open ? "Masquer" : "En savoir plus"}
                          </button>
                          {open && <p className="rq-more-panel">{f.blurb}</p>}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })
      )}

      {family.caveat && <p className="rq-caveat">{family.caveat}</p>}

      {family.kind === "formulas" && (
        <button
          className={`rq-softchoice${s.inspection ? " is-active" : ""}`}
          onClick={() => {
            // « Inspection » remplace le CHOIX DE NIVEAU (groupe 0) sans effacer
            // une éventuelle protection céramique déjà retenue (groupe 1).
            const next = { ...s.formulas }
            delete next[0]
            patch({ inspection: !s.inspection, formulas: next })
          }}
        >
          Laisser Spirit ACS déterminer la formule après inspection
        </button>
      )}
    </section>
  )
}

/** PPF : choix de branche (film PPF vs personnalisation). Clic → avance. */
function PpfBranchStep({
  s,
  dispatch,
  family,
}: {
  s: State
  dispatch: React.Dispatch<Action>
  family: Family
}) {
  const BRANCHES: { key: PpfBranch; label: string; note: string }[] = [
    { key: "ppf", label: "Film de protection (PPF)", note: "Protection transparente des zones exposées de la carrosserie" },
    { key: "personnalisation", label: "Personnalisation", note: "Étriers, passages de roues, dépose covering, destickage, céramique jantes 1 an…" },
  ]
  return (
    <section>
      <StepIntro title={family.title} sub="Quel type de prestation souhaitez-vous ?" />
      <div className="rq-formulas">
        {BRANCHES.map((b) => {
          const active = s.ppfBranch === b.key
          return (
            <button
              key={b.key}
              className={`rq-formula${active ? " is-active" : ""}`}
              // Le choix de branche réinitialise les sélections dépendantes pour
              // qu'aucune zone/option d'une autre branche ne subsiste.
              onClick={() => dispatch({ type: "patch", patch: { ppfBranch: b.key, contextual: [], options: [] } })}
            >
              <span className="rq-formula-main">
                <span className="rq-formula-label">{b.label}</span>
                <span className="rq-formula-note">{b.note}</span>
              </span>
              <span className="rq-formula-price">Sur devis</span>
            </button>
          )
        })}
      </div>
      <p className="rq-caveat">
        Les prestations PPF et de personnalisation sont établies sur devis, après étude de votre véhicule.
      </p>
    </section>
  )
}

const PPF_UNSURE = "Je ne sais pas / Je souhaite préciser mon besoin"

/**
 * Étape « Zones PPF » — affichée UNIQUEMENT quand la branche PPF est choisie
 * (§9). Multi-sélection → bouton « Continuer » (pas d'auto-navigation). Une
 * option « Je ne sais pas » évite tout blocage.
 */
function PpfZonesStep({ s, dispatch, family }: { s: State; dispatch: React.Dispatch<Action>; family?: Family }) {
  const zones = family?.contextual?.choices ?? []
  const choices = [...zones, PPF_UNSURE]
  return (
    <section>
      <StepIntro title="Zones PPF souhaitées" sub="Sélectionnez une ou plusieurs zones à protéger." />
      <div className="rq-chips">
        {choices.map((z) => {
          const active = s.contextual.includes(z)
          return (
            <button
              key={z}
              className={`rq-chip${active ? " is-active" : ""}`}
              onClick={() => dispatch({ type: "toggle", field: "contextual", value: z, multi: true })}
            >
              {z}
            </button>
          )
        })}
      </div>
      <p className="rq-hint">Le devis PPF est établi après étude des zones et de l&apos;état de la carrosserie.</p>
    </section>
  )
}

/** Nettoyage textile — MULTI-sélection des éléments à traiter (§6). */
function TextileFormulesStep({ s, dispatch, family }: { s: State; dispatch: React.Dispatch<Action>; family: Family }) {
  return (
    <section>
      <StepIntro title={family.title} sub="Sélectionnez le ou les éléments à nettoyer." />

      <div className="rq-included">
        <p className="rq-included-h">Ce qui est inclus</p>
        <ul>
          {family.included.map((it) => (
            <li key={it}>{it}</li>
          ))}
        </ul>
      </div>

      <p className="rq-fgroup-title">Éléments à nettoyer</p>
      <p className="rq-fgroup-note">
        Vous pouvez sélectionner plusieurs éléments. Déplacement offert à moins de 10 km, puis 0,70 €/km au-delà.
      </p>
      <div className="rq-formulas">
        {family.formulaGroups
          .flatMap((g) => g.formulas)
          .map((f) => {
            const active = s.textileItems.includes(f.label)
            return (
              <button
                key={f.label}
                className={`rq-formula${active ? " is-active" : ""}`}
                onClick={() => dispatch({ type: "toggle", field: "textileItems", value: f.label, multi: true })}
              >
                <span className="rq-formula-main">
                  <span className="rq-formula-label">{f.label}</span>
                  {f.note && <span className="rq-formula-note">{f.note}</span>}
                </span>
                <span className="rq-formula-price">{priceText(f)}</span>
              </button>
            )
          })}
      </div>

      {family.caveat && <p className="rq-caveat">{family.caveat}</p>}
    </section>
  )
}

const CLEANING_ZONES: CleaningZone[] = ["interieur", "exterieur", "les-deux"]
const CLEANING_LEVELS: CleaningLevel[] = ["indispensable", "comme-neuf"]

/** Liste d'opérations détaillées d'une carte formule (réutilise CLEANING_DETAILS). */
function PackList({ items }: { items: string[] }) {
  return (
    <ul className="rq-pack-list">
      {items.map((it) => (
        <li key={it}>{it}</li>
      ))}
    </ul>
  )
}

/** Prix affiché d'une formule nettoyage : exact selon le gabarit, sinon « dès ». */
function cleaningPriceLabel(zone: CleaningZone, level: CleaningLevel, vehType: string | null, floorCents: number): string {
  const vk = cleaningVehicleKey(vehType)
  return vk ? euros(cleaningBaseCents(zone, level, vk)) : `dès ${euros(floorCents)}`
}

function NettoyageChooser({ s, patch }: { s: State; patch: (p: Partial<State>) => void }) {
  // §4 : une sélection est active PAR DÉFAUT (« Intérieur ») pour ne jamais
  // afficher un écran vide en arrivant sur l'étape. On persiste ce défaut dans
  // l'état (barre de progression / récap cohérents) tout en l'appliquant dès le
  // premier rendu via le repli ci-dessous — aucun clic n'est nécessaire.
  const zone: CleaningZone = s.cleaningZone ?? "interieur"
  useEffect(() => {
    if (s.cleaningZone == null) patch({ cleaningZone: "interieur" })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.cleaningZone])
  return (
    <div className="rq-fgroup">
      <p className="rq-fgroup-title">Que souhaitez-vous nettoyer ?</p>
      <div className="rq-seg rq-seg-3">
        {CLEANING_ZONES.map((z) => (
          <button
            key={z}
            className={`rq-seg-btn${zone === z ? " is-active" : ""}`}
            // Changer de périmètre réinitialise le niveau : la formule combinée
            // n'a pas de niveau à choisir (§8).
            onClick={() => patch({ cleaningZone: z, cleaningLevel: null })}
          >
            {CLEANING_ZONE_LABEL[z]}
          </button>
        ))}
      </div>

      {zone === "les-deux" ? (
        // §8 : UNE seule formule combinée (Intérieur comme neuf + Extérieur
        // indispensable). Aucun choix Indispensable / Comme neuf ici.
        <>
          <p className="rq-fgroup-title" style={{ marginTop: 16 }}>
            Votre formule
          </p>
          <div className="rq-packs">
            <div className="rq-pack is-active is-static">
              <div className="rq-pack-head">
                <span className="rq-pack-title">Intérieur + Extérieur complet</span>
                <span className="rq-pack-price">
                  {cleaningPriceLabel("les-deux", "comme-neuf", s.vehType, CLEANING_COMBO_FLOOR)}
                </span>
              </div>
              <p className="rq-pack-sub">Intérieur « Comme neuf » + Extérieur « Indispensable »</p>
              <p className="rq-pack-group">Intérieur</p>
              <PackList items={CLEANING_DETAILS.interieur["comme-neuf"]} />
              <p className="rq-pack-group">Extérieur</p>
              <PackList items={CLEANING_DETAILS.exterieur.indispensable} />
            </div>
          </div>
        </>
      ) : zone ? (
        <>
          <p className="rq-fgroup-title" style={{ marginTop: 16 }}>
            Choisissez votre formule
          </p>
          <div className="rq-packs">
            {CLEANING_LEVELS.map((lvl) => {
              const active = s.cleaningLevel === lvl
              // Plancher « dès » (citadine) tant que le gabarit n'est pas résolu.
              const floor = cleaningBaseCents(zone, lvl, "citadine")
              return (
                <button
                  key={lvl}
                  className={`rq-pack${active ? " is-active" : ""}`}
                  aria-pressed={active}
                  onClick={() => patch({ cleaningLevel: lvl })}
                >
                  <span className="rq-pack-head">
                    <span className="rq-pack-title">{CLEANING_LEVEL_LABEL[lvl]}</span>
                    <span className="rq-pack-price">{cleaningPriceLabel(zone, lvl, s.vehType, floor)}</span>
                  </span>
                  <span className="rq-pack-sub">
                    {lvl === "indispensable" ? "Nettoyage soigné et complet" : "Remise en état la plus poussée"}
                  </span>
                  <PackList items={CLEANING_DETAILS[zone as "interieur" | "exterieur"][lvl]} />
                  {active && (
                    <span className="rq-pack-check" aria-hidden="true">
                      ✓
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </>
      ) : null}
    </div>
  )
}

const ENTRETIEN_FREQS: EntretienFrequency[] = ["mensuel", "trimestriel"]

function EntretienChooser({ s, patch }: { s: State; patch: (p: Partial<State>) => void }) {
  return (
    <div className="rq-fgroup">
      <p className="rq-fgroup-title">Fréquence d&apos;entretien</p>
      <p className="rq-fgroup-note">Le tarif exact dépend du type de véhicule (indiqué à l&apos;étape suivante).</p>
      <div className="rq-formulas">
        {ENTRETIEN_FREQS.map((f) => {
          const active = s.entretienFrequency === f
          return (
            <button
              key={f}
              className={`rq-formula${active ? " is-active" : ""}`}
              onClick={() => patch({ entretienFrequency: f })}
            >
              <span className="rq-formula-main">
                <span className="rq-formula-label">{ENTRETIEN_FREQUENCY_LABEL[f]}</span>
                <span className="rq-formula-note">
                  {f === "mensuel" ? "Une intervention par mois" : "Une intervention par trimestre"}
                </span>
              </span>
              <span className="rq-formula-price">dès {euros(ENTRETIEN_FLOOR[f])}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function VehiculeStep({ s, patch, family }: { s: State; patch: (p: Partial<State>) => void; family?: Family }) {
  // §10/§13 : la liste des types dépend de la famille — le parcours moto ne
  // propose que « Moto », les parcours auto proposent les 6 gabarits.
  const vehicleTypes = vehicleTypesForFamily(family?.key)
  return (
    <section>
      <StepIntro title="Votre véhicule" sub="Sélectionnez le type, puis indiquez la marque et le modèle." />
      <div className="rq-types">
        {vehicleTypes.map((t) => {
          const active = s.vehType === t
          return (
            <button key={t} className={`rq-type${active ? " is-active" : ""}`} onClick={() => patch({ vehType: t })}>
              <span className="rq-type-ic" aria-hidden="true">
                <VehicleIcon type={t} />
              </span>
              <span className="rq-type-label">{t}</span>
            </button>
          )
        })}
      </div>

      <div className="rq-field">
        <label htmlFor="veh-brand">Marque</label>
        <input
          id="veh-brand"
          type="text"
          autoComplete="off"
          placeholder="Ex. Peugeot, BMW, Yamaha…"
          value={s.vehBrand}
          onChange={(e) => patch({ vehBrand: e.target.value })}
        />
      </div>
      <div className="rq-field">
        <label htmlFor="veh-model">Modèle</label>
        <input
          id="veh-model"
          type="text"
          autoComplete="off"
          placeholder="Ex. 308, Série 3, MT-07…"
          value={s.vehModel}
          onChange={(e) => patch({ vehModel: e.target.value })}
        />
      </div>
      <p className="rq-hint">Marque et modèle en saisie libre — aucune liste imposée.</p>
    </section>
  )
}

function OptionsStep({ s, dispatch, family }: { s: State; dispatch: React.Dispatch<Action>; family?: Family }) {
  // §9 : n'afficher que les options COHÉRENTES avec le périmètre nettoyage
  // choisi. Une option « intérieur »/« extérieur » n'apparaît que pour ce
  // périmètre (ou la formule complète) ; sans `scope` elle est toujours
  // proposée. Les autres familles affichent toutes leurs options.
  // De plus, une prestation DÉJÀ INCLUSE dans la formule choisie n'est jamais
  // reproposée en upsell (ex. rénovation d'échappement dans Extérieur « Comme
  // neuf ») : filtre piloté par identifiant, cf. includedCleaningOptionIds.
  const includedIds =
    family?.kind === "nettoyage" ? includedCleaningOptionIds(s.cleaningZone, s.cleaningLevel) : []
  const visible = !family
    ? []
    : family.kind === "nettoyage"
      ? family.options.filter((o) => {
          if (includedIds.includes(o.id)) return false
          if (!o.scope) return true
          return s.cleaningZone === "les-deux" || s.cleaningZone === o.scope
        })
      : family.options

  // Purge des options sélectionnées devenues invisibles (périmètre/formule
  // modifiés en revenant en arrière) : garantit qu'aucune option masquée ou
  // déjà incluse n'est comptée dans l'estimation ni le récapitulatif.
  useEffect(() => {
    if (!family) return
    const allowed = new Set(visible.map((o) => o.id))
    if (s.options.some((id) => !allowed.has(id))) {
      dispatch({ type: "patch", patch: { options: s.options.filter((id) => allowed.has(id)) } })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.cleaningZone, s.cleaningLevel, s.options, family])

  if (!family) return null

  if (visible.length === 0) {
    return (
      <section>
        <StepIntro title="Options complémentaires" sub="Aucune option pour cette prestation. Vous pouvez continuer." />
      </section>
    )
  }

  // §3 : l'option « Nettoyage intérieur » du polissage est chiffrée selon le
  // gabarit sélectionné (jamais un prix générique).
  const priceFor = (o: (typeof visible)[number]): string => {
    if (o.id === "nettoyage-interieur") {
      const cents = interiorAddonCentsFor(s.vehType)
      return cents == null ? "Sur devis" : euros(cents)
    }
    return o.price
  }

  return (
    <section>
      <StepIntro title="Complétez votre prestation" sub="Facultatif — ajoutez une option pertinente, ou continuez." />
      <div className="rq-opts">
        {visible.map((o) => {
          const active = s.options.includes(o.id)
          return (
            <button
              key={o.id}
              className={`rq-opt${active ? " is-active" : ""}`}
              onClick={() => dispatch({ type: "toggle", field: "options", value: o.id })}
            >
              <span className="rq-opt-check" aria-hidden="true">
                {active ? "✓" : "+"}
              </span>
              <span className="rq-opt-main">
                <span className="rq-opt-label">{o.label}</span>
                <span className="rq-opt-benefit">{o.benefit}</span>
              </span>
              <span className="rq-opt-price">{priceFor(o)}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function DetailsStep({
  s,
  dispatch,
  patch,
  family,
}: {
  s: State
  dispatch: React.Dispatch<Action>
  patch: (p: Partial<State>) => void
  family?: Family
}) {
  // Les zones PPF ont leur propre étape conditionnelle (branche PPF uniquement)
  // et ne doivent jamais réapparaître ici — surtout pas pour la personnalisation.
  const ctx = family?.key === "ppf-personnalisation" ? undefined : family?.contextual
  return (
    <section>
      <StepIntro title="Précisez votre demande" sub="Quelques éléments utiles à Spirit ACS pour étudier votre besoin." />
      {ctx && (
        <div className="rq-ctx">
          <p className="rq-ctx-q">{ctx.question}</p>
          <div className="rq-chips">
            {ctx.choices.map((c) => {
              const active = s.contextual.includes(c)
              return (
                <button
                  key={c}
                  className={`rq-chip${active ? " is-active" : ""}`}
                  onClick={() => dispatch({ type: "toggle", field: "contextual", value: c, multi: ctx.multi ?? false })}
                >
                  {c}
                </button>
              )
            })}
          </div>
        </div>
      )}
      <div className="rq-field">
        <label htmlFor="desc">Décrivez votre besoin</label>
        <textarea
          id="desc"
          rows={5}
          placeholder="État du véhicule, résultat recherché, éléments particuliers…"
          value={s.description}
          onChange={(e) => patch({ description: e.target.value })}
        />
      </div>
    </section>
  )
}

function PhotosStep({ uploader, family }: { uploader: UsePhotoUploads; family?: Family }) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const { items, addFiles, removeItem, count } = uploader

  // §17 : pour le nettoyage textile, on demande des photos DU TEXTILE (canapé,
  // fauteuil, chaise…), jamais du véhicule.
  const isTextile = family?.kind === "textile"
  const title = isTextile ? "Ajoutez des photos du textile" : "Ajoutez des photos de votre véhicule"
  const sub = isTextile
    ? "Facultatif — photos du canapé, fauteuil, chaise ou autre textile concerné."
    : "Facultatif — elles aident Spirit ACS à mieux comprendre votre demande."

  return (
    <section>
      <StepIntro title={title} sub={sub} />

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) addFiles(e.target.files)
          e.target.value = ""
        }}
      />

      {items.length === 0 ? (
        <button className="rq-drop" onClick={() => inputRef.current?.click()}>
          <span className="rq-drop-ic" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <circle cx="9" cy="10" r="1.6" />
              <path d="M21 16l-5-5-9 8" />
            </svg>
          </span>
          <span className="rq-drop-t">Ajouter des photos</span>
          <span className="rq-drop-s">JPEG, PNG, HEIC — {MAX_PHOTOS} photos max.</span>
        </button>
      ) : (
        <>
          <div className="rq-photos">
            {items.map((p) => (
              <div key={p.id} className={`rq-photo${p.status === "error" ? " is-error" : ""}`}>
                {p.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.previewUrl || "/placeholder.svg"} alt={p.name} />
                ) : (
                  <span className="rq-photo-err">{p.status === "error" ? "!" : "HEIC"}</span>
                )}
                {p.status === "error" && p.error && <span className="rq-photo-msg">{p.error}</span>}
                <button className="rq-photo-x" onClick={() => removeItem(p.id)} aria-label="Supprimer">
                  ×
                </button>
              </div>
            ))}
            {count < MAX_PHOTOS && (
              <button className="rq-photo-add" onClick={() => inputRef.current?.click()} aria-label="Ajouter">
                +
              </button>
            )}
          </div>
          <p className="rq-hint">
            {count} photo(s) — {MAX_PHOTOS} max.
          </p>
        </>
      )}
    </section>
  )
}

function DisposStep({
  s,
  dispatch,
  patch,
}: {
  s: State
  dispatch: React.Dispatch<Action>
  patch: (p: Partial<State>) => void
}) {
  return (
    <section>
      <StepIntro title="Choisissez vos disponibilités" sub="Indiquez les créneaux qui vous conviennent." />
      <div className="rq-banner">
        Ces créneaux ne sont pas confirmés. Spirit ACS vous proposera un rendez-vous après étude de votre demande.
      </div>
      <div className="rq-chips">
        {AVAILABILITY_CHOICES.map((c) => {
          const active = s.avail.includes(c)
          return (
            <button
              key={c}
              className={`rq-chip${active ? " is-active" : ""}`}
              onClick={() => dispatch({ type: "toggle", field: "avail", value: c })}
            >
              {c}
            </button>
          )
        })}
      </div>
      <div className="rq-field" style={{ marginTop: 14 }}>
        <label htmlFor="avail-note">Précisez si besoin</label>
        <textarea
          id="avail-note"
          rows={3}
          placeholder="Ex. plutôt en fin de journée, semaine prochaine…"
          value={s.availNote}
          onChange={(e) => patch({ availNote: e.target.value })}
        />
      </div>
    </section>
  )
}

function CoordonneesStep({ s, patch }: { s: State; patch: (p: Partial<State>) => void }) {
  return (
    <section>
      <StepIntro title="Vos coordonnées" sub="Pour que Spirit ACS puisse vous recontacter." />
      <div className="rq-seg">
        {(["particulier", "professionnel"] as const).map((t) => (
          <button
            key={t}
            className={`rq-seg-btn${s.customerType === t ? " is-active" : ""}`}
            onClick={() => patch({ customerType: t })}
          >
            {t === "particulier" ? "Particulier" : "Professionnel"}
          </button>
        ))}
      </div>

      <div className="rq-row">
        <div className="rq-field">
          <label htmlFor="fn">Prénom</label>
          <input id="fn" type="text" autoComplete="given-name" value={s.firstName} onChange={(e) => patch({ firstName: e.target.value })} />
        </div>
        <div className="rq-field">
          <label htmlFor="ln">Nom</label>
          <input id="ln" type="text" autoComplete="family-name" value={s.lastName} onChange={(e) => patch({ lastName: e.target.value })} />
        </div>
      </div>
      <div className="rq-field">
        <label htmlFor="tel">Téléphone</label>
        <input id="tel" type="tel" inputMode="tel" autoComplete="tel" value={s.phone} onChange={(e) => patch({ phone: e.target.value })} />
      </div>
      <div className="rq-field">
        <label htmlFor="mail">Email</label>
        <input id="mail" type="email" inputMode="email" autoComplete="email" value={s.email} onChange={(e) => patch({ email: e.target.value })} />
      </div>
      {s.customerType === "professionnel" && (
        <div className="rq-field">
          <label htmlFor="siret">SIREN / SIRET ou numéro BCE</label>
          <input id="siret" type="text" inputMode="numeric" value={s.legalNumber} onChange={(e) => patch({ legalNumber: e.target.value })} />
          <p className="rq-hint">SIREN ou SIRET en France, numéro BCE en Belgique.</p>
        </div>
      )}
    </section>
  )
}

function RecapStep({
  s,
  dispatch,
  family,
  mainFamily,
  uploader,
}: {
  s: State
  dispatch: React.Dispatch<Action>
  family?: Family
  mainFamily?: ReturnType<typeof getMainFamily>
  uploader: UsePhotoUploads
}) {
  const go = (key: string) => dispatch({ type: "goto", key, fromSummary: true })
  if (!family) return null

  const isPpf = family.key === "ppf-personnalisation"
  const optionLabels = family.options.filter((o) => s.options.includes(o.id)).map((o) => o.label)
  const est = computeEstimate({
    family,
    vehType: s.vehType,
    formulas: s.formulas,
    inspection: s.inspection,
    cleaningLevel: s.cleaningLevel,
    cleaningZone: s.cleaningZone,
    entretienFrequency: s.entretienFrequency,
    textileItems: s.textileItems,
    options: s.options,
  } as FlowSelection)

  const selectedByGroup =
    family.kind === "formulas"
      ? family.formulaGroups
          .map((g, gi) => {
            const label = s.formulas[gi]
            if (!label) return null
            const f = g.formulas.find((x) => x.label === label)
            return { group: g.title ?? "Formule", label, price: f ? priceText(f) : "" }
          })
          .filter((x): x is { group: string; label: string; price: string } => x !== null)
      : []

  const textileFlat = family.kind === "textile" ? family.formulaGroups.flatMap((g) => g.formulas) : []

  return (
    <section>
      <StepIntro title="Récapitulatif" sub="Vérifiez votre demande avant de l'envoyer. Chaque bloc reste modifiable." />

      <RecapBlock label="Prestation" onEdit={() => go(mainFamily && mainFamily.prestationKeys.length > 1 ? "prestation" : "formules")}>
        {mainFamily?.title ?? family.title}
      </RecapBlock>

      <RecapBlock label={isPpf ? "Prestation souhaitée" : "Formule"} onEdit={() => go("formules")}>
        {family.kind === "nettoyage" ? (
          s.cleaningZone === "les-deux" ? (
            "Intérieur + Extérieur complet"
          ) : s.cleaningZone && s.cleaningLevel ? (
            `${CLEANING_ZONE_LABEL[s.cleaningZone]} · ${CLEANING_LEVEL_LABEL[s.cleaningLevel]}`
          ) : (
            "Non précisée"
          )
        ) : family.kind === "entretien" ? (
          s.entretienFrequency ? ENTRETIEN_FREQUENCY_LABEL[s.entretienFrequency] : "Non précisée"
        ) : isPpf ? (
          s.ppfBranch === "ppf" ? "Film de protection (PPF) · Sur devis" : s.ppfBranch === "personnalisation" ? "Personnalisation · Sur devis" : "Non précisée"
        ) : family.kind === "devis" ? (
          "Sur devis"
        ) : family.kind === "textile" ? (
          s.textileItems.length ? (
            <div className="rq-recap-formulas">
              {s.textileItems.map((label) => {
                const f = textileFlat.find((x) => x.label === label)
                return (
                  <div key={label} className="rq-recap-formula">
                    <span className="rq-recap-fline">
                      <span>{label}</span>
                      <span className="rq-recap-fprice">{f ? priceText(f) : ""}</span>
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            "Non précisée"
          )
        ) : s.inspection ? (
          "À déterminer après inspection"
        ) : selectedByGroup.length ? (
          <div className="rq-recap-formulas">
            {selectedByGroup.map((r) => (
              <div key={r.group + r.label} className="rq-recap-formula">
                <span className="rq-recap-fgroup">{r.group}</span>
                <span className="rq-recap-fline">
                  <span>{r.label}</span>
                  <span className="rq-recap-fprice">{r.price}</span>
                </span>
              </div>
            ))}
          </div>
        ) : (
          "Non précisée"
        )}
      </RecapBlock>

      {isPpf && s.ppfBranch === "ppf" && (
        <RecapBlock label="Zones PPF" onEdit={() => go("ppfzones")}>
          {s.contextual.length ? s.contextual.join(", ") : "Non précisées"}
        </RecapBlock>
      )}

      {/* L'étape véhicule est retirée pour les prestations à prix fixe (textile,
          rénovation de phares) → pas de bloc « Véhicule » vide dans le récap. */}
      {!family.skipVehicle && (
        <RecapBlock label="Véhicule" onEdit={() => go("vehicule")}>
          {[s.vehType, s.vehBrand, s.vehModel].filter(Boolean).join(" · ") || "—"}
        </RecapBlock>
      )}

      {family.options.length > 0 && (!isPpf || s.ppfBranch === "personnalisation") && (
        <RecapBlock label={isPpf ? "Personnalisation" : "Options"} onEdit={() => go("options")}>
          {optionLabels.length ? optionLabels.join(", ") : "Aucune"}
        </RecapBlock>
      )}

      <RecapBlock label="Votre demande" onEdit={() => go("details")}>
        {[...(isPpf ? [] : s.contextual), s.description].filter(Boolean).join(" — ") || "—"}
      </RecapBlock>

      <RecapBlock label="Photos" onEdit={() => go("photos")}>
        {uploader.count ? `${uploader.count} photo(s)` : "Aucune"}
      </RecapBlock>

      <RecapBlock label="Disponibilités" onEdit={() => go("dispos")}>
        {[s.avail.join(", "), s.availNote].filter(Boolean).join(" — ") || "—"}
      </RecapBlock>

      <RecapBlock label="Coordonnées" onEdit={() => go("coordonnees")}>
        {`${s.firstName} ${s.lastName}`.trim() || "—"}
        {s.customerType === "professionnel" ? " · Professionnel" : ""}
        <br />
        <span className="rq-recap-sub">{[s.phone, s.email].filter(Boolean).join(" · ")}</span>
      </RecapBlock>

      {/* Estimation — total calculé + estimation partielle (jamais un devis ferme). */}
      <div className="rq-estimate">
        <div className="rq-estimate-head">
          <span className="rq-estimate-label">{est.partial ? "Estimation (à partir de)" : "Estimation"}</span>
          <span className="rq-estimate-total">{estimateHeadline(est)}</span>
        </div>
        {est.lines.length > 0 && (
          <ul className="rq-estimate-lines">
            {est.lines.map((l, idx) => (
              <li key={idx}>
                <span>{l.label}</span>
                <span>{l.value}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="rq-estimate-note">
          Montant indicatif à confirmer par Spirit ACS après étude de votre demande. Aucun paiement à cette étape.
        </p>
      </div>
    </section>
  )
}

function RecapBlock({ label, onEdit, children }: { label: string; onEdit?: () => void; children: React.ReactNode }) {
  return (
    <div className="rq-recap">
      <div className="rq-recap-top">
        <span className="rq-recap-label">{label}</span>
        {onEdit && (
          <button className="rq-recap-edit" onClick={onEdit}>
            Modifier
          </button>
        )}
      </div>
      <div className="rq-recap-val">{children}</div>
    </div>
  )
}

function Confirmation({
  phase,
  onReset,
}: {
  phase: "form" | "success" | "partial"
  dispatch: React.Dispatch<Action>
  onReset: () => void
}) {
  return (
    <div className="rq-confirm">
      <span className="rq-confirm-ic" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </span>
      <h2 className="rq-title rq-confirm-h">Votre demande a bien été envoyée</h2>
      <p className="rq-confirm-t">
        Merci. Spirit ACS va étudier votre demande et vous recontactera pour confirmer votre rendez-vous
        {phase === "partial" ? ". Certaines photos n'ont pas pu être envoyées, mais votre demande est bien enregistrée." : "."}
      </p>
      <p className="rq-confirm-meta">Réponse généralement sous 48 h ouvrées · Aucun paiement à ce stade.</p>
      <button className="rq-btn rq-btn-ghost" onClick={onReset}>
        Faire une autre demande
      </button>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  ICONS (silhouettes automobiles — aucun logo de marque)                     */
/* -------------------------------------------------------------------------- */

const ICON_SVG = {
  viewBox: "0 0 48 30",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
}

function CitadineIcon() {
  return (
    <svg {...ICON_SVG}>
      <path d="M7 23 L7 19 L10 17.5 L14.5 12.5 Q15.4 11.5 17 11.5 L25 11.5 Q26.6 11.5 27.6 12.8 L31 17.5 L40 18 L40 23" />
      <path d="M7 23 L9.1 23 A4.4 4.4 0 0 1 17.9 23 L29.1 23 A4.4 4.4 0 0 1 37.9 23 L40 23" />
      <circle cx="13.5" cy="23" r="3.3" />
      <circle cx="33.5" cy="23" r="3.3" />
    </svg>
  )
}

function BerlineIcon() {
  return (
    <svg {...ICON_SVG}>
      <path d="M4 23 L4 19.5 L9 17.5 L16 13.5 L28 13.5 L33 16.5 L38 17.8 L44 18 L44 23" />
      <path d="M4 23 L8.6 23 A4.4 4.4 0 0 1 17.4 23 L31.6 23 A4.4 4.4 0 0 1 40.4 23 L44 23" />
      <circle cx="13" cy="23" r="3.3" />
      <circle cx="36" cy="23" r="3.3" />
    </svg>
  )
}

function SuvIcon() {
  return (
    <svg {...ICON_SVG}>
      <path d="M6 22 L6 15 L9 13 L12.5 8.5 Q13.2 7.5 14.6 7.5 L31 7.5 Q32.5 7.5 33.5 9 L37 13 L42 14 L42 22" />
      <path d="M6 22 L9 22 A5 5 0 0 1 19 22 L29 22 A5 5 0 0 1 39 22 L42 22" />
      <circle cx="14" cy="22" r="3.8" />
      <circle cx="34" cy="22" r="3.8" />
    </svg>
  )
}

function MonospaceIcon() {
  return (
    <svg {...ICON_SVG}>
      <path d="M5 22.5 L5 18 L7 16.5 L14 8 Q14.6 7.2 16 7.2 L36 7.2 Q37.5 7.2 38 8.6 L41 13 L43 14 L43 22.5" />
      <path d="M5 22.5 L8.6 22.5 A4.4 4.4 0 0 1 17.4 22.5 L30.6 22.5 A4.4 4.4 0 0 1 39.4 22.5 L43 22.5" />
      <circle cx="13" cy="22.5" r="3.3" />
      <circle cx="35" cy="22.5" r="3.3" />
    </svg>
  )
}

function SportiveIcon() {
  // Silhouette sportive : très basse, pare-brise fortement incliné, capot long.
  return (
    <svg {...ICON_SVG}>
      <path d="M4 22 L5 18.5 L13 15.5 L20 11.5 Q22 10.4 25 10.6 L33 11.6 Q36 12 38 14 L44 17.5 L44 22" />
      <path d="M4 22 L8.2 22 A4.2 4.2 0 0 1 16.6 22 L31.4 22 A4.2 4.2 0 0 1 39.8 22 L44 22" />
      <circle cx="12.4" cy="22" r="3.2" />
      <circle cx="35.6" cy="22" r="3.2" />
    </svg>
  )
}

function MotoIcon() {
  return (
    <svg {...ICON_SVG}>
      <circle cx="10" cy="20" r="4.2" />
      <circle cx="38" cy="20" r="4.2" />
      <path d="M10 20 L19 20 L23 12.5 L30 12.5" />
      <path d="M23 12.5 L27 20 L34 20" />
      <path d="M30 12.5 L34 9 L37.5 9.6" />
      <path d="M13.5 20 L17.5 13.5 L23 13.5" />
    </svg>
  )
}

const VEHICLE_ICONS: Record<string, () => React.ReactElement> = {
  Citadine: CitadineIcon,
  Berline: BerlineIcon,
  Sportive: SportiveIcon,
  SUV: SuvIcon,
  "Monospace 5 places": MonospaceIcon,
  "Monospace 7 places": MonospaceIcon,
  Moto: MotoIcon,
}

function VehicleIcon({ type }: { type: string }) {
  const Ic = VEHICLE_ICONS[type] ?? CitadineIcon
  return <Ic />
}

/* -------------------------------------------------------------------------- */
/*  CSS — reprend la maquette validée, adapté à l'intégration (pas de cadre    */
/*  « téléphone » plein écran : le parcours s'insère dans le panneau devis).   */
/* -------------------------------------------------------------------------- */

const css = `
.rq-flow{ width:100%; }
.rq-phone{
  --navy:#06131c; --navy2:#0e2b3b; --navy3:#123a4d;
  --teal:#17b3c9; --pink:#e51e7a; --pink2:#c4136a;
  --paper:#eef2f4; --fg:#f4f8fa; --muted:#9fb1bc; --line:rgba(255,255,255,.10);
  width:100%; color:var(--fg);
  font-family:var(--font-sans),system-ui,sans-serif;
  display:flex; flex-direction:column; position:relative;
  -webkit-font-smoothing:antialiased;
}
.rq-title{ font-family:var(--font-osw),"Oswald",system-ui,sans-serif; text-transform:uppercase; font-weight:700; line-height:1; letter-spacing:.01em; margin:0; }
.rq-eyebrow{ font-family:var(--font-osw),"Oswald",system-ui,sans-serif; text-transform:uppercase; letter-spacing:.2em; font-weight:600; font-size:11px; color:var(--teal); margin:0; }
.rq-h2{ font-size:24px; color:#fff; }
.rq-sub{ margin:8px 0 0; font-size:14px; line-height:1.5; color:var(--muted); }
.rq-hint{ margin:10px 0 0; font-size:12.5px; color:var(--muted); }
.rq-textlink{ background:none; border:none; color:var(--teal); font-size:13.5px; font-weight:600; cursor:pointer; padding:0; }
.rq-textlink:hover{ text-decoration:underline; }

/* BUTTONS */
.rq-btn{ display:flex; align-items:center; justify-content:center; width:100%; height:52px; border:none; border-radius:12px; font-family:var(--font-osw),"Oswald",sans-serif; text-transform:uppercase; letter-spacing:.06em; font-weight:600; font-size:15px; cursor:pointer; }
.rq-btn-pink{ background:var(--pink); color:#fff; box-shadow:0 12px 30px -14px rgba(229,30,122,.9); }
.rq-btn-pink:disabled{ opacity:.4; box-shadow:none; cursor:not-allowed; }
.rq-btn-ghost{ background:rgba(255,255,255,.06); color:var(--fg); border:1px solid rgba(23,179,201,.55); }

/* HEADER */
.rq-head{ display:grid; grid-template-columns:40px 1fr 40px; align-items:center; gap:8px; padding-bottom:12px; }
.rq-icon-btn{ width:40px; height:40px; border-radius:10px; background:rgba(255,255,255,.05); border:1px solid var(--line); color:var(--fg); display:flex; align-items:center; justify-content:center; cursor:pointer; }
.rq-icon-btn:disabled{ opacity:.3; cursor:not-allowed; }
.rq-icon-btn svg{ width:20px; height:20px; }
.rq-head-mid{ text-align:center; }
.rq-head-step{ display:block; font-size:11px; color:var(--teal); font-family:var(--font-osw),"Oswald",sans-serif; letter-spacing:.12em; text-transform:uppercase; }
.rq-head-label{ display:block; font-family:var(--font-osw),"Oswald",sans-serif; text-transform:uppercase; font-weight:600; font-size:14px; color:#fff; letter-spacing:.03em; }
.rq-progress{ grid-column:1 / -1; height:2px; margin-top:12px; background:rgba(255,255,255,.08); }
.rq-progress span{ display:block; height:100%; background:var(--teal); transition:width .3s ease; }

/* CONTENT + FOOTER */
.rq-scroll{ padding:20px 0 4px; }
.rq-intro{ margin-bottom:18px; }
.rq-foot{ padding:16px 0 0; margin-top:18px; border-top:1px solid var(--line); }
.rq-foot-legal{ margin:9px 0 0; font-size:11px; line-height:1.4; color:var(--muted); text-align:center; }
.rq-foot-alt{ display:block; width:100%; text-align:center; margin-top:12px; }
.rq-reqhint{ margin:0 0 10px; font-size:12px; line-height:1.4; color:var(--teal); text-align:center; }

/* ALERTS */
.rq-alert{ margin:0 0 12px; padding:11px 13px; border-radius:11px; font-size:13px; line-height:1.4; background:rgba(229,30,122,.1); border:1px solid rgba(229,30,122,.4); color:#f7c9dd; }
.rq-alert-warn{ background:rgba(230,160,30,.1); border-color:rgba(230,160,30,.4); color:#f2d49b; }

/* PRESTATION CARDS */
.rq-cards{ display:flex; flex-direction:column; gap:11px; }
.rq-card{ position:relative; border:1px solid var(--line); border-radius:14px; overflow:hidden; height:104px; background:none; cursor:pointer; padding:0; text-align:left; }
.rq-card.is-active{ border-color:var(--teal); box-shadow:0 0 0 1px var(--teal); }
.rq-card-img{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.rq-card-veil{ position:absolute; inset:0; background:linear-gradient(90deg, rgba(2,9,14,.86) 6%, rgba(2,9,14,.35) 62%, rgba(2,9,14,.15) 100%); }
.rq-card-body{ position:absolute; left:15px; bottom:0; top:0; z-index:2; display:flex; flex-direction:column; justify-content:center; gap:4px; right:52px; }
.rq-card-title{ font-family:var(--font-osw),"Oswald",sans-serif; text-transform:uppercase; font-weight:600; font-size:16px; line-height:1.05; color:#fff; }
.rq-card-price{ font-size:12.5px; font-weight:600; color:var(--teal); }
.rq-card-check{ position:absolute; top:12px; right:12px; z-index:3; width:24px; height:24px; border-radius:50%; background:var(--teal); color:var(--navy); font-size:14px; font-weight:700; display:flex; align-items:center; justify-content:center; }

/* INCLUDED / FORMULES */
.rq-included{ background:var(--navy2); border:1px solid var(--line); border-radius:12px; padding:14px 16px; margin-bottom:16px; }
.rq-included-h{ margin:0 0 8px; font-family:var(--font-osw),"Oswald",sans-serif; text-transform:uppercase; letter-spacing:.1em; font-size:11px; color:var(--teal); }
.rq-included ul{ margin:0; padding:0; list-style:none; display:flex; flex-direction:column; gap:7px; }
.rq-included li{ position:relative; padding-left:18px; font-size:13.5px; line-height:1.4; color:var(--paper); }
.rq-included li::before{ content:""; position:absolute; left:0; top:7px; width:7px; height:7px; border-radius:50%; background:var(--teal); }
.rq-fgroup{ margin-bottom:16px; }
.rq-fgroup-title{ margin:0 0 3px; font-family:var(--font-osw),"Oswald",sans-serif; text-transform:uppercase; font-weight:600; font-size:14px; color:#fff; letter-spacing:.04em; }
.rq-fgroup-note{ margin:0 0 10px; font-size:12px; color:var(--muted); }
.rq-formulas{ display:flex; flex-direction:column; gap:9px; }
.rq-formula{ display:flex; align-items:center; gap:12px; text-align:left; background:var(--navy2); border:1px solid var(--line); border-radius:12px; padding:13px 14px; cursor:pointer; }
.rq-formula.is-active{ border-color:var(--teal); box-shadow:0 0 0 1px var(--teal); background:var(--navy3); }
.rq-formula-main{ flex:1; display:flex; flex-direction:column; gap:3px; }
.rq-formula-label{ font-size:14px; font-weight:600; color:#fff; line-height:1.2; }
.rq-formula-note{ font-size:11.5px; color:var(--muted); line-height:1.35; }
.rq-formula-price{ flex:0 0 auto; font-family:var(--font-osw),"Oswald",sans-serif; font-weight:600; font-size:14px; color:var(--teal); white-space:nowrap; }
.rq-devis-card{ background:var(--navy2); border:1px solid var(--line); border-radius:12px; padding:16px; }
.rq-devis-badge{ display:inline-block; margin-bottom:8px; padding:4px 10px; border-radius:20px; background:rgba(23,179,201,.14); color:var(--teal); font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.08em; }
.rq-devis-card p{ margin:0; font-size:13.5px; line-height:1.5; color:var(--paper); }
.rq-caveat{ margin:14px 0 0; font-size:12.5px; line-height:1.5; color:var(--muted); padding:11px 13px; background:rgba(255,255,255,.03); border-left:2px solid var(--teal); border-radius:0 8px 8px 0; }
/* Protection céramique verrouillée tant qu'aucun polissage n'est choisi (§4). */
.rq-formula.is-locked{ opacity:.5; cursor:not-allowed; }
    .rq-formula.is-locked:hover{ border-color:var(--line); box-shadow:none; }
    .rq-lock-note{ color:var(--pink) !important; }

    /* Cartes comparatives de formules nettoyage (Indispensable / Comme neuf). */
    .rq-packs{ display:flex; flex-direction:column; gap:12px; margin-top:12px; }
    .rq-pack{ position:relative; display:block; width:100%; text-align:left; background:var(--navy2); border:1px solid var(--line); border-radius:14px; padding:15px 16px; cursor:pointer; }
    .rq-pack.is-active{ border-color:var(--teal); box-shadow:0 0 0 1px var(--teal); background:var(--navy3); }
    .rq-pack.is-static{ cursor:default; }
    .rq-pack-head{ display:flex; align-items:baseline; justify-content:space-between; gap:12px; }
    .rq-pack-title{ font-family:var(--font-osw),"Oswald",sans-serif; text-transform:uppercase; letter-spacing:.04em; font-size:16px; font-weight:700; color:#fff; }
    .rq-pack-price{ flex:0 0 auto; font-family:var(--font-osw),"Oswald",sans-serif; font-weight:700; font-size:17px; color:var(--teal); white-space:nowrap; }
    .rq-pack-sub{ margin:3px 0 10px; font-size:12px; color:var(--muted); }
    .rq-pack-group{ margin:12px 0 6px; font-family:var(--font-osw),"Oswald",sans-serif; text-transform:uppercase; letter-spacing:.1em; font-size:10.5px; color:var(--teal); }
    .rq-pack-list{ margin:0; padding:0; list-style:none; display:flex; flex-direction:column; gap:6px; }
    .rq-pack-list li{ position:relative; padding-left:18px; font-size:13px; line-height:1.4; color:var(--paper); }
    .rq-pack-list li::before{ content:""; position:absolute; left:0; top:6px; width:6px; height:6px; border-radius:50%; background:var(--teal); }
    .rq-pack-check{ position:absolute; top:13px; right:14px; display:none; }
    .rq-pack.is-active .rq-pack-check{ display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:50%; background:var(--teal); color:var(--navy); font-size:13px; font-weight:700; }
    .rq-pack.is-active .rq-pack-price{ margin-right:26px; }
/* Accordéon « En savoir plus » des protections céramiques (§5). */
.rq-more{ margin:6px 0 2px 2px; background:none; border:none; padding:0; color:var(--teal); font-size:12px; font-weight:600; cursor:pointer; }
.rq-more:hover{ text-decoration:underline; }
.rq-more-panel{ margin:2px 0 4px; padding:10px 12px; border-radius:9px; background:rgba(255,255,255,.03); border:1px solid var(--line); font-size:12.5px; line-height:1.5; color:var(--paper); }
.rq-softchoice{ margin-top:12px; width:100%; text-align:left; background:none; border:1px dashed var(--line); border-radius:12px; padding:13px 14px; color:var(--paper); font-size:13.5px; cursor:pointer; }
.rq-softchoice.is-active{ border-style:solid; border-color:var(--teal); color:#fff; }

/* VEHICLE TYPES */
.rq-types{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:9px; margin-bottom:20px; }
.rq-type{ display:flex; flex-direction:column; align-items:center; gap:7px; padding:14px 6px; background:var(--navy2); border:1px solid var(--line); border-radius:12px; cursor:pointer; color:var(--paper); }
.rq-type.is-active{ border-color:var(--teal); box-shadow:0 0 0 1px var(--teal); background:var(--navy3); color:#fff; }
.rq-type-ic{ color:var(--muted); display:flex; align-items:center; justify-content:center; height:30px; }
.rq-type.is-active .rq-type-ic{ color:var(--teal); }
.rq-type-ic svg{ width:46px; height:29px; }
.rq-type-label{ font-size:11.5px; font-weight:600; text-align:center; line-height:1.15; }

/* FIELDS */
.rq-field{ margin-bottom:14px; display:flex; flex-direction:column; }
.rq-field label{ margin-bottom:6px; font-size:12.5px; font-weight:600; color:var(--paper); }
.rq-field input, .rq-field textarea{ width:100%; background:var(--navy2); border:1px solid var(--line); border-radius:11px; padding:13px 14px; color:#fff; font-size:15px; font-family:inherit; -webkit-appearance:none; }
.rq-field input:focus, .rq-field textarea:focus{ outline:none; border-color:var(--teal); box-shadow:0 0 0 1px var(--teal); }
.rq-field textarea{ resize:vertical; line-height:1.5; }
.rq-field input::placeholder, .rq-field textarea::placeholder{ color:rgba(159,177,188,.6); }
.rq-row{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }

/* OPTIONS */
.rq-opts{ display:flex; flex-direction:column; gap:10px; }
.rq-opt{ display:flex; align-items:center; gap:12px; text-align:left; background:var(--navy2); border:1px solid var(--line); border-radius:12px; padding:13px 14px; cursor:pointer; }
.rq-opt.is-active{ border-color:var(--teal); box-shadow:0 0 0 1px var(--teal); background:var(--navy3); }
.rq-opt-check{ flex:0 0 auto; width:26px; height:26px; border-radius:50%; border:1px solid var(--teal); color:var(--teal); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:15px; }
.rq-opt.is-active .rq-opt-check{ background:var(--teal); color:var(--navy); }
.rq-opt-main{ flex:1; display:flex; flex-direction:column; gap:2px; }
.rq-opt-label{ font-size:14px; font-weight:600; color:#fff; }
.rq-opt-benefit{ font-size:12px; color:var(--muted); }
.rq-opt-price{ flex:0 0 auto; font-family:var(--font-osw),"Oswald",sans-serif; font-weight:600; font-size:13.5px; color:var(--teal); white-space:nowrap; }

/* CONTEXTUAL / CHIPS / BANNER */
.rq-ctx{ margin-bottom:18px; }
.rq-ctx-q{ margin:0 0 10px; font-size:13.5px; font-weight:600; color:var(--paper); }
.rq-chips{ display:flex; flex-wrap:wrap; gap:9px; }
.rq-chip{ padding:10px 15px; border-radius:22px; background:var(--navy2); border:1px solid var(--line); color:var(--paper); font-size:13.5px; cursor:pointer; }
.rq-chip.is-active{ border-color:var(--teal); background:rgba(23,179,201,.14); color:#fff; }
.rq-banner{ margin-bottom:16px; padding:12px 14px; border-radius:11px; background:rgba(23,179,201,.1); border:1px solid rgba(23,179,201,.3); color:var(--paper); font-size:12.5px; line-height:1.45; }

/* PHOTOS */
.rq-drop{ width:100%; display:flex; flex-direction:column; align-items:center; gap:6px; padding:34px 20px; background:var(--navy2); border:1.5px dashed rgba(255,255,255,.18); border-radius:14px; cursor:pointer; color:var(--fg); }
.rq-drop-ic{ color:var(--teal); }
.rq-drop-ic svg{ width:34px; height:34px; }
.rq-drop-t{ font-family:var(--font-osw),"Oswald",sans-serif; text-transform:uppercase; font-weight:600; font-size:15px; }
.rq-drop-s{ font-size:12px; color:var(--muted); }
.rq-photos{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:9px; }
.rq-photo{ position:relative; aspect-ratio:1; border-radius:11px; overflow:hidden; background:var(--navy2); border:1px solid var(--line); display:flex; align-items:center; justify-content:center; }
.rq-photo img{ width:100%; height:100%; object-fit:cover; }
.rq-photo.is-error{ border-color:var(--pink); }
.rq-photo-err{ color:var(--pink); font-size:20px; font-weight:700; }
.rq-photo-msg{ position:absolute; left:0; right:0; bottom:0; padding:4px 6px; background:rgba(196,19,106,.9); color:#fff; font-size:9.5px; line-height:1.2; text-align:center; }
.rq-photo-x{ position:absolute; top:5px; right:5px; width:22px; height:22px; border-radius:50%; background:rgba(2,9,14,.7); border:none; color:#fff; font-size:16px; line-height:1; cursor:pointer; display:flex; align-items:center; justify-content:center; }
.rq-photo-add{ aspect-ratio:1; border-radius:11px; background:var(--navy2); border:1.5px dashed rgba(255,255,255,.18); color:var(--teal); font-size:28px; cursor:pointer; }
@media (prefers-reduced-motion: reduce){ .rq-progress span{ transition:none; } }

/* SEGMENTED */
.rq-seg{ display:grid; grid-template-columns:1fr 1fr; gap:6px; padding:5px; background:var(--navy2); border:1px solid var(--line); border-radius:12px; margin-bottom:18px; }
.rq-seg-3{ grid-template-columns:1fr 1fr 1fr; margin-bottom:0; }
.rq-seg-btn{ height:40px; border-radius:9px; background:none; border:none; color:var(--muted); font-size:13.5px; font-weight:600; cursor:pointer; padding:0 4px; }
.rq-seg-btn.is-active{ background:var(--teal); color:var(--navy); }

/* RECAP */
.rq-recap{ border:1px solid var(--line); border-radius:12px; padding:13px 14px; margin-bottom:10px; background:var(--navy2); }
.rq-recap-top{ display:flex; align-items:center; justify-content:space-between; margin-bottom:5px; }
.rq-recap-label{ font-family:var(--font-osw),"Oswald",sans-serif; text-transform:uppercase; letter-spacing:.1em; font-size:11px; color:var(--teal); }
.rq-recap-edit{ background:none; border:none; color:var(--fg); font-size:12.5px; text-decoration:underline; cursor:pointer; padding:0; }
.rq-recap-val{ font-size:14px; line-height:1.45; color:#fff; }
.rq-recap-sub{ color:var(--muted); font-size:13px; }
.rq-recap-formulas{ display:flex; flex-direction:column; gap:11px; }
.rq-recap-formula{ display:flex; flex-direction:column; gap:2px; }
.rq-recap-fgroup{ font-family:var(--font-osw),"Oswald",sans-serif; text-transform:uppercase; letter-spacing:.08em; font-size:10.5px; color:var(--muted); }
.rq-recap-fline{ display:flex; align-items:baseline; justify-content:space-between; gap:12px; }
.rq-recap-fprice{ flex:0 0 auto; font-family:var(--font-osw),"Oswald",sans-serif; font-weight:600; color:var(--teal); white-space:nowrap; }

/* ESTIMATE */
.rq-estimate{ margin-top:6px; border:1px solid rgba(23,179,201,.35); border-radius:12px; padding:14px 15px; background:rgba(23,179,201,.06); }
.rq-estimate-head{ display:flex; align-items:baseline; justify-content:space-between; gap:12px; }
.rq-estimate-label{ font-family:var(--font-osw),"Oswald",sans-serif; text-transform:uppercase; letter-spacing:.08em; font-size:12px; color:var(--paper); }
.rq-estimate-total{ font-family:var(--font-osw),"Oswald",sans-serif; font-weight:700; font-size:22px; color:#fff; white-space:nowrap; }
.rq-estimate-lines{ list-style:none; margin:12px 0 0; padding:12px 0 0; border-top:1px solid var(--line); display:flex; flex-direction:column; gap:7px; }
.rq-estimate-lines li{ display:flex; align-items:baseline; justify-content:space-between; gap:12px; font-size:13px; color:var(--paper); }
.rq-estimate-lines li span:last-child{ color:var(--teal); font-weight:600; white-space:nowrap; }
.rq-estimate-note{ margin:12px 0 0; font-size:11.5px; line-height:1.45; color:var(--muted); }

/* CONFIRMATION */
.rq-confirm{ display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:40px 10px; gap:6px; }
.rq-confirm-ic{ width:74px; height:74px; border-radius:50%; background:rgba(23,179,201,.14); border:1px solid rgba(23,179,201,.4); color:var(--teal); display:flex; align-items:center; justify-content:center; margin-bottom:14px; }
.rq-confirm-ic svg{ width:36px; height:36px; }
.rq-confirm-h{ font-size:24px; color:#fff; }
.rq-confirm-t{ margin:10px 0 10px; font-size:14px; line-height:1.55; color:var(--paper); max-width:340px; }
.rq-confirm-meta{ margin:0 0 26px; font-size:12px; line-height:1.5; color:var(--muted); max-width:320px; }
`
