"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Save, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { saveCompanySite } from "@/app/admin/(dashboard)/parametres/branding-actions"

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
const labelClass = "mb-1.5 block text-sm font-medium text-foreground"
const cardClass = "rounded-2xl border border-border bg-card p-5"

const DEFAULT_PRIMARY = "#2563eb"
const DEFAULT_SECONDARY = "#1e293b"
const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

type Props = {
  /** Couleur principale enregistrée (hex) ou null. */
  brandPrimary: string | null
  /** Couleur secondaire enregistrée (hex) ou null. */
  brandSecondary: string | null
}

/**
 * Onglet "Apparence" : personnalisation des couleurs de marque du site public.
 * Réutilise l'action `saveCompanySite` (qui ne met à jour que les champs présents,
 * donc CGV et logo sont préservés). La réinitialisation efface les couleurs
 * personnalisées : le site public retombe alors sur le thème par défaut.
 */
export function AppearanceSettings({ brandPrimary, brandSecondary }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [primary, setPrimary] = useState(brandPrimary || DEFAULT_PRIMARY)
  const [secondary, setSecondary] = useState(brandSecondary || DEFAULT_SECONDARY)
  const [isCustom, setIsCustom] = useState(Boolean(brandPrimary || brandSecondary))

  const primaryValid = HEX_RE.test(primary)
  const secondaryValid = HEX_RE.test(secondary)

  function persist(values: { primary: string; secondary: string }, resetting: boolean) {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.append("brandPrimary", values.primary)
      fd.append("brandSecondary", values.secondary)

      const res = await saveCompanySite(fd)
      if (!res.ok) {
        setError(res.error || "Erreur lors de l'enregistrement.")
        return
      }
      setIsCustom(!resetting)
      setNotice(resetting ? "Couleurs réinitialisées au thème par défaut." : "Couleurs enregistrées.")
      router.refresh()
    })
  }

  function save() {
    if (!primaryValid || !secondaryValid) {
      setError("Couleur invalide. Utilisez un format hexadécimal, ex. #2563eb.")
      return
    }
    persist({ primary, secondary }, false)
  }

  function reset() {
    setPrimary(DEFAULT_PRIMARY)
    setSecondary(DEFAULT_SECONDARY)
    // Envoi de valeurs vides : les couleurs personnalisées sont effacées côté serveur.
    persist({ primary: "", secondary: "" }, true)
  }

  return (
    <div className="space-y-6">
      <div className={cardClass}>
        <h2 className="mb-1 text-base font-semibold text-foreground">Couleurs de marque</h2>
        <p className="mb-4 text-sm text-muted-foreground text-pretty">
          Personnalisez la couleur principale (boutons, liens, éléments actifs) et la couleur secondaire de votre site
          public. Ces couleurs s&apos;appliquent immédiatement à votre site après enregistrement.
        </p>

        <div className="grid gap-5 sm:grid-cols-2">
          <ColorField
            id="brandPrimary"
            label="Couleur principale"
            value={primary}
            valid={primaryValid}
            onChange={setPrimary}
          />
          <ColorField
            id="brandSecondary"
            label="Couleur secondaire"
            value={secondary}
            valid={secondaryValid}
            onChange={setSecondary}
          />
        </div>

        {/* Aperçu en direct */}
        <div className="mt-5 rounded-lg border border-border p-4">
          <p className="mb-3 text-xs font-medium text-muted-foreground">Aperçu en direct</p>
          <div className="flex flex-wrap items-center gap-3">
            <span
              className="inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold"
              style={{ backgroundColor: primaryValid ? primary : DEFAULT_PRIMARY, color: "#ffffff" }}
            >
              Réserver
            </span>
            <span
              className="inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold"
              style={{ backgroundColor: secondaryValid ? secondary : DEFAULT_SECONDARY, color: "#ffffff" }}
            >
              En savoir plus
            </span>
            <span
              className="text-sm font-semibold underline underline-offset-4"
              style={{ color: primaryValid ? primary : DEFAULT_PRIMARY }}
            >
              Un lien coloré
            </span>
          </div>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          {isCustom
            ? "Des couleurs personnalisées sont actuellement appliquées."
            : "Aucune couleur personnalisée : le thème par défaut est utilisé."}
        </p>
      </div>

      {error && (
        <div
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-foreground">
          {notice}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Button onClick={save} disabled={pending}>
          {pending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          Enregistrer
        </Button>
        <Button variant="outline" onClick={reset} disabled={pending}>
          <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
          Réinitialiser
        </Button>
      </div>
    </div>
  )
}

function ColorField({
  id,
  label,
  value,
  valid,
  onChange,
}: {
  id: string
  label: string
  value: string
  valid: boolean
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} (sélecteur)`}
          value={valid ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-border bg-background p-1"
        />
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#2563eb"
          className={inputClass}
          aria-invalid={!valid}
        />
      </div>
      {!valid && <p className="mt-1 text-xs text-destructive">Format hexadécimal attendu, ex. #2563eb.</p>}
    </div>
  )
}
