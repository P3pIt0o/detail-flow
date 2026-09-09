"use client"

/**
 * Parcours de RÉSERVATION Rozan — expérience multi-étapes (mobile-first).
 *
 * Modèle transactionnel : l'utilisateur compose sa prestation (variante +
 * formule + options), le TOTAL se recalcule en direct, puis un ACOMPTE confirme
 * la réservation (le solde étant réglé après l'intervention). Les prestations
 * dont la surface est trop variable (ex. terrasse) basculent en mode « sur
 * devis » : mêmes étapes, mais sans acompte — Rozan chiffre ensuite.
 *
 * PHASE 2 (mockup interactif) : l'état vit localement ; « payer l'acompte » et
 * « envoyer la demande » sont SIMULÉS (aucun appel réseau). En Phase 4 :
 *   - le total est recalculé et RE-VALIDÉ CÔTÉ SERVEUR (jamais de confiance au
 *     montant envoyé par le navigateur), quantités/plafonds contrôlés ;
 *   - l'acompte crée une session Stripe Checkout via l'intégration DÉJÀ
 *     configurée (STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET), avec clé
 *     d'idempotence pour interdire tout double débit ;
 *   - la réservation est scellée au tenant Rozan résolu côté serveur et
 *     branchée au système existant (`custom_requests`), avec upload photos
 *     robuste (compression, grant signé, progression, retry).
 *
 * Aucun montant n'est codé en dur ici : tout provient de `content.ts`
 * (`ROZAN_BOOKING`, `ROZAN_DEPOSIT`) et les prix sont signalés « indicatifs »
 * tant que `ROZAN_PRICING_IS_DEMO` vaut `true`.
 */

import { useMemo, useRef, useState, type ChangeEvent } from "react"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ImagePlus,
  Loader2,
  Trash2,
  PartyPopper,
  CreditCard,
  ShieldCheck,
  Lock,
  Info,
} from "lucide-react"
import {
  ROZAN_SERVICES,
  getRozanBooking,
  formatRozanPrice,
  computeRozanDeposit,
  ROZAN_DEPOSIT,
  ROZAN_PRICING_IS_DEMO,
  type RozanServiceSlug,
  type RozanPriceItem,
} from "./content"

type Photo = { id: string; name: string; url: string; size: number }

const inputClass =
  "h-12 w-full rounded-xl border border-[color:var(--rozan-line)] bg-[var(--rozan-surface)] px-4 text-[var(--rozan-fg)] outline-none transition-colors focus:border-[var(--rozan-accent)] focus:ring-2 focus:ring-[color:var(--rozan-accent-soft)]"

