"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Download, Loader2, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { CopyLinkButton, LinkDisplay } from "@/components/admin/booking-hub/link-actions"
import { btnOutline } from "@/components/admin/booking-hub/styles"
import { TiltCard } from "@/components/digital-card/tilt-card"
import { isHexColor, type DigitalCardSettings, type DigitalCardStyle } from "@/lib/digital-card"
import { saveDigitalCard } from "@/app/admin/(dashboard)/parametres/digital-card-actions"

const inputClass =
  "w-28 rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-foreground focus:border-primary focus:outline-none"
const labelClass = "mb-1.5 block text-sm font-medium text-foreground"

const STYLES: { value: DigitalCardStyle; label: string }[] = [
  { value: "solid", label: "Uni" },
  { value: "gradient", label: "Dégradé" },
  { value: "holographic", label: "Holographique" },
]

type Props = {
  initial: DigitalCardSettings
  name: string
  line: string | null
  logoSrc: string | null
  /** URL publique absolue de `/carte`, calculée côté serveur. */
  cardUrl: string
  slug: string
}

/** Télécharge un QR code PNG 2048 px ou SVG pointant vers la carte. */
async function downloadQr(url: string, kind: "png" | "svg", slug: string) {
  const QR = await import("qrcode")
  const opts = { margin: 2, errorCorrectionLevel: "M" as const }
  const href =
    kind === "png"
      ? await QR.toDataURL(url, { ...opts, width: 2048 })
      : URL.createObjectURL(new Blob([await QR.toString(url, { ...opts, type: "svg" })], { type: "image/svg+xml" }))
  const a = document.createElement("a")
  a.href = href
  a.download = `qr-code-carte-${slug}.${kind}`
  a.click()
  if (kind === "svg") window.setTimeout(() => URL.revokeObjectURL(href), 1000)
}

/** Onglet « Carte digitale » (L45) : couleurs, style, activation, aperçu 3D, lien et QR code. */
export function DigitalCardSettings({ initial, name, line, logoSrc, cardUrl, slug }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [qrError, setQrError] = useState(false)

  const patch = (p: Partial<DigitalCardSettings>) => {
    setValues((v) => ({ ...v, ...p }))
    setNotice(null)
  }
  const colorsValid = isHexColor(values.background) && isHexColor(values.accent)

  const save = () => {
    setError(null)
    setNotice(null)
    if (!colorsValid) {
      setError("Couleur invalide (format #RRGGBB).")
      return
    }
    startTransition(async () => {
      const res = await saveDigitalCard(values)
      if (!res.ok) setError(res.error)
      else {
        setNotice("Carte enregistrée.")
        router.refresh()
      }
    })
  }

  const qr = (kind: "png" | "svg") => {
    setQrError(false)
    downloadQr(cardUrl, kind, slug).catch(() => setQrError(true))
  }

  const colorField = (key: "background" | "accent", label: string) => (
    <div>
      <label htmlFor={`card-${key}`} className={labelClass}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={label}
          value={isHexColor(values[key]) ? values[key] : "#000000"}
          onChange={(e) => patch({ [key]: e.target.value.toUpperCase() })}
          className="h-9 w-10 cursor-pointer rounded-lg border border-border bg-background p-0.5"
        />
        <input
          id={`card-${key}`}
          value={values[key]}
          onChange={(e) => patch({ [key]: e.target.value.trim() })}
          maxLength={7}
          spellCheck={false}
          className={inputClass}
          aria-invalid={!isHexColor(values[key])}
        />
      </div>
    </div>
  )

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,420px)_minmax(0,460px)]">
      <div className="order-2 space-y-5 lg:order-1">
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4">
          <div>
            <p className="text-sm font-medium text-foreground">Carte digitale activée</p>
            <p className="text-sm text-muted-foreground">Désactivée, la page de votre carte n&apos;est plus accessible.</p>
          </div>
          <Switch checked={values.enabled} onCheckedChange={(c) => patch({ enabled: c })} aria-label="Carte digitale activée" />
        </div>

        {colorField("background", "Couleur de fond")}
        {colorField("accent", "Couleur d'accent")}

        <div>
          <span className={labelClass}>Style</span>
          <div role="radiogroup" aria-label="Style" className="inline-flex overflow-hidden rounded-lg border border-border">
            {STYLES.map((s) => (
              <button
                key={s.value}
                type="button"
                role="radio"
                aria-checked={values.style === s.value}
                onClick={() => patch({ style: s.value })}
                className={cn(
                  "px-3.5 py-2 text-sm transition-colors",
                  values.style === s.value ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {notice && <p className="text-sm text-emerald-600">{notice}</p>}
        <Button type="button" onClick={save} disabled={pending} className="w-full sm:w-auto">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
          Enregistrer
        </Button>

        <div className="space-y-3 border-t border-border pt-5">
          <LinkDisplay url={cardUrl} />
          <div className="grid gap-2 sm:flex sm:flex-wrap">
            <CopyLinkButton url={cardUrl} />
            <button type="button" onClick={() => qr("png")} className={btnOutline}>
              <Download className="size-5" aria-hidden="true" />
              Télécharger mon QR code (PNG)
            </button>
            <button type="button" onClick={() => qr("svg")} className={btnOutline}>
              <Download className="size-5" aria-hidden="true" />
              SVG
            </button>
          </div>
          {qrError && (
            <p role="alert" className="text-sm text-destructive">
              Génération du QR code impossible. Réessayez.
            </p>
          )}
        </div>
      </div>

      <div className="order-1 lg:order-2">
        <p className="mb-2 text-sm text-muted-foreground">Aperçu</p>
        <div className="rounded-2xl bg-slate-950 px-6 pb-2 text-slate-100">
          <TiltCard
            name={name}
            line={line}
            logoSrc={logoSrc}
            background={colorsValid ? values.background : initial.background}
            accent={colorsValid ? values.accent : initial.accent}
            cardStyle={values.style}
          />
        </div>
      </div>
    </div>
  )
}
