"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Save, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { saveSellerBillingProfile } from "@/app/admin/(dashboard)/parametres/actions"
import { getCountryProfile, SUPPORTED_COUNTRIES } from "@/lib/billing/country-profiles"

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
  defaultCurrency: string
}

const CURRENCY_SUGGESTION: Record<string, string> = { FR: "EUR", BE: "EUR", CH: "CHF" }

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
  const [currency, setCurrency] = useState(props.defaultCurrency)

  // Profil pays => libellés (SIRET / BCE / UID) adaptés au pays du VENDEUR.
  const profile = useMemo(() => getCountryProfile(country), [country])

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
              <option value="unknown">À préciser</option>
              <option value="subject">Assujetti à la TVA</option>
              <option value="exempt">Non assujetti / franchise</option>
            </select>
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
  )
}