export function RozanQuoteForm() {
  const [step, setStep] = useState(0)
  const [service, setService] = useState<RozanServiceSlug | null>(null)
  const [variantId, setVariantId] = useState<string | null>(null)
  const [formulaId, setFormulaId] = useState<string | null>(null)
  const [optionIds, setOptionIds] = useState<string[]>([])
  const [notes, setNotes] = useState("")
  const [photos, setPhotos] = useState<Photo[]>([])
  const [address, setAddress] = useState({ street: "", city: "", zip: "", date: "", slot: "" })
  const [contact, setContact] = useState({ firstName: "", lastName: "", phone: "", email: "" })
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const activeServices = useMemo(() => ROZAN_SERVICES.filter((s) => s.active), [])
  const booking = service ? getRozanBooking(service) : null
  const isQuoteMode = booking?.mode === "quote"
  const serviceLabel = activeServices.find((s) => s.slug === service)?.label ?? ""

  // Étapes dynamiques : l'acompte n'existe qu'en mode réservation.
  const steps = useMemo(() => {
    const base = ["Prestation", "Formule", "Photos", "Intervention", "Coordonnées", "Récapitulatif"]
    return isQuoteMode ? base : [...base, "Acompte"]
  }, [isQuoteMode])
  const stepKey = steps[step]

  // Éléments sélectionnés + total (centimes). null = un prix reste à configurer.
  const { selected, total, hasNullPrice } = useMemo(() => {
    if (!booking) return { selected: [] as RozanPriceItem[], total: 0, hasNullPrice: false }
    const chosen: RozanPriceItem[] = []
    const variant = booking.variants.find((v) => v.id === variantId)
    if (variant) chosen.push(variant)
    const formula = booking.formulas?.find((f) => f.id === formulaId)
    if (formula) chosen.push(formula)
    for (const opt of booking.options) if (optionIds.includes(opt.id)) chosen.push(opt)
    const nullFound = chosen.some((c) => c.amount === null)
    const sum = chosen.reduce((acc, c) => acc + (c.amount ?? 0), 0)
    return { selected: chosen, total: sum, hasNullPrice: nullFound }
  }, [booking, variantId, formulaId, optionIds])

  const priceKnown = !isQuoteMode && !hasNullPrice && total > 0
  const deposit = priceKnown ? computeRozanDeposit(total) : 0

  const canNext = useMemo(() => {
    switch (stepKey) {
      case "Prestation":
        return service !== null
      case "Formule":
        if (!booking) return false
        if (!variantId) return false
        if (booking.formulas && booking.formulas.length > 0 && !formulaId) return false
        return true
      case "Intervention":
        return address.city.trim().length > 0
      case "Coordonnées":
        return (
          contact.firstName.trim() !== "" &&
          contact.lastName.trim() !== "" &&
          contact.phone.trim() !== "" &&
          /.+@.+\..+/.test(contact.email)
        )
      default:
        return true
    }
  }, [stepKey, service, booking, variantId, formulaId, address, contact])

  function selectService(slug: RozanServiceSlug) {
    setService(slug)
    // Réinitialise la configuration liée à la prestation.
    setVariantId(null)
    setFormulaId(null)
    setOptionIds([])
  }

  function toggleOption(id: string) {
    setOptionIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    const next = files.map((f) => ({ id: crypto.randomUUID(), name: f.name, url: URL.createObjectURL(f), size: f.size }))
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

  function finish() {
    // PHASE 2 : simulation. PHASE 4 :
    //  - mode réservation → création d'une session Stripe Checkout (montant
    //    d'acompte re-calculé côté serveur) puis redirection ;
    //  - mode devis → création de la demande `custom_requests` scellée au tenant.
    setSubmitting(true)
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
        <h3 className="rozan-title mt-5 text-2xl text-[var(--rozan-fg)]">
          {isQuoteMode ? "Demande de devis envoyée" : "Réservation confirmée"}
        </h3>
        <p className="mx-auto mt-3 max-w-md text-pretty text-sm leading-relaxed text-[var(--rozan-muted)]">
          {isQuoteMode ? (
            <>Merci ! Rozan étudie votre demande et revient vers vous rapidement avec un devis précis.</>
          ) : (
            <>
              Merci ! Votre acompte {priceKnown ? <>de {formatRozanPrice(deposit)} </> : null}confirme votre
              réservation. Rozan vous contacte pour finaliser le créneau ; le solde sera réglé après
              l&apos;intervention.
            </>
          )}
        </p>
        <p className="mx-auto mt-4 max-w-md text-pretty text-xs leading-relaxed text-[var(--rozan-muted)]">
          Aperçu — le paiement réel (Stripe) et l&apos;enregistrement seront branchés au back-office Rozan
          en Phase 4.
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
            Étape {step + 1} / {steps.length}
          </span>
          <span className="text-[var(--rozan-accent)]">{stepKey}</span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--rozan-surface-2)]">
          <div
            className="h-full rounded-full bg-[var(--rozan-accent)] transition-all duration-300"
            style={{ width: `${((step + 1) / steps.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="px-5 py-6 sm:px-7 sm:py-8">
        {/* Étape — Prestation */}
        {stepKey === "Prestation" && (
          <fieldset>
            <legend className="rozan-title text-lg text-[var(--rozan-fg)]">Que souhaitez-vous nettoyer ?</legend>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {activeServices.map((s) => {
                const selectedCard = service === s.slug
                return (
                  <button
                    key={s.slug}
                    type="button"
                    onClick={() => selectService(s.slug)}
                    aria-pressed={selectedCard}
                    className={`flex flex-col items-start gap-1 rounded-2xl border p-4 text-left transition-all ${
                      selectedCard
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

        {/* Étape — Formule (variante + formule + options + total live) */}
        {stepKey === "Formule" && booking && (
          <div className="grid gap-6">
            {/* Variante (prix de base) */}
            <fieldset>
              <legend className="rozan-title text-lg text-[var(--rozan-fg)]">{booking.variantLabel}</legend>
              <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                {booking.variants.map((v) => (
                  <PriceChoice
                    key={v.id}
                    item={v}
                    selected={variantId === v.id}
                    type="radio"
                    onSelect={() => setVariantId(v.id)}
                    showBase
                  />
                ))}
              </div>
            </fieldset>

            {/* Formule (surcoût) */}
            {booking.formulas && booking.formulas.length > 0 && (
              <fieldset>
                <legend className="rozan-title text-base text-[var(--rozan-fg)]">{booking.formulaLabel ?? "Formule"}</legend>
                <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
                  {booking.formulas.map((f) => (
                    <PriceChoice key={f.id} item={f} selected={formulaId === f.id} type="radio" onSelect={() => setFormulaId(f.id)} />
                  ))}
                </div>
              </fieldset>
            )}

            {/* Options cumulables */}
            {booking.options.length > 0 && (
              <fieldset>
                <legend className="rozan-title text-base text-[var(--rozan-fg)]">Options</legend>
                <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                  {booking.options.map((o) => (
                    <PriceChoice key={o.id} item={o} selected={optionIds.includes(o.id)} type="checkbox" onSelect={() => toggleOption(o.id)} />
                  ))}
                </div>
              </fieldset>
            )}

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[var(--rozan-fg)]">Précisions (facultatif)</span>
              <textarea
                rows={2}
                className="w-full rounded-xl border border-[color:var(--rozan-line)] bg-[var(--rozan-surface)] px-4 py-3 text-[var(--rozan-fg)] outline-none transition-colors focus:border-[var(--rozan-accent)] focus:ring-2 focus:ring-[color:var(--rozan-accent-soft)]"
                placeholder="État, taches particulières, accès…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>

            <TotalBar total={total} priceKnown={priceKnown} isQuoteMode={isQuoteMode} />
          </div>
        )}

        {/* Étape — Photos */}
        {stepKey === "Photos" && (
          <fieldset>
            <legend className="rozan-title text-lg text-[var(--rozan-fg)]">Ajoutez des photos (recommandé)</legend>
            <p className="mt-2 text-sm text-[var(--rozan-muted)]">
              Une ou plusieurs photos aident Rozan à préparer l&apos;intervention. Prises directement depuis
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
            <input ref={fileInput} type="file" accept="image/*" multiple capture="environment" onChange={onFiles} className="hidden" />
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

        {/* Étape — Intervention (adresse + créneau souhaité) */}
        {stepKey === "Intervention" && (
          <fieldset>
            <legend className="rozan-title text-lg text-[var(--rozan-fg)]">Où et quand intervenons-nous ?</legend>
            <div className="mt-5 grid gap-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-[var(--rozan-fg)]">Adresse</span>
                <input className={inputClass} value={address.street} onChange={(e) => setAddress((a) => ({ ...a, street: e.target.value }))} placeholder="N° et rue" autoComplete="street-address" />
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
              <div className="grid grid-cols-2 gap-4">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-[var(--rozan-fg)]">Date souhaitée</span>
                  <input type="date" className={inputClass} value={address.date} onChange={(e) => setAddress((a) => ({ ...a, date: e.target.value }))} />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-[var(--rozan-fg)]">Créneau</span>
                  <select className={inputClass} value={address.slot} onChange={(e) => setAddress((a) => ({ ...a, slot: e.target.value }))}>
                    <option value="">Indifférent</option>
                    <option value="matin">Matin</option>
                    <option value="apres-midi">Après-midi</option>
                  </select>
                </label>
              </div>
              <p className="text-xs text-[var(--rozan-muted)]">
                La date et le créneau sont des préférences : Rozan confirme la disponibilité avec vous.
              </p>
            </div>
          </fieldset>
        )}

        {/* Étape — Coordonnées */}
        {stepKey === "Coordonnées" && (
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

        {/* Étape — Récapitulatif */}
        {stepKey === "Récapitulatif" && booking && (
          <div>
            <h3 className="rozan-title text-lg text-[var(--rozan-fg)]">Récapitulatif</h3>
            <dl className="mt-5 divide-y divide-[color:var(--rozan-line)] rounded-2xl border border-[color:var(--rozan-line)] bg-[var(--rozan-surface-2)] px-4">
              <Row label="Prestation" value={serviceLabel} />
              {selected.map((it) => (
                <Row
                  key={it.id}
                  label={it.label}
                  value={it.amount === null ? "Sur devis" : it.amount === 0 ? "Inclus" : `+ ${formatRozanPrice(it.amount)}`}
                />
              ))}
              <Row label="Photos" value={photos.length > 0 ? `${photos.length} photo(s)` : "Aucune"} />
              <Row label="Adresse" value={[address.street, address.zip, address.city].filter(Boolean).join(", ") || "—"} />
              <Row label="Créneau" value={[address.date, address.slot].filter(Boolean).join(" · ") || "À convenir"} />
              <Row label="Contact" value={`${contact.firstName} ${contact.lastName}`.trim() || "—"} />
              <Row label="Téléphone" value={contact.phone || "—"} />
              <Row label="E-mail" value={contact.email || "—"} />
            </dl>
            <TotalBar total={total} priceKnown={priceKnown} isQuoteMode={isQuoteMode} className="mt-5" />
          </div>
        )}

        {/* Étape — Acompte (mode réservation uniquement) */}
        {stepKey === "Acompte" && (
          <div>
            <h3 className="rozan-title text-lg text-[var(--rozan-fg)]">Confirmer avec un acompte</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--rozan-muted)]">
              Un acompte confirme votre réservation et bloque votre créneau. Le solde est réglé après
              l&apos;intervention, une fois le résultat validé.
            </p>

            <div className="mt-5 rounded-2xl border border-[color:var(--rozan-line)] bg-[var(--rozan-surface-2)] p-5">
              <div className="flex items-center justify-between text-sm text-[var(--rozan-muted)]">
                <span>Total estimé</span>
                <span className="font-medium text-[var(--rozan-fg)]">{priceKnown ? formatRozanPrice(total) : "Sur devis"}</span>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-[color:var(--rozan-line)] pt-3">
                <span className="rozan-title text-base text-[var(--rozan-fg)]">
                  Acompte {ROZAN_DEPOSIT.type === "percentage" ? `(${ROZAN_DEPOSIT.value} %)` : ""}
                </span>
                <span className="rozan-title text-xl text-[var(--rozan-accent)]">
                  {priceKnown ? formatRozanPrice(deposit) : "—"}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between text-sm text-[var(--rozan-muted)]">
                <span>Solde après intervention</span>
                <span>{priceKnown ? formatRozanPrice(Math.max(0, total - deposit)) : "—"}</span>
              </div>
            </div>

            <ul className="mt-4 grid gap-2 text-xs text-[var(--rozan-muted)]">
              <li className="flex items-center gap-2">
                <ShieldCheck className="size-4 flex-none text-[var(--rozan-accent)]" aria-hidden="true" />
                Paiement sécurisé par Stripe
              </li>
              <li className="flex items-center gap-2">
                <Lock className="size-4 flex-none text-[var(--rozan-accent)]" aria-hidden="true" />
                Aucune donnée bancaire stockée par Rozan
              </li>
            </ul>
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

        {step < steps.length - 1 ? (
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
            onClick={finish}
            disabled={submitting}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-[var(--rozan-accent)] px-6 text-sm font-semibold text-white transition-colors hover:bg-[var(--rozan-accent-strong)] disabled:opacity-60"
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : isQuoteMode ? (
              <Check className="size-4" aria-hidden="true" />
            ) : (
              <CreditCard className="size-4" aria-hidden="true" />
            )}
            {isQuoteMode
              ? "Envoyer ma demande de devis"
              : priceKnown
                ? `Payer ${formatRozanPrice(deposit)} d'acompte`
                : "Confirmer la réservation"}
          </button>
        )}
      </div>
    </div>
  )
}

/** Barre de total réutilisée (config + récap). */
function TotalBar({
  total,
  priceKnown,
  isQuoteMode,
  className = "",
}: {
  total: number
  priceKnown: boolean
  isQuoteMode: boolean
  className?: string
}) {
  return (
    <div className={`rounded-2xl border border-[color:var(--rozan-accent)] bg-[var(--rozan-accent-soft)] px-5 py-4 ${className}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--rozan-fg)]">
          {isQuoteMode ? "Tarif" : "Total estimé"}
        </span>
        <span className="rozan-title text-xl text-[var(--rozan-fg)]">
          {isQuoteMode ? "Sur devis" : priceKnown ? formatRozanPrice(total) : "Sur devis"}
        </span>
      </div>
      {ROZAN_PRICING_IS_DEMO && !isQuoteMode && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-snug text-[var(--rozan-muted)]">
          <Info className="mt-px size-3.5 flex-none" aria-hidden="true" />
          Tarifs indicatifs, non contractuels — la grille définitive de Rozan sera appliquée.
        </p>
      )}
      {isQuoteMode && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-snug text-[var(--rozan-muted)]">
          <Info className="mt-px size-3.5 flex-none" aria-hidden="true" />
          Surface variable : Rozan établit un devis précis après votre demande.
        </p>
      )}
    </div>
  )
}

/** Carte de choix tarifé (variante / formule / option). */
function PriceChoice({
  item,
  selected,
  type,
  onSelect,
  showBase = false,
}: {
  item: RozanPriceItem
  selected: boolean
  type: "radio" | "checkbox"
  onSelect: () => void
  showBase?: boolean
}) {
  const priceText =
    item.amount === null
      ? "Sur devis"
      : item.amount === 0
        ? "Inclus"
        : `${showBase ? "" : "+ "}${formatRozanPrice(item.amount)}`

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex items-start justify-between gap-3 rounded-2xl border p-4 text-left transition-all ${
        selected
          ? "border-[var(--rozan-accent)] bg-[var(--rozan-accent-soft)]"
          : "border-[color:var(--rozan-line)] bg-[var(--rozan-surface)] hover:border-[var(--rozan-accent)]"
      }`}
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-[var(--rozan-fg)]">{item.label}</span>
        {item.description && <span className="mt-0.5 block text-xs leading-snug text-[var(--rozan-muted)]">{item.description}</span>}
        <span className="mt-1 block text-sm font-medium text-[var(--rozan-accent)]">{priceText}</span>
      </span>
      <span
        className={`mt-0.5 inline-flex size-5 flex-none items-center justify-center border transition-colors ${
          type === "radio" ? "rounded-full" : "rounded-md"
        } ${selected ? "border-[var(--rozan-accent)] bg-[var(--rozan-accent)] text-white" : "border-[color:var(--rozan-line)] text-transparent"}`}
        aria-hidden="true"
      >
        <Check className="size-3.5" />
      </span>
    </button>
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
