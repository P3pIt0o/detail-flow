"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Save, CheckCircle2, AlertCircle, ExternalLink, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { saveSellerBillingProfile } from "@/app/admin/(dashboard)/parametres/actions"
import { getCountryProfile, SUPPORTED_COUNTRIES } from "@/lib/billing/country-profiles"
import { resolveRegulatoryGuidance, type RegulatoryStatus } from "@/lib/billing/regulatory-guidance"

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
const labelClass = "mb-1.5 block text-sm font-medium text-foreground"
const cardClass = "rounded-2xl border border-border bg-card p-5"

type Props = {
  country: string
  confirmed: boolean
  legalForm: string
  legalRegistrationNumber: string
  vatNumber: string
  vatStatus: string
  frBusinessCategory: string
  defaultCurrency: string
}

// Catégorie déclarée pour le calendrier de facturation électronique (FR only).
// Choix EXPLICITE de l'utilisateur — jamais déduit (forme juridique, CA, effectif…).
const FR_BUSINESS_CATEGORIES: { value: string; label: string }[] = [
  { value: "unknown", label: "Je ne sais pas" },
  { value: "micro", label: "Micro-entreprise" },
  { value: "pme", label: "PME" },
  { value: "eti", label: "ETI" },
  { value: "ge", label: "Grande entreprise" },
]

const CURRENCY_SUGGESTION: Record<string, string> = { FR: "EUR", BE: "EUR", CH: "CHF" }

