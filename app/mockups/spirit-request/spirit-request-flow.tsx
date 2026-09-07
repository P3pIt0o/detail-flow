"use client"

/**
 * PROTOTYPE INTERACTIF — Parcours de demande Spirit ACS (mobile-first).
 *
 * Objectif : valider le parcours AVANT toute intégration en production. Rien
 * n'est écrit en base ici ; le composant simule le comportement réel avec un
 * state React unique conservé lors des retours arrière (en production ce state
 * serait persisté en sessionStorage puis envoyé à `submitCustomRequest`).
 *
 * Fidélité / reproductibilité :
 *   - Véhicule = type (sélection visuelle) + marque + modèle en SAISIE LIBRE,
 *     exactement comme `custom_requests` aujourd'hui (aucun référentiel/logo).
 *   - Statut Particulier / Professionnel + SIREN/SIRET : champs réels du moteur.
 *   - Photos : facultatives, validées par le VRAI `screenSelectedFile` et
 *     plafonnées par `MAX_PHOTOS` du pipeline existant (grant HMAC en prod).
 *   - Disponibilités : préférences NON confirmées (Spirit ACS valide ensuite) ;
 *     se sérialisent dans `description` (aucune colonne créneau ajoutée).
 *   - Aucun Stripe, aucun paiement : conforme au parcours validé par Corentin.
 */

import { useMemo, useReducer, useRef } from "react"
import { Oswald } from "next/font/google"
import { MAX_PHOTOS, screenSelectedFile } from "@/lib/quote-photos/config"
import {
  AVAILABILITY_CHOICES,
  BASE,
  FAMILIES,
  type Family,
  getFamily,
  priceText,
  VEHICLE_TYPES,
} from "./data"

