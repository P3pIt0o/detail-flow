"use client"

/**
 * Formulaire de devis Rozan — expérience MULTI-ÉTAPES (mobile-first).
 *
 * PHASE 2 (mockup interactif) : l'objectif est de valider l'UX et le parcours.
 * L'état vit localement ; l'envoi affiche un écran de confirmation, SANS appel
 * serveur. En Phase 4, ce composant s'appuiera sur le SYSTÈME EXISTANT de
 * demandes de devis (`custom_requests` + `app/(site)/demande/actions.ts`) :
 *   - upload photos volumineuses depuis smartphone (compression client, grant
 *     signé, progression, retry, validation type/taille, photos privées) via
 *     le module d'upload déjà en place ;
 *   - création de la demande scellée au tenant Rozan résolu CÔTÉ SERVEUR
 *     (jamais un companyId envoyé par le navigateur) ;
 *   - notification e-mail pro + confirmation client aux identités Rozan.
 *
 * Étapes : 1) quoi nettoyer · 2) questions dynamiques · 3) photos ·
 * 4) adresse · 5) coordonnées · 6) résumé.
 */

import { useMemo, useRef, useState, type ChangeEvent } from "react"
import { ArrowLeft, ArrowRight, Check, ImagePlus, Loader2, Trash2, PartyPopper } from "lucide-react"
import { ROZAN_SERVICES, type RozanServiceSlug } from "./content"

type Answers = Record<string, string>
type Photo = { id: string; name: string; url: string; size: number }

const STEP_LABELS = ["Prestation", "Détails", "Photos", "Adresse", "Contact", "Résumé"]

// Questions dynamiques par prestation (aperçu — enrichi en Phase 4).
const DYNAMIC_FIELDS: Partial<
  Record<RozanServiceSlug, { key: string; label: string; type: "select" | "text" | "textarea"; options?: string[] }[]>
> = {
  "nettoyage-voiture": [
    { key: "vehicule", label: "Type de véhicule", type: "select", options: ["Citadine", "Berline", "SUV / 4x4", "Utilitaire", "Monospace"] },
    { key: "formule", label: "Formule", type: "select", options: ["Intérieur", "Extérieur", "Complet"] },
    { key: "etat", label: "État général", type: "select", options: ["Léger", "Moyen", "Très encrassé"] },
    { key: "infos", label: "Informations complémentaires", type: "textarea" },
  ],
  "nettoyage-canape": [
    { key: "places", label: "Nombre de places", type: "select", options: ["2 places", "3 places", "Angle", "Canapé + fauteuils"] },
    { key: "matiere", label: "Matière (si connue)", type: "select", options: ["Tissu", "Microfibre", "Cuir", "Velours", "Je ne sais pas"] },
    { key: "taches", label: "Taches", type: "select", options: ["Aucune", "Quelques-unes", "Nombreuses"] },
    { key: "odeurs", label: "Odeurs à traiter", type: "select", options: ["Non", "Oui"] },
    { key: "infos", label: "Informations complémentaires", type: "textarea" },
  ],
}

const GENERIC_FIELDS = [
  { key: "etat", label: "État général", type: "select" as const, options: ["Léger", "Moyen", "Très encrassé"] },
  { key: "infos", label: "Informations complémentaires", type: "textarea" as const },
]

function fieldsFor(slug: RozanServiceSlug | null) {
  if (!slug) return GENERIC_FIELDS
  return DYNAMIC_FIELDS[slug] ?? GENERIC_FIELDS
}

const inputClass =
  "h-12 w-full rounded-xl border border-[color:var(--rozan-line)] bg-[var(--rozan-surface)] px-4 text-[var(--rozan-fg)] outline-none transition-colors focus:border-[var(--rozan-accent)] focus:ring-2 focus:ring-[color:var(--rozan-accent-soft)]"

