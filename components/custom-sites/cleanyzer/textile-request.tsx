"use client"

/**
 * DEMANDE PERSONNALISÉE TEXTILE — CLEANYZER (maquette Phase 1).
 *
 * Le textile ne suit PAS le booking auto (cahier §8/§12) : on ne demande QUE
 * les informations réellement utiles, on n'affiche jamais de prix fabriqué.
 * Les tarifs canapé (indicatifs) viennent du cahier ; matelas/tapis/moquette =
 * sur devis. Photos et dimensions facultatives. En Phase 2 : branché sur
 * `custom_requests` DetailFlow (upload photos inclus).
 */

import { useMemo, useState } from "react"
import Link from "next/link"
import { Check, ChevronLeft, ChevronRight, ImagePlus, Sofa, BedDouble, LayoutGrid, Layers, HelpCircle } from "lucide-react"
import { CleanyzerShell } from "./site-shell"
import { PageHero } from "./page-primitives"
import { CLZ_NAV_ITEMS } from "./nav"
import { CLZ_PREVIEW_BASE } from "./tokens"
import { TEXTILE_BASE, TEXTILE_ITEMS, TEXTILE_SUPPLEMENTS } from "./content"

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "canape-2-3": Sofa,
  "canape-3-4": Sofa,
  "canape-5": Sofa,
  matelas: BedDouble,
  tapis: LayoutGrid,
  moquette: Layers,
  autre: HelpCircle,
}

const STEPS = ["Votre besoin", "Détails", "Coordonnées"] as const