const oswald = Oswald({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-osw" })

/* -------------------------------------------------------------------------- */
/*  STATE                                                                     */
/* -------------------------------------------------------------------------- */

type PhotoItem = { id: string; name: string; url: string; status: "uploading" | "done" | "error"; error?: string }

type State = {
  launched: boolean
  entry: "catalog" | "service"
  i: number
  fromSummary: boolean
  serviceKey: string | null
  /** Formule choisie par groupe (index de groupe → label). Permet de choisir
   *  un niveau de polissage ET une céramique pour la famille regroupée. */
  formulas: Record<number, string>
  /** « Laisser Spirit ACS déterminer après inspection » (exclusif). */
  inspection: boolean
  vehType: string | null
  vehBrand: string
  vehModel: string
  options: string[]
  contextual: string[]
  description: string
  photos: PhotoItem[]
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
  launched: false,
  entry: "catalog",
  i: 0,
  fromSummary: false,
  serviceKey: null,
  formulas: {},
  inspection: false,
  vehType: null,
  vehBrand: "",
  vehModel: "",
  options: [],
  contextual: [],
  description: "",
  photos: [],
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
  | { type: "launch"; entry: "catalog" | "service"; serviceKey: string | null }
  | { type: "reset" }
  | { type: "patch"; patch: Partial<State> }
  | { type: "next" }
  | { type: "back" }
  | { type: "goto"; i: number; fromSummary?: boolean }
  | { type: "toggle"; field: "options" | "contextual" | "avail"; value: string; multi?: boolean }
  | { type: "photoStatus"; id: string; status: PhotoItem["status"] }

/** Étapes actives selon l'entrée (depuis une carte = pas d'étape prestation). */
function stepsFor(entry: State["entry"]): string[] {
  const base = ["formules", "vehicule", "options", "details", "photos", "dispos", "coordonnees", "recap", "confirmation"]
  return entry === "service" ? base : ["prestation", ...base]
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "launch":
      return { ...initialState, launched: true, entry: action.entry, serviceKey: action.serviceKey, i: 0 }
    case "reset":
      return initialState
    case "patch":
      return { ...state, ...action.patch }
    case "next": {
      const steps = stepsFor(state.entry)
      if (state.fromSummary) {
        const recapIdx = steps.indexOf("recap")
        return { ...state, i: recapIdx, fromSummary: false }
      }
      return { ...state, i: Math.min(state.i + 1, steps.length - 1) }
    }
    case "back":
      return { ...state, i: Math.max(state.i - 1, 0), fromSummary: false }
    case "goto":
      return { ...state, i: action.i, fromSummary: action.fromSummary ?? false }
    case "toggle": {
      const arr = state[action.field]
      if (action.multi === false) {
        return { ...state, [action.field]: arr.includes(action.value) ? [] : [action.value] }
      }
      const next = arr.includes(action.value) ? arr.filter((v) => v !== action.value) : [...arr, action.value]
      return { ...state, [action.field]: next }
    }
    case "photoStatus":
      return { ...state, photos: state.photos.map((p) => (p.id === action.id ? { ...p, status: action.status } : p)) }
    default:
      return state
  }
}

/* -------------------------------------------------------------------------- */
/*  COMPONENT                                                                 */
/* -------------------------------------------------------------------------- */

export default function SpiritRequestFlow() {
  const [s, dispatch] = useReducer(reducer, initialState)
  const patch = (p: Partial<State>) => dispatch({ type: "patch", patch: p })

  const steps = stepsFor(s.entry)
  const stepKey = steps[s.i]
  const family = getFamily(s.serviceKey)
  const totalUserSteps = steps.filter((k) => k !== "confirmation").length
  const humanStep = Math.min(s.i + 1, totalUserSteps)

  return (
    <div className={`${oswald.variable} rq-stage`}>
      <style>{css}</style>
      <div className="rq-phone">
        {!s.launched ? (
          <Launcher dispatch={dispatch} />
        ) : stepKey === "confirmation" ? (
          <Confirmation dispatch={dispatch} />
        ) : (
          <>
            <FlowHeader
              stepKey={stepKey}
              humanStep={humanStep}
              total={totalUserSteps}
              canBack={s.i > 0}
              onBack={() => dispatch({ type: "back" })}
              onExit={() => dispatch({ type: "reset" })}
            />
            <div className="rq-scroll">
              <Step s={s} dispatch={dispatch} patch={patch} family={family} stepKey={stepKey} />
            </div>
            <FlowFooter s={s} dispatch={dispatch} stepKey={stepKey} family={family} />
          </>
        )}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  LAUNCHER (outil de démo — pas un écran du site)                           */
/* -------------------------------------------------------------------------- */

function Launcher({ dispatch }: { dispatch: React.Dispatch<Action> }) {
  return (
    <div className="rq-launch">
      <p className="rq-eyebrow">Prototype interactif</p>
      <h1 className="rq-title rq-launch-h1">Parcours de demande</h1>
      <p className="rq-launch-note">
        Choisissez un point d&apos;entrée. Le state est conservé lors des retours arrière — vous pouvez tester le
        parcours de bout en bout.
      </p>

      <div className="rq-launch-block">
        <p className="rq-launch-label">Entrée A — depuis une carte prestation</p>
        <div className="rq-launch-grid">
          {FAMILIES.map((f) => (
            <button
              key={f.key}
              className="rq-launch-card"
              onClick={() => dispatch({ type: "launch", entry: "service", serviceKey: f.key })}
            >
              <img src={f.image || "/placeholder.svg"} alt={f.alt} />
              <span>{f.title}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="rq-launch-block">
        <p className="rq-launch-label">Entrée B — depuis le CTA global</p>
        <button className="rq-btn rq-btn-pink" onClick={() => dispatch({ type: "launch", entry: "catalog", serviceKey: null })}>
          Demander un devis
        </button>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  HEADER / FOOTER                                                           */
/* -------------------------------------------------------------------------- */

const STEP_LABEL: Record<string, string> = {
  prestation: "Prestation",
  formules: "Formules",
  vehicule: "Véhicule",
  options: "Options",
  details: "Votre demande",
  photos: "Photos",
  dispos: "Disponibilités",
  coordonnees: "Coordonnées",
  recap: "Récapitulatif",
}

function FlowHeader({
  stepKey,
  humanStep,
  total,
  canBack,
  onBack,
  onExit,
}: {
  stepKey: string
  humanStep: number
  total: number
  canBack: boolean
  onBack: () => void
  onExit: () => void
}) {
  return (
    <header className="rq-head">
      <button className="rq-icon-btn" onClick={onBack} disabled={!canBack} aria-label="Précédent">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>
      <div className="rq-head-mid">
        <span className="rq-head-step">
          Étape {humanStep} / {total}
        </span>
        <span className="rq-head-label">{STEP_LABEL[stepKey]}</span>
      </div>
      <button className="rq-demo-chip" onClick={onExit} aria-label="Quitter la démo">
        Démo
      </button>
      <div className="rq-progress" aria-hidden="true">
        <span style={{ width: `${(humanStep / total) * 100}%` }} />
      </div>
    </header>
  )
}

function FlowFooter({
  s,
  dispatch,
  stepKey,
  family,
}: {
  s: State
  dispatch: React.Dispatch<Action>
  stepKey: string
  family?: Family
}) {
  const disabled = !canContinue(s, stepKey, family)
  const isRecap = stepKey === "recap"
  const primaryLabel = isRecap ? "Envoyer ma demande" : s.fromSummary ? "Enregistrer" : "Continuer"
  const showSkip = stepKey === "options" && s.options.length === 0

  return (
    <footer className="rq-foot">
      <button
        className="rq-btn rq-btn-pink"
        disabled={disabled}
        onClick={() => dispatch({ type: "next" })}
      >
        {showSkip ? "Continuer sans option" : primaryLabel}
      </button>
      {isRecap && <p className="rq-foot-legal">Aucun paiement. Spirit ACS étudie votre demande avant toute confirmation.</p>}
    </footer>
  )
}

/** Validation minimale par étape (empêche d'avancer si champ requis manquant). */
function canContinue(s: State, stepKey: string, family?: Family): boolean {
  switch (stepKey) {
    case "prestation":
      return s.serviceKey != null
    case "vehicule":
      return s.vehType != null
    case "coordonnees": {
      const base = s.firstName.trim() && s.lastName.trim() && /\S+@\S+\.\S+/.test(s.email) && s.phone.trim()
      const pro = s.customerType === "professionnel" ? s.legalNumber.trim().length > 0 : true
      return Boolean(base && pro)
    }
    default:
      return true
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
  stepKey,
}: {
  s: State
  dispatch: React.Dispatch<Action>
  patch: (p: Partial<State>) => void
  family?: Family
  stepKey: string
}) {
  switch (stepKey) {
    case "prestation":
      return <PrestationStep s={s} dispatch={dispatch} />
    case "formules":
      return <FormulesStep s={s} patch={patch} family={family} />
    case "vehicule":
      return <VehiculeStep s={s} patch={patch} />
    case "options":
      return <OptionsStep s={s} dispatch={dispatch} family={family} />
    case "details":
      return <DetailsStep s={s} dispatch={dispatch} patch={patch} family={family} />
    case "photos":
      return <PhotosStep s={s} patch={patch} dispatch={dispatch} />
    case "dispos":
      return <DisposStep s={s} dispatch={dispatch} patch={patch} />
    case "coordonnees":
      return <CoordonneesStep s={s} patch={patch} />
    case "recap":
      return <RecapStep s={s} dispatch={dispatch} family={family} />
    default:
      return null
  }
}

/* -------------------------------------------------------------------------- */
/*  STEPS                                                                     */
/* -------------------------------------------------------------------------- */

function StepIntro({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="rq-intro">
      <h2 className="rq-title rq-h2">{title}</h2>
      {sub && <p className="rq-sub">{sub}</p>}
    </div>
  )
}

function PrestationStep({ s, dispatch }: { s: State; dispatch: React.Dispatch<Action> }) {
  return (
    <section>
      <StepIntro title="Sélectionnez votre prestation" sub="Découvrez ensuite les formules puis demandez votre devis." />
      <div className="rq-cards">
        {FAMILIES.map((f) => {
          const active = s.serviceKey === f.key
          return (
            <button
              key={f.key}
              className={`rq-card${active ? " is-active" : ""}`}
              onClick={() => dispatch({ type: "patch", patch: { serviceKey: f.key } })}
            >
              <img src={f.image || "/placeholder.svg"} alt={f.alt} className="rq-card-img" />
              <span className="rq-card-veil" />
              <span className="rq-card-body">
                <span className="rq-card-title">{f.title}</span>
                <span className="rq-card-price">{f.priceLabel}</span>
              </span>
              {active && <span className="rq-card-check" aria-hidden="true">✓</span>}
            </button>
          )
        })}
      </div>
    </section>
  )
}

function FormulesStep({ s, patch, family }: { s: State; patch: (p: Partial<State>) => void; family?: Family }) {
  if (!family) return null
  const onDevis = family.formulaGroups.length === 0
  return (
    <section>
      <StepIntro title={family.title} sub={family.tagline} />

      <div className="rq-included">
        <p className="rq-included-h">Ce qui est inclus</p>
        <ul>
          {family.included.map((it) => (
            <li key={it}>{it}</li>
          ))}
        </ul>
      </div>

      {onDevis ? (
        <div className="rq-devis-card">
          <span className="rq-devis-badge">Sur devis</span>
          <p>Cette prestation est établie sur devis, après étude de votre demande par Spirit ACS.</p>
        </div>
      ) : (
        family.formulaGroups.map((g, gi) => (
          <div key={gi} className="rq-fgroup">
            {g.title && <p className="rq-fgroup-title">{g.title}</p>}
            {g.note && <p className="rq-fgroup-note">{g.note}</p>}
            <div className="rq-formulas">
              {g.formulas.map((f) => {
                const active = s.formulas[gi] === f.label
                return (
                  <button
                    key={f.label}
                    className={`rq-formula${active ? " is-active" : ""}`}
                    onClick={() => {
                      const next = { ...s.formulas }
                      if (active) delete next[gi]
                      else next[gi] = f.label
                      patch({ formulas: next, inspection: false })
                    }}
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
          </div>
        ))
      )}

      {family.caveat && <p className="rq-caveat">{family.caveat}</p>}
      {!onDevis && (
        <button
          className={`rq-softchoice${s.inspection ? " is-active" : ""}`}
          onClick={() => patch({ inspection: !s.inspection, formulas: s.inspection ? s.formulas : {} })}
        >
          Laisser Spirit ACS déterminer la formule après inspection
        </button>
      )}
    </section>
  )
}

function VehiculeStep({ s, patch }: { s: State; patch: (p: Partial<State>) => void }) {
  return (
    <section>
      <StepIntro title="Votre véhicule" sub="Sélectionnez le type, puis indiquez la marque et le modèle." />
      <div className="rq-types">
        {VEHICLE_TYPES.map((t) => {
          const active = s.vehType === t
          const moto = t.startsWith("Moto")
          return (
            <button key={t} className={`rq-type${active ? " is-active" : ""}`} onClick={() => patch({ vehType: t })}>
              <span className="rq-type-ic" aria-hidden="true">
                {moto ? <MotoIcon /> : <CarIcon />}
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
  if (!family) return null
  if (family.options.length === 0) {
    return (
      <section>
        <StepIntro title="Options complémentaires" sub="Aucune option pour cette prestation. Vous pouvez continuer." />
      </section>
    )
  }
  return (
    <section>
      <StepIntro title="Complétez votre prestation" sub="Facultatif — ajoutez une option pertinente, ou continuez." />
      <div className="rq-opts">
        {family.options.map((o) => {
          const active = s.options.includes(o.id)
          return (
            <button
              key={o.id}
              className={`rq-opt${active ? " is-active" : ""}`}
              onClick={() => dispatch({ type: "toggle", field: "options", value: o.id })}
            >
              <span className="rq-opt-check" aria-hidden="true">{active ? "✓" : "+"}</span>
              <span className="rq-opt-main">
                <span className="rq-opt-label">{o.label}</span>
                <span className="rq-opt-benefit">{o.benefit}</span>
              </span>
              <span className="rq-opt-price">{o.price}</span>
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
  const ctx = family?.contextual
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

function PhotosStep({
  s,
  patch,
  dispatch,
}: {
  s: State
  patch: (p: Partial<State>) => void
  dispatch: React.Dispatch<Action>
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  const addFiles = (files: FileList | null) => {
    if (!files) return
    const room = MAX_PHOTOS - s.photos.length
    const chosen = Array.from(files).slice(0, Math.max(0, room))
    const next: PhotoItem[] = []
    for (const file of chosen) {
      // Validation par le VRAI filtre client du pipeline existant.
      const screen = screenSelectedFile({ name: file.name, type: file.type, size: file.size })
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      if (!screen.ok) {
        next.push({ id, name: file.name, url: "", status: "error", error: screen.reason })
      } else {
        next.push({ id, name: file.name, url: URL.createObjectURL(file), status: "uploading" })
      }
    }
    patch({ photos: [...s.photos, ...next] })
    // Simule la fin d'upload du pipeline réel (grant HMAC signé en production).
    next
      .filter((p) => p.status === "uploading")
      .forEach((p) => {
        setTimeout(() => dispatch({ type: "photoStatus", id: p.id, status: "done" }), 700)
      })
  }

  const remove = (id: string) => patch({ photos: s.photos.filter((p) => p.id !== id) })

  return (
    <section>
      <StepIntro title="Ajoutez des photos de votre véhicule" sub="Facultatif — elles aident Spirit ACS à mieux comprendre votre demande." />

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          addFiles(e.target.files)
          e.target.value = ""
        }}
      />

      {s.photos.length === 0 ? (
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
            {s.photos.map((p) => (
              <div key={p.id} className={`rq-photo is-${p.status}`}>
                {p.url ? <img src={p.url || "/placeholder.svg"} alt={p.name} /> : <span className="rq-photo-err">!</span>}
                {p.status === "uploading" && <span className="rq-photo-spin" aria-hidden="true" />}
                {p.status === "error" && <span className="rq-photo-msg">{p.error}</span>}
                <button className="rq-photo-x" onClick={() => remove(p.id)} aria-label="Supprimer">
                  ×
                </button>
              </div>
            ))}
            {s.photos.length < MAX_PHOTOS && (
              <button className="rq-photo-add" onClick={() => inputRef.current?.click()} aria-label="Ajouter">
                +
              </button>
            )}
          </div>
          <p className="rq-hint">
            {s.photos.filter((p) => p.status !== "error").length} photo(s) — {MAX_PHOTOS} max.
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
      <div className="rq-field">
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
          <label htmlFor="siret">SIREN / SIRET</label>
          <input id="siret" type="text" inputMode="numeric" value={s.legalNumber} onChange={(e) => patch({ legalNumber: e.target.value })} />
        </div>
      )}
    </section>
  )
}

function RecapStep({ s, dispatch, family }: { s: State; dispatch: React.Dispatch<Action>; family?: Family }) {
  const steps = stepsFor(s.entry)
  const go = (key: string) => dispatch({ type: "goto", i: steps.indexOf(key), fromSummary: true })
  const optionLabels = family?.options.filter((o) => s.options.includes(o.id)).map((o) => o.label) ?? []
  const chosenFormulas = family
    ? family.formulaGroups.map((_, gi) => s.formulas[gi]).filter(Boolean)
    : []
  const formulaLabel = s.inspection
    ? "À déterminer après inspection"
    : chosenFormulas.length
      ? chosenFormulas.join(" + ")
      : null

  return (
    <section>
      <StepIntro title="Récapitulatif" sub="Vérifiez votre demande avant de l'envoyer. Chaque bloc reste modifiable." />

      <RecapBlock label="Prestation" onEdit={family && s.entry === "catalog" ? () => go("prestation") : undefined}>
        {family?.title ?? "—"}
      </RecapBlock>
      {family && family.formulaGroups.length > 0 && (
        <RecapBlock label="Formule" onEdit={() => go("formules")}>
          {formulaLabel ?? "Non précisée"}
        </RecapBlock>
      )}
      <RecapBlock label="Véhicule" onEdit={() => go("vehicule")}>
        {[s.vehType, s.vehBrand, s.vehModel].filter(Boolean).join(" · ") || "—"}
      </RecapBlock>
      {(family?.options.length ?? 0) > 0 && (
        <RecapBlock label="Options" onEdit={() => go("options")}>
          {optionLabels.length ? optionLabels.join(", ") : "Aucune"}
        </RecapBlock>
      )}
      <RecapBlock label="Votre demande" onEdit={() => go("details")}>
        {[...s.contextual, s.description].filter(Boolean).join(" — ") || "—"}
      </RecapBlock>
      <RecapBlock label="Photos" onEdit={() => go("photos")}>
        {s.photos.filter((p) => p.status !== "error").length
          ? `${s.photos.filter((p) => p.status !== "error").length} photo(s)`
          : "Aucune"}
      </RecapBlock>
      <RecapBlock label="Disponibilités" onEdit={() => go("dispos")}>
        {[s.avail.join(", "), s.availNote].filter(Boolean).join(" — ") || "—"}
      </RecapBlock>
      <RecapBlock label="Coordonnées" onEdit={() => go("coordonnees")}>
        {`${s.firstName} ${s.lastName}`.trim() || "—"}
        {s.customerType === "professionnel" ? " · Professionnel" : ""}
        <br />
        <span className="rq-recap-sub">
          {[s.phone, s.email].filter(Boolean).join(" · ")}
        </span>
      </RecapBlock>
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

function Confirmation({ dispatch }: { dispatch: React.Dispatch<Action> }) {
  return (
    <div className="rq-confirm">
      <span className="rq-confirm-ic" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </span>
      <h2 className="rq-title rq-confirm-h">Votre demande a bien été envoyée</h2>
      <p className="rq-confirm-t">Spirit ACS va étudier votre demande et vous confirmer le rendez-vous.</p>
      <button className="rq-btn rq-btn-ghost" onClick={() => dispatch({ type: "reset" })}>
        Retour au prototype
      </button>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  ICONS (pictogrammes UI simples, réutilisables — aucun logo de marque)      */
/* -------------------------------------------------------------------------- */

function CarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 13l2-5a3 3 0 0 1 2.8-2h8.4A3 3 0 0 1 21 8l2 5" transform="translate(-1 0)" />
      <path d="M3 13h18v3a1 1 0 0 1-1 1h-1M4 17H3a0 0 0 0 1 0 0v-4" />
      <circle cx="7.5" cy="16.5" r="1.8" />
      <circle cx="16.5" cy="16.5" r="1.8" />
    </svg>
  )
}

function MotoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5.5" cy="16" r="3" />
      <circle cx="18.5" cy="16" r="3" />
      <path d="M5.5 16l3-5h6l2 5M8.5 11l-1-3H5.5M14.5 11l2 0 2 5" />
    </svg>
  )
}

/* -------------------------------------------------------------------------- */
/*  CSS                                                                       */
/* -------------------------------------------------------------------------- */

const css = `
.rq-stage{ min-height:100vh; background:#02090e; display:flex; justify-content:center; }
.rq-phone{
  --navy:#06131c; --navy2:#0a2130; --navy3:#0d2a3b;
  --teal:#17b3c9; --pink:#e51e7a; --pink2:#c4136a;
  --paper:#eef2f4; --fg:#f4f8fa; --muted:#9fb1bc; --line:rgba(255,255,255,.09);
  width:100%; max-width:412px; min-height:100vh;
  background:var(--navy); color:var(--fg);
  font-family:var(--font-sans),system-ui,sans-serif;
  display:flex; flex-direction:column; position:relative;
  -webkit-font-smoothing:antialiased;
}
.rq-title{ font-family:var(--font-osw),"Oswald",system-ui,sans-serif; text-transform:uppercase; font-weight:700; line-height:1; letter-spacing:.01em; margin:0; }
.rq-eyebrow{ font-family:var(--font-osw),"Oswald",system-ui,sans-serif; text-transform:uppercase; letter-spacing:.2em; font-weight:600; font-size:11px; color:var(--teal); margin:0; }
.rq-h2{ font-size:24px; color:#fff; }
.rq-sub{ margin:8px 0 0; font-size:14px; line-height:1.5; color:var(--muted); }
.rq-hint{ margin:10px 0 0; font-size:12.5px; color:var(--muted); }

/* BUTTONS */
.rq-btn{ display:flex; align-items:center; justify-content:center; width:100%; height:52px; border:none; border-radius:12px; font-family:var(--font-osw),"Oswald",sans-serif; text-transform:uppercase; letter-spacing:.06em; font-weight:600; font-size:15px; cursor:pointer; }
.rq-btn-pink{ background:var(--pink); color:#fff; box-shadow:0 12px 30px -14px rgba(229,30,122,.9); }
.rq-btn-pink:disabled{ opacity:.4; box-shadow:none; }
.rq-btn-ghost{ background:rgba(255,255,255,.06); color:var(--fg); border:1px solid rgba(23,179,201,.55); }

/* LAUNCHER */
.rq-launch{ padding:34px 20px 40px; }
.rq-launch-h1{ font-size:30px; color:#fff; margin:8px 0 0; }
.rq-launch-note{ margin:12px 0 24px; font-size:13.5px; line-height:1.5; color:var(--muted); }
.rq-launch-block{ margin-bottom:22px; }
.rq-launch-label{ font-family:var(--font-osw),"Oswald",sans-serif; text-transform:uppercase; letter-spacing:.14em; font-size:11px; color:var(--muted); margin:0 0 10px; }
.rq-launch-grid{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.rq-launch-card{ position:relative; border:1px solid var(--line); border-radius:12px; overflow:hidden; aspect-ratio:16/11; background:none; cursor:pointer; padding:0; text-align:left; }
.rq-launch-card img{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; opacity:.55; }
.rq-launch-card span{ position:absolute; left:10px; right:10px; bottom:9px; z-index:2; color:#fff; font-family:var(--font-osw),"Oswald",sans-serif; text-transform:uppercase; font-weight:600; font-size:12px; line-height:1.1; }

/* HEADER */
.rq-head{ position:sticky; top:0; z-index:6; background:var(--navy); padding:14px 12px 0; display:grid; grid-template-columns:40px 1fr 52px; align-items:center; gap:8px; border-bottom:1px solid var(--line); }
.rq-icon-btn{ width:40px; height:40px; border-radius:10px; background:rgba(255,255,255,.05); border:1px solid var(--line); color:var(--fg); display:flex; align-items:center; justify-content:center; cursor:pointer; }
.rq-icon-btn:disabled{ opacity:.3; }
.rq-icon-btn svg{ width:20px; height:20px; }
.rq-head-mid{ text-align:center; }
.rq-head-step{ display:block; font-size:11px; color:var(--teal); font-family:var(--font-osw),"Oswald",sans-serif; letter-spacing:.12em; text-transform:uppercase; }
.rq-head-label{ display:block; font-family:var(--font-osw),"Oswald",sans-serif; text-transform:uppercase; font-weight:600; font-size:14px; color:#fff; letter-spacing:.03em; }
.rq-demo-chip{ height:28px; align-self:center; border-radius:20px; background:rgba(255,255,255,.05); border:1px solid var(--line); color:var(--muted); font-size:11px; letter-spacing:.1em; text-transform:uppercase; cursor:pointer; padding:0 10px; }
.rq-progress{ grid-column:1 / -1; height:2px; margin-top:12px; background:rgba(255,255,255,.08); }
.rq-progress span{ display:block; height:100%; background:var(--teal); transition:width .3s ease; }

/* SCROLL AREA + FOOTER */
.rq-scroll{ flex:1; overflow-y:auto; padding:22px 20px 24px; }
.rq-intro{ margin-bottom:18px; }
.rq-foot{ position:sticky; bottom:0; background:linear-gradient(180deg, rgba(6,19,28,0), var(--navy) 22%); padding:12px 20px calc(16px + env(safe-area-inset-bottom)); border-top:1px solid var(--line); }
.rq-foot-legal{ margin:9px 0 0; font-size:11px; line-height:1.4; color:var(--muted); text-align:center; }

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
.rq-softchoice{ margin-top:12px; width:100%; text-align:left; background:none; border:1px dashed var(--line); border-radius:12px; padding:13px 14px; color:var(--paper); font-size:13.5px; cursor:pointer; }
.rq-softchoice.is-active{ border-style:solid; border-color:var(--teal); color:#fff; }

/* VEHICLE TYPES */
.rq-types{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:9px; margin-bottom:20px; }
.rq-type{ display:flex; flex-direction:column; align-items:center; gap:7px; padding:14px 6px; background:var(--navy2); border:1px solid var(--line); border-radius:12px; cursor:pointer; color:var(--paper); }
.rq-type.is-active{ border-color:var(--teal); box-shadow:0 0 0 1px var(--teal); background:var(--navy3); color:#fff; }
.rq-type-ic{ color:var(--teal); }
.rq-type-ic svg{ width:30px; height:30px; }
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
.rq-photo{ position:relative; aspect-ratio:1; border-radius:11px; overflow:hidden; background:var(--navy2); border:1px solid var(--line); }
.rq-photo img{ width:100%; height:100%; object-fit:cover; }
.rq-photo.is-uploading img{ opacity:.5; }
.rq-photo.is-error{ border-color:var(--pink); display:flex; align-items:center; justify-content:center; }
.rq-photo-err{ color:var(--pink); font-size:24px; font-weight:700; }
.rq-photo-msg{ position:absolute; left:0; right:0; bottom:0; padding:4px 6px; background:rgba(196,19,106,.9); color:#fff; font-size:9.5px; line-height:1.2; text-align:center; }
.rq-photo-spin{ position:absolute; top:50%; left:50%; width:22px; height:22px; margin:-11px 0 0 -11px; border:2px solid rgba(255,255,255,.3); border-top-color:#fff; border-radius:50%; animation:rq-spin .7s linear infinite; }
@keyframes rq-spin{ to{ transform:rotate(360deg); } }
.rq-photo-x{ position:absolute; top:5px; right:5px; width:22px; height:22px; border-radius:50%; background:rgba(2,9,14,.7); border:none; color:#fff; font-size:16px; line-height:1; cursor:pointer; display:flex; align-items:center; justify-content:center; }
.rq-photo-add{ aspect-ratio:1; border-radius:11px; background:var(--navy2); border:1.5px dashed rgba(255,255,255,.18); color:var(--teal); font-size:28px; cursor:pointer; }
@media (prefers-reduced-motion: reduce){ .rq-photo-spin{ animation:none; } .rq-progress span{ transition:none; } }

/* SEGMENTED */
.rq-seg{ display:grid; grid-template-columns:1fr 1fr; gap:6px; padding:5px; background:var(--navy2); border:1px solid var(--line); border-radius:12px; margin-bottom:18px; }
.rq-seg-btn{ height:40px; border-radius:9px; background:none; border:none; color:var(--muted); font-size:14px; font-weight:600; cursor:pointer; }
.rq-seg-btn.is-active{ background:var(--teal); color:var(--navy); }

/* RECAP */
.rq-recap{ border:1px solid var(--line); border-radius:12px; padding:13px 14px; margin-bottom:10px; background:var(--navy2); }
.rq-recap-top{ display:flex; align-items:center; justify-content:space-between; margin-bottom:5px; }
.rq-recap-label{ font-family:var(--font-osw),"Oswald",sans-serif; text-transform:uppercase; letter-spacing:.1em; font-size:11px; color:var(--teal); }
.rq-recap-edit{ background:none; border:none; color:var(--fg); font-size:12.5px; text-decoration:underline; cursor:pointer; padding:0; }
.rq-recap-val{ font-size:14px; line-height:1.45; color:#fff; }
.rq-recap-sub{ color:var(--muted); font-size:13px; }

/* CONFIRMATION */
.rq-confirm{ flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:40px 26px; gap:6px; }
.rq-confirm-ic{ width:74px; height:74px; border-radius:50%; background:rgba(23,179,201,.14); border:1px solid rgba(23,179,201,.4); color:var(--teal); display:flex; align-items:center; justify-content:center; margin-bottom:14px; }
.rq-confirm-ic svg{ width:36px; height:36px; }
.rq-confirm-h{ font-size:24px; color:#fff; }
.rq-confirm-t{ margin:10px 0 26px; font-size:14px; line-height:1.55; color:var(--muted); max-width:300px; }
`