export function RozanQuoteForm() {
  const [step, setStep] = useState(0)
  const [service, setService] = useState<RozanServiceSlug | null>(null)
  const [answers, setAnswers] = useState<Answers>({})
  const [photos, setPhotos] = useState<Photo[]>([])
  const [address, setAddress] = useState({ street: "", city: "", zip: "" })
  const [contact, setContact] = useState({ firstName: "", lastName: "", phone: "", email: "" })
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const activeServices = useMemo(() => ROZAN_SERVICES.filter((s) => s.active), [])
  const fields = fieldsFor(service)
  const serviceLabel = activeServices.find((s) => s.slug === service)?.label ?? ""

  const canNext = useMemo(() => {
    if (step === 0) return service !== null
    if (step === 3) return address.city.trim().length > 0
    if (step === 4)
      return (
        contact.firstName.trim() !== "" &&
        contact.lastName.trim() !== "" &&
        contact.phone.trim() !== "" &&
        /.+@.+\..+/.test(contact.email)
      )
    return true
  }, [step, service, address, contact])

  function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    // Phase 2 : aperçu local via object URL. Phase 4 : compression client +
    // upload robuste (grant signé, progression, retry) via le module existant.
    const next = files.map((f) => ({
      id: crypto.randomUUID(),
      name: f.name,
      url: URL.createObjectURL(f),
      size: f.size,
    }))
    setPhotos((p) => [...p, ...next])
    e.target.value = ""
  }

  function removePhoto(id: string) {
    setPhotos((p) => {
      const target = p.find((x) => x.id === id)
      if (target) URL.revokeObjectURL(target.url)
      return p.filter((x) => x.id !== id)
    })
  }

  function submit() {
    setSubmitting(true)
    // Simulation d'envoi (aucun appel réseau en Phase 2).
    setTimeout(() => {
      setSubmitting(false)
      setDone(true)
    }, 900)
  }

  if (done) {
    return (
      <div className="rounded-3xl border border-[color:var(--rozan-line)] bg-[var(--rozan-surface)] p-8 text-center sm:p-12">
        <span className="mx-auto inline-flex size-14 items-center justify-center rounded-full bg-[var(--rozan-accent-soft)] text-[var(--rozan-accent)]">
          <PartyPopper className="size-7" aria-hidden="true" />
        </span>
        <h3 className="rozan-title mt-5 text-2xl text-[var(--rozan-fg)]">Demande envoyée</h3>
        <p className="mx-auto mt-3 max-w-md text-pretty text-sm leading-relaxed text-[var(--rozan-muted)]">
          Merci ! Rozan revient vers vous très rapidement avec votre devis. Un e-mail de confirmation
          vous sera envoyé. (Aperçu — l&apos;envoi réel sera branché au back-office Rozan en Phase 4.)
        </p>
      </div>
    )
  }

  return (
    <div className="rozan-form-skin overflow-hidden rounded-3xl border border-[color:var(--rozan-line)] bg-[var(--rozan-surface)]">
      {/* Progression */}
      <div className="border-b border-[color:var(--rozan-line)] px-5 pt-5 sm:px-7">
        <div className="flex items-center justify-between text-xs font-medium text-[var(--rozan-muted)]">
          <span>
            Étape {step + 1} / {STEP_LABELS.length}
          </span>
          <span className="text-[var(--rozan-accent)]">{STEP_LABELS[step]}</span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--rozan-surface-2)]">
          <div
            className="h-full rounded-full bg-[var(--rozan-accent)] transition-all duration-300"
            style={{ width: `${((step + 1) / STEP_LABELS.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="px-5 py-6 sm:px-7 sm:py-8">
        {/* Étape 1 — Prestation */}
        {step === 0 && (
          <fieldset>
            <legend className="rozan-title text-lg text-[var(--rozan-fg)]">Que souhaitez-vous nettoyer ?</legend>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {activeServices.map((s) => {
                const selected = service === s.slug
                return (
                  <button
                    key={s.slug}
                    type="button"
                    onClick={() => setService(s.slug)}
                    aria-pressed={selected}
                    className={`flex flex-col items-start gap-1 rounded-2xl border p-4 text-left transition-all ${
                      selected
                        ? "border-[var(--rozan-accent)] bg-[var(--rozan-accent-soft)]"
                        : "border-[color:var(--rozan-line)] bg-[var(--rozan-surface)] hover:border-[var(--rozan-accent)]"
                    }`}
                  >
                    <span className="rozan-title text-base text-[var(--rozan-fg)]">{s.label}</span>
                    <span className="text-xs leading-snug text-[var(--rozan-muted)]">{s.teaser}</span>
                  </button>
                )
              })}
            </div>
          </fieldset>
        )}

        {/* Étape 2 — Questions dynamiques */}
        {step === 1 && (
          <fieldset>
            <legend className="rozan-title text-lg text-[var(--rozan-fg)]">
              Parlez-nous de votre {serviceLabel.toLowerCase() || "besoin"}
            </legend>
            <div className="mt-5 grid gap-4">
              {fields.map((f) => (
                <label key={f.key} className="block">
                  <span className="mb-1.5 block text-sm font-medium text-[var(--rozan-fg)]">{f.label}</span>
                  {f.type === "select" ? (
                    <select
                      className={inputClass}
                      value={answers[f.key] ?? ""}
                      onChange={(e) => setAnswers((a) => ({ ...a, [f.key]: e.target.value }))}
                    >
                      <option value="">Sélectionner…</option>
                      {f.options?.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : f.type === "textarea" ? (
                    <textarea
                      rows={3}
                      className="w-full rounded-xl border border-[color:var(--rozan-line)] bg-[var(--rozan-surface)] px-4 py-3 text-[var(--rozan-fg)] outline-none transition-colors focus:border-[var(--rozan-accent)] focus:ring-2 focus:ring-[color:var(--rozan-accent-soft)]"
                      placeholder="Précisez si besoin…"
                      value={answers[f.key] ?? ""}
                      onChange={(e) => setAnswers((a) => ({ ...a, [f.key]: e.target.value }))}
                    />
                  ) : (
                    <input
                      className={inputClass}
                      value={answers[f.key] ?? ""}
                      onChange={(e) => setAnswers((a) => ({ ...a, [f.key]: e.target.value }))}
                    />
                  )}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {/* Étape 3 — Photos */}
        {step === 2 && (
          <fieldset>
            <legend className="rozan-title text-lg text-[var(--rozan-fg)]">Ajoutez des photos (recommandé)</legend>
            <p className="mt-2 text-sm text-[var(--rozan-muted)]">
              Une ou plusieurs photos nous aident à établir un devis précis. Prises directement depuis
              votre téléphone, même volumineuses.
            </p>

            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="mt-5 flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[color:var(--rozan-line)] bg-[var(--rozan-surface-2)] px-4 py-8 text-center transition-colors hover:border-[var(--rozan-accent)]"
            >
              <ImagePlus className="size-7 text-[var(--rozan-accent)]" aria-hidden="true" />
              <span className="text-sm font-medium text-[var(--rozan-fg)]">Ajouter des photos</span>
              <span className="text-xs text-[var(--rozan-muted)]">JPG, PNG ou HEIC — plusieurs fichiers possibles</span>
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              onChange={onFiles}
              className="hidden"
            />

            {photos.length > 0 && (
              <ul className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
                {photos.map((p) => (
                  <li key={p.id} className="group relative aspect-square overflow-hidden rounded-xl border border-[color:var(--rozan-line)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url || "/placeholder.svg"} alt={p.name} className="size-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removePhoto(p.id)}
                      aria-label={`Retirer ${p.name}`}
                      className="absolute right-1.5 top-1.5 inline-flex size-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
        )}

        {/* Étape 4 — Adresse */}
        {step === 3 && (
          <fieldset>
            <legend className="rozan-title text-lg text-[var(--rozan-fg)]">Où intervenons-nous ?</legend>
            <div className="mt-5 grid gap-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-[var(--rozan-fg)]">Adresse</span>
                <input className={inputClass} value={address.street} onChange={(e) => setAddress((a) => ({ ...a, street: e.target.value }))} placeholder="N° et rue" />
              </label>
              <div className="grid grid-cols-[1fr_0.6fr] gap-4">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-[var(--rozan-fg)]">Ville</span>
                  <input className={inputClass} value={address.city} onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))} placeholder="Gex, Genève…" />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-[var(--rozan-fg)]">Code postal</span>
                  <input className={inputClass} value={address.zip} onChange={(e) => setAddress((a) => ({ ...a, zip: e.target.value }))} inputMode="numeric" placeholder="01170" />
                </label>
              </div>
            </div>
          </fieldset>
        )}

        {/* Étape 5 — Contact */}
        {step === 4 && (
          <fieldset>
            <legend className="rozan-title text-lg text-[var(--rozan-fg)]">Vos coordonnées</legend>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-[var(--rozan-fg)]">Prénom</span>
                <input className={inputClass} value={contact.firstName} onChange={(e) => setContact((c) => ({ ...c, firstName: e.target.value }))} autoComplete="given-name" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-[var(--rozan-fg)]">Nom</span>
                <input className={inputClass} value={contact.lastName} onChange={(e) => setContact((c) => ({ ...c, lastName: e.target.value }))} autoComplete="family-name" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-[var(--rozan-fg)]">Téléphone</span>
                <input className={inputClass} value={contact.phone} onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))} inputMode="tel" autoComplete="tel" placeholder="+33 / +41" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-[var(--rozan-fg)]">E-mail</span>
                <input className={inputClass} value={contact.email} onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))} inputMode="email" autoComplete="email" placeholder="vous@exemple.com" />
              </label>
            </div>
          </fieldset>
        )}

        {/* Étape 6 — Résumé */}
        {step === 5 && (
          <div>
            <h3 className="rozan-title text-lg text-[var(--rozan-fg)]">Résumé de votre demande</h3>
            <dl className="mt-5 divide-y divide-[color:var(--rozan-line)] rounded-2xl border border-[color:var(--rozan-line)] bg-[var(--rozan-surface-2)] px-4">
              <Row label="Prestation" value={serviceLabel} />
              {fields.map((f) => (answers[f.key] ? <Row key={f.key} label={f.label} value={answers[f.key]} /> : null))}
              <Row label="Photos" value={photos.length > 0 ? `${photos.length} photo(s)` : "Aucune"} />
              <Row label="Adresse" value={[address.street, address.zip, address.city].filter(Boolean).join(", ") || "—"} />
              <Row label="Contact" value={`${contact.firstName} ${contact.lastName}`} />
              <Row label="Téléphone" value={contact.phone || "—"} />
              <Row label="E-mail" value={contact.email || "—"} />
            </dl>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between gap-3 border-t border-[color:var(--rozan-line)] px-5 py-4 sm:px-7">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-medium text-[var(--rozan-muted)] transition-colors hover:text-[var(--rozan-fg)] disabled:invisible"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Retour
        </button>

        {step < STEP_LABELS.length - 1 ? (
          <button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            disabled={!canNext}
            className="inline-flex h-11 items-center gap-1.5 rounded-full bg-[var(--rozan-accent)] px-6 text-sm font-semibold text-white transition-colors hover:bg-[var(--rozan-accent-strong)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Continuer
            <ArrowRight className="size-4" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-[var(--rozan-accent)] px-6 text-sm font-semibold text-white transition-colors hover:bg-[var(--rozan-accent-strong)] disabled:opacity-60"
          >
            {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
            Envoyer ma demande
          </button>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <dt className="text-sm text-[var(--rozan-muted)]">{label}</dt>
      <dd className="text-right text-sm font-medium text-[var(--rozan-fg)]">{value}</dd>
    </div>
  )
}
