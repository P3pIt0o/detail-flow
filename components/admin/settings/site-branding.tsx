"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Save, Upload, ImageIcon, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { saveCompanySite, saveSocialLinks } from "@/app/admin/(dashboard)/parametres/branding-actions"
import { SOCIAL_KEYS } from "@/app/admin/(dashboard)/parametres/social-config"

const SOCIAL_META: Record<(typeof SOCIAL_KEYS)[number], { label: string; placeholder: string }> = {
  instagram: { label: "Instagram", placeholder: "https://instagram.com/mon-compte" },
  facebook: { label: "Facebook", placeholder: "https://facebook.com/ma-page" },
  youtube: { label: "YouTube", placeholder: "https://youtube.com/@ma-chaine" },
  linkedin: { label: "LinkedIn", placeholder: "https://linkedin.com/company/mon-entreprise" },
  tiktok: { label: "TikTok", placeholder: "https://tiktok.com/@mon-compte" },
}

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
const labelClass = "mb-1.5 block text-sm font-medium text-foreground"
const cardClass = "rounded-2xl border border-border bg-card p-5"

type Props = {
  /** Pathname du logo actuellement enregistré (Blob privé), ou null. */
  logoPathname: string | null
  /** CGV actuelles de l'entreprise. */
  cgv: string
  /** Liens réseaux sociaux actuels de l'entreprise. */
  socialLinks?: Record<string, string> | null
}

export function SiteBranding({ logoPathname: initialLogo, cgv: initialCgv, socialLinks }: Props) {
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

  // Réseaux sociaux (point 16) : une entrée par plateforme supportée.
  const [socials, setSocials] = useState<Record<string, string>>(() =>
    Object.fromEntries(SOCIAL_KEYS.map((k) => [k, socialLinks?.[k] ?? ""])),
  )
  const [socialPending, startSocialTransition] = useTransition()
  const [socialError, setSocialError] = useState<string | null>(null)
  const [socialNotice, setSocialNotice] = useState<string | null>(null)

  function saveSocials() {
    setSocialError(null)
    setSocialNotice(null)
    startSocialTransition(async () => {
      const res = await saveSocialLinks(socials)
      if (!res.ok) {
        setSocialError(res.error || "Erreur lors de l'enregistrement.")
        return
      }
      setSocialNotice("Réseaux sociaux enregistrés.")
      router.refresh()
    })
  }

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
    startTransition(async () => {
      const fd = new FormData()
      fd.append("cgv", cgv)
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

      {/* Réseaux sociaux (point 16) */}
      <div className={cardClass}>
        <h2 className="mb-1 text-base font-semibold text-foreground">Réseaux sociaux</h2>
        <p className="mb-4 text-sm text-muted-foreground text-pretty">
          Ajoutez les liens vers vos réseaux : ils s&apos;afficheront dans le pied de page de votre
          site. Laissez vide pour masquer une plateforme.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {SOCIAL_KEYS.map((key) => (
            <div key={key}>
              <label htmlFor={`social-${key}`} className={labelClass}>
                {SOCIAL_META[key].label}
              </label>
              <input
                id={`social-${key}`}
                type="url"
                inputMode="url"
                value={socials[key] ?? ""}
                onChange={(e) => setSocials((prev) => ({ ...prev, [key]: e.target.value }))}
                placeholder={SOCIAL_META[key].placeholder}
                className={inputClass}
              />
            </div>
          ))}
        </div>
        {socialError && (
          <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
            {socialError}
          </div>
        )}
        {socialNotice && (
          <div className="mt-4 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-foreground">
            {socialNotice}
          </div>
        )}
        <Button onClick={saveSocials} disabled={socialPending} className="mt-4">
          {socialPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          Enregistrer les réseaux sociaux
        </Button>
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