// Libellé + style de badge par statut consultatif. Vocabulaire neutre imposé.
const REGULATORY_STATUS_META: Record<RegulatoryStatus, { label: string; badgeClass: string }> = {
  INFORMATION: { label: "Information", badgeClass: "bg-primary/10 text-foreground" },
  TO_COMPLETE: { label: "À compléter", badgeClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  REVIEW_REQUIRED: { label: "À vérifier", badgeClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  ACTION_REQUIRED: { label: "Action requise", badgeClass: "bg-destructive/10 text-destructive" },
}

export function SellerBillingProfile(props: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [country, setCountry] = useState((props.country || "FR").toUpperCase())
  const [legalForm, setLegalForm] = useState(props.legalForm)
  const [legalNumber, setLegalNumber] = useState(props.legalRegistrationNumber)
  const [vatNumber, setVatNumber] = useState(props.vatNumber)
  const [vatStatus, setVatStatus] = useState(props.vatStatus || "unknown")
  const [frBusinessCategory, setFrBusinessCategory] = useState(props.frBusinessCategory || "unknown")
  const [currency, setCurrency] = useState(props.defaultCurrency)

  // Profil pays => libellés (SIRET / BCE / UID) adaptés au pays du VENDEUR.
  const profile = useMemo(() => getCountryProfile(country), [country])

  // Informations réglementaires CONSULTATIVES : moteur pur alimenté UNIQUEMENT
  // par le profil vendeur (aucune facture / client / taxTreatment / montant).
  // Recalculé sur les valeurs enregistrées (props.*) pour rester cohérent avec
  // ce qui est confirmé, pas avec une saisie non sauvegardée.
  const guidance = useMemo(
    () =>
      resolveRegulatoryGuidance({
        country: props.country,
        confirmed: props.confirmed,
        vatStatus: props.vatStatus,
        frBusinessCategory: props.frBusinessCategory,
      }),
    [props.country, props.confirmed, props.vatStatus, props.frBusinessCategory],
  )

  function onCountryChange(next: string) {
    setCountry(next)
    // Propose la devise du pays uniquement si aucune devise déjà saisie.
    if (!currency.trim()) setCurrency(CURRENCY_SUGGESTION[next] ?? "")
  }

  function save() {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const res = await saveSellerBillingProfile({
        country,
        legalForm,
        legalRegistrationNumber: legalNumber,
        vatNumber,
        vatStatus,
        frBusinessCategory,
        defaultCurrency: currency || CURRENCY_SUGGESTION[country] || "EUR",
      })
      if (!res.ok) {
        setError(res.error || "Erreur lors de l'enregistrement.")
        return
      }
      setNotice("Profil de facturation enregistré.")
      router.refresh()
    })
  }

  return (
    <div className="space-y-5">
      <div className={cardClass}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">Profil légal de l&apos;entreprise</h2>
        {props.confirmed ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Informations enregistrées
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
            <AlertCircle className="h-3.5 w-3.5" /> À compléter
          </span>
        )}
      </div>

      {!props.confirmed && (
        <p className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-foreground text-pretty">
          Confirmez le pays et les informations légales de votre entreprise pour sécuriser votre facturation.
        </p>
      )}

      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Pays de l&apos;entreprise</label>
            <select value={country} onChange={(e) => onCountryChange(e.target.value)} className={inputClass}>
              {SUPPORTED_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Forme juridique</label>
            <input
              value={legalForm}
              onChange={(e) => setLegalForm(e.target.value)}
              className={inputClass}
              placeholder="SASU, SPRL, Sàrl…"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>{profile.sellerLegalIdLabel}</label>
            <input
              value={legalNumber}
              onChange={(e) => setLegalNumber(e.target.value)}
              className={inputClass}
              placeholder={
                country === "BE" ? "0123.456.789" : country === "CH" ? "CHE-123.456.789" : "123 456 789 00012"
              }
            />
          </div>
          <div>
            <label className={labelClass}>{profile.vatNumberLabel}</label>
            <input
              value={vatNumber}
              onChange={(e) => setVatNumber(e.target.value)}
              className={inputClass}
              placeholder={
                country === "BE" ? "BE0123456789" : country === "CH" ? "CHE-123.456.789" : "FR12345678901"
              }
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Situation TVA</label>
            <select value={vatStatus} onChange={(e) => setVatStatus(e.target.value)} className={inputClass}>
              <option value="subject">TVA facturée / redevable</option>
              <option value="exempt">TVA non facturée / franchise ou exonération</option>
              <option value="unknown">À préciser</option>
            </select>
            <p className="mt-1 text-xs text-muted-foreground text-pretty">
              Cette information ne détermine pas à elle seule vos obligations de facturation électronique.
            </p>
          </div>
          <div>
            <label className={labelClass}>Devise de facturation</label>
            <input
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              className={inputClass}
              placeholder={CURRENCY_SUGGESTION[country] ?? "EUR"}
              maxLength={3}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Suggestion : {CURRENCY_SUGGESTION[country] ?? "EUR"}. Modifiable selon vos besoins.
            </p>
          </div>
        </div>

        {/* Catégorie entreprise : UNIQUEMENT pour la France. Rien pour BE/CH. */}
        {country === "FR" && (
          <div>
            <label className={labelClass}>Catégorie pour le calendrier de facturation électronique</label>
            <select
              value={frBusinessCategory}
              onChange={(e) => setFrBusinessCategory(e.target.value)}
              className={inputClass}
            >
              {FR_BUSINESS_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground text-pretty">
              Choisissez votre catégorie déclarée. DetailFlow ne la détermine pas automatiquement.
            </p>
          </div>
        )}

        {profile.regulatoryLinks.length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {profile.regulatoryLinks.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" /> {link.label}
              </a>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {notice && (
        <div className="mt-4 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-foreground">
          {notice}
        </div>
      )}

      <Button onClick={save} disabled={pending} className="mt-5">
        {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        Enregistrer et confirmer le profil
      </Button>
      </div>

      {/* Carte CONSULTATIVE — informations sur la facturation électronique.
          Uniquement dans les paramètres. Aucune décision, aucune conformité. */}
      <section className={cardClass} aria-labelledby="reg-guidance-title">
        <div className="mb-4 flex items-center gap-2">
          <Info className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h2 id="reg-guidance-title" className="text-base font-semibold text-foreground">
            Informations sur la facturation électronique
          </h2>
        </div>
        <p className="mb-4 text-xs text-muted-foreground text-pretty">
          Ces informations sont fournies à titre indicatif et ne constituent ni un conseil fiscal ni une garantie de
          conformité. Vérifiez votre situation selon les sources officielles.
        </p>
        <ul className="space-y-3">
          {guidance.map((g, i) => {
            const meta = REGULATORY_STATUS_META[g.status]
            return (
              <li key={i} className="rounded-lg border border-border bg-background p-4">
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.badgeClass}`}>
                    {meta.label}
                  </span>
                  <h3 className="text-sm font-medium text-foreground text-pretty">{g.title}</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed text-pretty">{g.message}</p>
                {g.deadline && (
                  <p className="mt-1.5 text-xs font-medium text-foreground">Échéance indicative : {g.deadline}</p>
                )}
                {g.source && (
                  <a
                    href={g.source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    <ExternalLink className="h-3 w-3" aria-hidden="true" /> {g.source.label}
                  </a>
                )}
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
