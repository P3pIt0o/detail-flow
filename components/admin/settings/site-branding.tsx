"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Save, Upload, ImageIcon, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { saveCompanySite } from "@/app/admin/(dashboard)/parametres/branding-actions"

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
const labelClass = "mb-1.5 block text-sm font-medium text-foreground"
const cardClass = "rounded-2xl border border-border bg-card p-5"

type Props = {
  /** Pathname du logo actuellement enregistré (Blob privé), ou null. */
  logoPathname: string | null
  /** CGV actuelles de l'entreprise. */
  cgv: string
  /** Couleur principale enregistrée (hex) ou null. */
  brandPrimary: string | null
  /** Couleur secondaire enregistrée (hex) ou null. */
  brandSecondary: string | null
}

const DEFAULT_PRIMARY = "#2563eb"
const DEFAULT_SECONDARY = "#1e293b"
const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

export function SiteBranding({
  logoPathname: initialLogo,
  cgv: initialCgv,
  brandPrimary: initialPrimary,
  brandSecondary: initialSecondary,
}: Props) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Fichier en attente d'enregistrement + aperçu local (avant upload serveur).
  const [file, setFile] = useState<File | null>(null)
  const [localPreview, setLocalPreview] = useState<string | null>(null)
  const [savedLogo, setSavedLogo] = useState<string | null>(initialLogo)
  const [removeLogo, setRemoveLogo] = useState(false)
  const [cgv, setCgv] = useState(initialCgv)
  const [primary, setPrimary] = useState(initialPrimary || DEFAULT_PRIMARY)
  const [secondary, setSecondary] = useState(initialSecondary || DEFAULT_SECONDARY)
  const primaryValid = HEX_RE.test(primary)
  const secondaryValid = HEX_RE.test(secondary)

  // Aperçu : fichier choisi (local) > logo enregistré (route admin) > vide.
  const previewSrc = localPreview
    ? localPreview
    : !removeLogo && savedLogo
      ? `/api/admin/logo?pathname=${encodeURIComponent(savedLogo)}`
      : null

  function onPick(f: File) {
    setError(null)
    if (!f.type.startsWith("image/")) {
      setError("Le logo doit être une image.")
      return
    }
    if (f.size > 2 * 1024 * 1024) {
      setError("Logo trop lourd (max 2 Mo).")
      return
    }
    setFile(f)
    setRemoveLogo(false)
    setLocalPreview(URL.createObjectURL(f))
    setNotice("Logo prêt. Enregistrez pour l'appliquer.")
  }

  function clearLogo() {
    setFile(null)
    setLocalPreview(null)
    setRemoveLogo(true)
    setNotice("Logo retiré. Enregistrez pour confirmer.")
  }

  function save() {
    setError(null)
    setNotice(null)
    if (!primaryValid || !secondaryValid) {
      setError("Couleur invalide. Utilisez un format hexadécimal, ex. #2563eb.")
      return
    }
    startTransition(async () => {
      const fd = new FormData()
      fd.append("cgv", cgv)
      fd.append("brandPrimary", primary)
      fd.append("brandSecondary", secondary)
      if (file) fd.append("logo", file)
      if (removeLogo && !file) fd.append("removeLogo", "1")

      const res = await saveCompanySite(fd)
      if (!res.ok) {
        setError(res.error || "Erreur lors de l'enregistrement.")
        return
      }
      // Synchronise l'état local avec ce qui est désormais en base.
      setSavedLogo(res.logoPathname ?? null)
      setFile(null)
      setLocalPreview(null)
      setRemoveLogo(false)
      setNotice("Personnalisation enregistrée.")
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {/* Logo du site public */}
      <div className={cardClass}>
        <h2 className="mb-1 text-base font-semibold text-foreground">Logo du site public</h2>
        <p className="mb-4 text-sm text-muted-foreground text-pretty">
          Affiché dans l&apos;en-tête et le pied de page de votre site (PNG, JPG ou SVG, max 2 Mo). Sans logo, le nom de
          votre entreprise s&apos;affiche à la place.
        </p>
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-32 items-center justify-center overflow-hidden rounded-lg border border-border bg-background">
            {previewSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewSrc || "/placeholder.svg"} alt="Aperçu du logo" className="max-h-full max-w-full object-contain" />
            ) : (
              <ImageIcon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onPick(f)
              }}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
              {previewSrc ? "Remplacer" : "Téléverser"}
            </Button>
            {previewSrc && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={clearLogo}
              >
                <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" /> Retirer
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Couleurs de marque */}
      <div className={cardClass}>
        <h2 className="mb-1 text-base font-semibold text-foreground">Couleurs de marque</h2>
        <p className="mb-4 text-sm text-muted-foreground text-pretty">
          Personnalisez la couleur principale (boutons, liens) et secondaire de votre site public. Laissez les valeurs
          par défaut si vous n&apos;avez pas de charte précise.
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
        {/* Aperçu */}
        <div className="mt-5 rounded-lg border border-border p-4">
          <p className="mb-3 text-xs font-medium text-muted-foreground">Aperçu</p>
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
          </div>
        </div>
      </div>

      {/* CGV */}
      <div className={cardClass}>
        <h2 className="mb-1 text-base font-semibold text-foreground">Conditions Générales de Vente</h2>
        <p className="mb-4 text-sm text-muted-foreground text-pretty">
          Ce texte est publié sur la page <code className="text-foreground">/cgv</code> de votre site. Laissez vide si
          vos CGV ne sont pas encore prêtes : un message neutre sera affiché.
        </p>
        <label htmlFor="cgv" className={labelClass}>
          Texte des CGV
        </label>
        <textarea
          id="cgv"
          value={cgv}
          onChange={(e) => setCgv(e.target.value)}
          rows={14}
          className={inputClass}
          placeholder={"Article 1 — Objet\n...\n\nArticle 2 — Prestations\n..."}
        />
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-foreground">{notice}</div>
      )}

      <Button onClick={save} disabled={pending}>
        {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="mr-2 h-4 w-4" aria-hidden="true" />}
        Enregistrer
      </Button>
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