export function CleanyzerTextileRequest() {
  const [step, setStep] = useState(0)
  const [item, setItem] = useState<string | null>(null)
  const [supplements, setSupplements] = useState<Record<string, boolean>>({})
  const [places, setPlaces] = useState("")
  const [dimensions, setDimensions] = useState("")
  const [commune, setCommune] = useState("")
  const [description, setDescription] = useState("")
  const [photos, setPhotos] = useState<string[]>([])
  const [contact, setContact] = useState({ name: "", phone: "", email: "" })
  const [sent, setSent] = useState(false)

  const selected = useMemo(() => TEXTILE_ITEMS.find((t) => t.key === item) ?? null, [item])

  const canContinue = (() => {
    if (step === 0) return item != null
    if (step === 1) return commune.trim() !== "" && description.trim() !== ""
    if (step === 2) return contact.name.trim() !== "" && contact.phone.trim() !== "" && contact.email.trim() !== ""
    return true
  })()

  function addMockPhoto() {
    setPhotos((p) => (p.length >= 4 ? p : [...p, `Photo ${p.length + 1}`]))
  }

  return (
    <CleanyzerShell navItems={CLZ_NAV_ITEMS} active="Prestations">
      <PageHero
        eyebrow="Textile & mobilier"
        title="Obtenir mon devis textile"
        intro="Quelques informations utiles suffisent. Chaque prestation comprend aspiration, shampoing, désinfection et traitement des odeurs. On vous répond avec un devis adapté."
        crumbs={[{ label: "Demande personnalisée" }]}
      />

      <div className="clz-form-skin bg-[var(--clz-surface-2)]">
        <div className="mx-auto max-w-3xl px-4 py-10 md:px-6 md:py-14">
          {!sent && (
            <ol className="mb-6 flex items-center gap-2">
              {STEPS.map((label, i) => (
                <li key={label} className="flex items-center gap-2">
                  <span className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${i === step ? "bg-[var(--clz-blue)] text-white" : i < step ? "bg-[var(--clz-blue-soft)] text-[var(--clz-blue-strong)]" : "text-[var(--clz-muted)]"}`}>
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${i < step ? "bg-[var(--clz-blue)] text-white" : i === step ? "bg-white/25" : "bg-[var(--clz-line)]"}`}>
                      {i < step ? <Check className="h-3 w-3" /> : i + 1}
                    </span>
                    {label}
                  </span>
                  {i < STEPS.length - 1 && <ChevronRight className="h-3 w-3 text-[var(--clz-line)]" />}
                </li>
              ))}
            </ol>
          )}

          <div className="clz-card p-5 md:p-8">
            {sent ? (
              <div className="flex flex-col items-center py-8 text-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--clz-blue-soft)] text-[var(--clz-blue)]">
                  <Check className="h-8 w-8" />
                </span>
                <h2 className="clz-display clz-h2 mt-6 text-[var(--clz-fg)]">Demande envoyée</h2>
                <p className="mt-3 max-w-md text-pretty leading-relaxed text-[var(--clz-muted)]">
                  Merci ! CLEANYZER revient vers vous avec un devis textile adapté. Aucun prix n'est
                  fixé automatiquement pour une prestation sur mesure.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Link href={CLZ_PREVIEW_BASE} className="clz-btn clz-btn-ghost">Retour à l'accueil</Link>
                  <Link href={`${CLZ_PREVIEW_BASE}/reservation`} className="clz-btn clz-btn-primary">Réserver un nettoyage auto</Link>
                </div>
              </div>
            ) : (
              <>
                {/* Étape 1 — besoin */}
                {step === 0 && (
                  <div>
                    <h2 className="clz-display clz-h3 text-[var(--clz-fg)]">Que souhaitez-vous faire nettoyer ?</h2>
                    <p className="mt-1 text-sm text-[var(--clz-muted)]">Base incluse : {TEXTILE_BASE}</p>
                    <div className="mt-6 grid gap-3 sm:grid-cols-2">
                      {TEXTILE_ITEMS.map((t) => {
                        const Icon = ICONS[t.key] ?? HelpCircle
                        const active = item === t.key
                        return (
                          <button
                            key={t.key}
                            type="button"
                            onClick={() => setItem(t.key)}
                            className={`clz-card flex items-center gap-3 p-4 text-left transition-colors ${active ? "ring-2 ring-[var(--clz-blue)]" : "hover:border-[var(--clz-blue)]"}`}
                          >
                            <span className={`flex h-10 w-10 flex-none items-center justify-center rounded-full ${active ? "bg-[var(--clz-blue)] text-white" : "bg-[var(--clz-blue-soft)] text-[var(--clz-blue)]"}`}>
                              <Icon className="h-5 w-5" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block font-medium text-[var(--clz-fg)]">{t.label}</span>
                              {t.hint && <span className="block text-xs text-[var(--clz-muted)]">{t.hint}</span>}
                            </span>
                            <span className="whitespace-nowrap text-sm font-semibold text-[var(--clz-blue)]">{t.priceLabel}</span>
                          </button>
                        )
                      })}
                    </div>

                    <p className="mt-6 text-sm font-medium text-[var(--clz-fg)]">Suppléments éventuels</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {TEXTILE_SUPPLEMENTS.map((s) => {
                        const on = supplements[s.label]
                        return (
                          <button
                            key={s.label}
                            type="button"
                            onClick={() => setSupplements((p) => ({ ...p, [s.label]: !p[s.label] }))}
                            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${on ? "border-[var(--clz-blue)] bg-[var(--clz-blue)] text-white" : "border-[var(--clz-line)] text-[var(--clz-fg)] hover:border-[var(--clz-blue)]"}`}
                          >
                            {s.label} <span className={on ? "text-white/90" : "text-[var(--clz-blue)]"}>{s.priceLabel}</span>
                          </button>
                        )
                      })}
                    </div>
                    {selected && selected.price == null && (
                      <p className="mt-5 rounded-lg bg-[var(--clz-blue-soft)] p-3 text-sm text-[var(--clz-blue-strong)]">
                        Cette prestation est établie sur devis : le prix dépend du cas. Aucun montant automatique n'est généré.
                      </p>
                    )}
                  </div>
                )}

                {/* Étape 2 — détails */}
                {step === 1 && (
                  <div>
                    <h2 className="clz-display clz-h3 text-[var(--clz-fg)]">Détails utiles</h2>
                    <div className="mt-6 grid gap-4">
                      {item?.startsWith("canape") && (
                        <TextField label="Nombre de places" value={places} onChange={setPlaces} placeholder="ex. 3 places + méridienne" />
                      )}
                      {(item === "tapis" || item === "matelas" || item === "moquette") && (
                        <TextField label="Dimensions (si connues)" value={dimensions} onChange={setDimensions} placeholder="ex. 200 × 300 cm" />
                      )}
                      <TextField label="Commune" value={commune} onChange={setCommune} placeholder="ex. Annecy, Sevrier, Poisy…" required />
                      <div>
                        <label htmlFor="clz-txt-desc" className="block text-sm font-medium text-[var(--clz-fg)]">Décrivez votre besoin<span className="text-[var(--clz-blue)]"> *</span></label>
                        <textarea
                          id="clz-txt-desc"
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          rows={4}
                          placeholder="Type de tissu, taches, odeurs, ancienneté…"
                          className="mt-2 w-full rounded-xl border border-[var(--clz-line)] bg-white px-4 py-3 text-[var(--clz-fg)] outline-none focus:border-[var(--clz-blue)] focus:ring-2 focus:ring-[var(--clz-blue-soft)]"
                        />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[var(--clz-fg)]">Photos (facultatif)</p>
                        <div className="mt-2 flex flex-wrap gap-3">
                          {photos.map((p) => (
                            <span key={p} className="flex h-20 w-20 items-center justify-center rounded-xl border border-[var(--clz-line)] bg-[var(--clz-surface-2)] text-xs text-[var(--clz-muted)]">{p}</span>
                          ))}
                          {photos.length < 4 && (
                            <button type="button" onClick={addMockPhoto} className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--clz-line)] text-[var(--clz-muted)] hover:border-[var(--clz-blue)] hover:text-[var(--clz-blue)]">
                              <ImagePlus className="h-5 w-5" />
                              <span className="text-[10px]">Ajouter</span>
                            </button>
                          )}
                        </div>
                        <p className="mt-2 text-xs text-[var(--clz-muted)]">Maquette : l'upload réel sera branché sur DetailFlow (Phase 2).</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Étape 3 — coordonnées */}
                {step === 2 && (
                  <div>
                    <h2 className="clz-display clz-h3 text-[var(--clz-fg)]">Vos coordonnées</h2>
                    <div className="mt-6 grid gap-4 sm:grid-cols-2">
                      <TextField label="Nom complet" value={contact.name} onChange={(v) => setContact((c) => ({ ...c, name: v }))} required />
                      <TextField label="Téléphone" type="tel" value={contact.phone} onChange={(v) => setContact((c) => ({ ...c, phone: v }))} required />
                      <div className="sm:col-span-2">
                        <TextField label="E-mail" type="email" value={contact.email} onChange={(v) => setContact((c) => ({ ...c, email: v }))} required />
                      </div>
                    </div>
                    <div className="mt-6 rounded-xl border border-[var(--clz-line)] p-4 text-sm">
                      <p className="font-medium text-[var(--clz-fg)]">Récapitulatif</p>
                      <p className="mt-1 text-[var(--clz-muted)]">
                        {selected?.label ?? "—"}
                        {selected?.priceLabel ? ` · ${selected.priceLabel}` : ""}
                        {Object.entries(supplements).filter(([, v]) => v).map(([k]) => ` · ${k}`).join("")}
                        {commune ? ` · ${commune}` : ""}
                      </p>
                    </div>
                  </div>
                )}

                {/* Navigation */}
                <div className="mt-8 flex items-center justify-between gap-3 border-t border-[var(--clz-line)] pt-6">
                  {step > 0 ? (
                    <button type="button" onClick={() => setStep((s) => s - 1)} className="clz-btn clz-btn-ghost">
                      <ChevronLeft className="h-4 w-4" /> Retour
                    </button>
                  ) : (
                    <span />
                  )}
                  {step < STEPS.length - 1 ? (
                    <button type="button" disabled={!canContinue} onClick={() => setStep((s) => s + 1)} className="clz-btn clz-btn-primary disabled:cursor-not-allowed disabled:opacity-40">
                      Continuer <ChevronRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <button type="button" disabled={!canContinue} onClick={() => setSent(true)} className="clz-btn clz-btn-primary disabled:cursor-not-allowed disabled:opacity-40">
                      Envoyer ma demande <Check className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </CleanyzerShell>
  )
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  required?: boolean
}) {
  const id = `clz-txt-${label.toLowerCase().replace(/[^a-z]/g, "")}`
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-[var(--clz-fg)]">
        {label}
        {required && <span className="text-[var(--clz-blue)]"> *</span>}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-xl border border-[var(--clz-line)] bg-white px-4 py-3 text-[var(--clz-fg)] outline-none focus:border-[var(--clz-blue)] focus:ring-2 focus:ring-[var(--clz-blue-soft)]"
      />
    </div>
  )
}
