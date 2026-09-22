"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Save, Rocket, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { savePublicPageConfig, publishPublicPage } from "@/app/admin/page-publique/actions"
import { LivePreview } from "./live-preview"

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
const labelClass = "mb-1.5 block text-sm font-medium text-foreground"
const cardClass = "rounded-2xl border border-border bg-card p-5"
const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

export type ConfigEditorInitial = {
  layoutVariant: string | null
  heroImageUrl: string | null
  heroImagePosition: string | null
  heroOverlay: number | null
  accentPrimary: string | null
  accentSecondary: string | null
  theme: "light" | "dark" | "auto"
  showGallery: boolean
  showReviews: boolean
  showAbout: boolean
  interventionZone: string | null
  depositRuleText: string | null
  cancellationPolicy: string | null
  seoIndexable: boolean
  isPublished: boolean
}

export function ConfigEditor({
  slug,
  previewPath,
  initial,
}: {
  slug: string
  previewPath: string
  initial: ConfigEditorInitial
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [publishing, startPublish] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [published, setPublished] = useState(initial.isPublished)

  // État local du formulaire (contrôlé) — repli sur des valeurs par défaut sûres.
  const [accentPrimary, setAccentPrimary] = useState(initial.accentPrimary ?? "")
  const [accentSecondary, setAccentSecondary] = useState(initial.accentSecondary ?? "")
  const [heroImageUrl, setHeroImageUrl] = useState(initial.heroImageUrl ?? "")
  const [showAbout, setShowAbout] = useState(initial.showAbout)
  const [showGallery, setShowGallery] = useState(initial.showGallery)
  const [showReviews, setShowReviews] = useState(initial.showReviews)
  const [interventionZone, setInterventionZone] = useState(initial.interventionZone ?? "")
  const [depositRuleText, setDepositRuleText] = useState(initial.depositRuleText ?? "")
  const [cancellationPolicy, setCancellationPolicy] = useState(initial.cancellationPolicy ?? "")
  const [seoIndexable, setSeoIndexable] = useState(initial.seoIndexable)

  function save() {
    setError(null)
    setNotice(null)
    if (accentPrimary && !HEX_RE.test(accentPrimary)) {
      setError("Couleur principale : format hexadécimal attendu (ex. #2563eb).")
      return
    }
    if (accentSecondary && !HEX_RE.test(accentSecondary)) {
      setError("Couleur secondaire : format hexadécimal attendu (ex. #1e293b).")
      return
    }

    startTransition(async () => {
      const fd = new FormData()
      fd.set("accentPrimary", accentPrimary)
      fd.set("accentSecondary", accentSecondary)
      fd.set("heroImageUrl", heroImageUrl)
      if (showAbout) fd.set("showAbout", "on")
      if (showGallery) fd.set("showGallery", "on")
      if (showReviews) fd.set("showReviews", "on")
      fd.set("interventionZone", interventionZone)
      fd.set("depositRuleText", depositRuleText)
      fd.set("cancellationPolicy", cancellationPolicy)
      if (seoIndexable) fd.set("seoIndexable", "on")

      const res = await savePublicPageConfig(fd)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setNotice("Modifications enregistrées.")
      setReloadKey((k) => k + 1)
      router.refresh()
    })
  }

  function publish() {
    setError(null)
    setNotice(null)
    startPublish(async () => {
      const res = await publishPublicPage()
      if (!res.ok) {
        setError(res.error)
        return
      }
      setPublished(true)
      setNotice("Page publiée.")
      setReloadKey((k) => k + 1)
      router.refresh()
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
      {/* Colonne édition */}
      <div className="space-y-6">
        {/* Apparence */}
        <section className={cardClass}>
          <h2 className="mb-4 text-base font-semibold text-foreground">Apparence</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <ColorField id="accentPrimary" label="Couleur principale" value={accentPrimary} onChange={setAccentPrimary} />
            <ColorField
              id="accentSecondary"
              label="Couleur secondaire"
              value={accentSecondary}
              onChange={setAccentSecondary}
            />
          </div>
        </section>

        {/* Hero */}
        <section className={cardClass}>
          <h2 className="mb-4 text-base font-semibold text-foreground">Bannière (hero)</h2>
          <div>
            <label htmlFor="heroImageUrl" className={labelClass}>
              Image de fond (URL https ou chemin interne)
            </label>
            <input
              id="heroImageUrl"
              type="text"
              value={heroImageUrl}
              onChange={(e) => setHeroImageUrl(e.target.value)}
              placeholder="/hero.png ou https://…"
              className={inputClass}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Laissez vide pour conserver l&apos;image par défaut de votre site.
            </p>
          </div>
        </section>

        {/* Sections */}
        <section className={cardClass}>
          <h2 className="mb-1 text-base font-semibold text-foreground">Sections affichées</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Désactivez une section pour la masquer de votre page publique.
          </p>
          <div className="space-y-2">
            <ToggleRow id="showAbout" label="Présentation" checked={showAbout} onChange={setShowAbout} />
            <ToggleRow id="showGallery" label="Réalisations / galerie" checked={showGallery} onChange={setShowGallery} />
            <ToggleRow id="showReviews" label="Avis clients" checked={showReviews} onChange={setShowReviews} />
          </div>
        </section>

        {/* Informations pratiques */}
        <section className={cardClass}>
          <h2 className="mb-4 text-base font-semibold text-foreground">Informations pratiques</h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="interventionZone" className={labelClass}>
                Zone d&apos;intervention
              </label>
              <input
                id="interventionZone"
                type="text"
                value={interventionZone}
                onChange={(e) => setInterventionZone(e.target.value)}
                placeholder="Ex. Lyon et 30 km alentour"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="depositRuleText" className={labelClass}>
                Règle d&apos;acompte
              </label>
              <textarea
                id="depositRuleText"
                value={depositRuleText}
                onChange={(e) => setDepositRuleText(e.target.value)}
                rows={2}
                placeholder="Ex. Un acompte de 30 % est demandé à la réservation."
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="cancellationPolicy" className={labelClass}>
                Politique d&apos;annulation
              </label>
              <textarea
                id="cancellationPolicy"
                value={cancellationPolicy}
                onChange={(e) => setCancellationPolicy(e.target.value)}
                rows={2}
                placeholder="Ex. Annulation gratuite jusqu'à 24 h avant le rendez-vous."
                className={inputClass}
              />
            </div>
          </div>
        </section>

        {/* SEO + publication */}
        <section className={cardClass}>
          <h2 className="mb-4 text-base font-semibold text-foreground">Référencement &amp; publication</h2>
          <ToggleRow
            id="seoIndexable"
            label="Autoriser l'indexation par les moteurs de recherche"
            checked={seoIndexable}
            onChange={setSeoIndexable}
          />
          <div className="mt-4 flex items-center gap-2 text-sm">
            {published ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">
                <CheckCircle2 className="size-4" aria-hidden="true" />
                Page publiée
              </span>
            ) : (
              <span className="rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground">
                Non publiée
              </span>
            )}
          </div>
        </section>

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
          <Button onClick={save} disabled={pending || publishing}>
            {pending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            Enregistrer
          </Button>
          <Button variant="outline" onClick={publish} disabled={pending || publishing}>
            {publishing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Rocket className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            {published ? "Republier" : "Publier"}
          </Button>
        </div>
      </div>

      {/* Colonne aperçu */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <LivePreview previewPath={previewPath} reloadKey={reloadKey} />
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Aperçu de <span className="font-mono">{previewPath}</span> — enregistrez pour actualiser.
        </p>
      </div>
    </div>
  )
}

function ColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
}) {
  const valid = value === "" || HEX_RE.test(value)
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} (sélecteur)`}
          value={HEX_RE.test(value) ? value : "#000000"}
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

function ToggleRow({
  id,
  label,
  checked,
  onChange,
}: {
  id: string
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-3 py-1">
      <span className="text-sm text-foreground">{label}</span>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 cursor-pointer accent-[var(--primary)]"
      />
    </label>
  )
}
