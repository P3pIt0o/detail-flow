"use client"

import { useRef, useState } from "react"
import { upload } from "@vercel/blob/client"
import { Loader2, Trash2, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { saveHeroImage } from "@/app/admin/page-publique/actions"
import { heroImagePrefix, resolveHeroImageSrc } from "@/lib/public-page/hero-image"
import { getTenantHeroImage } from "@/lib/tenant-hero"

const ALLOWED_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"])
const MAX_IMAGE_BYTES = 6 * 1024 * 1024 // 6 Mo

/**
 * Photo de la bannière : « Choisir une photo » ou glisser-déposer, upload direct
 * navigateur → Blob PRIVÉ (préfixe imposé par le serveur), puis enregistrement
 * immédiat via saveHeroImage pour que l'aperçu se recharge.
 */
export function HeroImageField({
  initialValue,
  companyId,
  slug,
  onSaved,
}: {
  initialValue: string | null
  companyId: number
  slug: string
  onSaved: (message: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(initialValue)
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function persist(next: string | null, message: string) {
    const res = await saveHeroImage(next)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setValue(next)
    onSaved(message)
  }

  async function handleFile(file: File) {
    setError(null)
    if (!ALLOWED_TYPES.has(file.type)) {
      setError("Format non supporté (JPG, PNG ou WEBP uniquement).")
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Image trop lourde (6 Mo maximum).")
      return
    }
    setBusy(true)
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg"
      const result = await upload(`${heroImagePrefix(companyId)}hero-${Date.now()}.${ext}`, file, {
        access: "private",
        handleUploadUrl: "/api/admin/hero-image",
      })
      await persist(result.pathname, "Photo de la bannière enregistrée.")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de l'envoi de l'image.")
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setError(null)
    setBusy(true)
    try {
      await persist(null, "Photo de la bannière retirée : image par défaut rétablie.")
    } finally {
      setBusy(false)
    }
  }

  const src = resolveHeroImageSrc(value, slug) ?? getTenantHeroImage(slug)

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-foreground">Photo de la bannière</span>
      <div
        className={`flex flex-col gap-3 rounded-xl border border-dashed p-3 sm:flex-row sm:items-center ${
          dragOver ? "border-primary bg-primary/5" : "border-border"
        }`}
        onDragOver={(e) => {
          e.preventDefault()
          if (!busy) setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const file = e.dataTransfer.files?.[0]
          if (file && !busy) void handleFile(file)
        }}
      >
        <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-lg border border-border bg-muted sm:w-40">
          {/* eslint-disable-next-line @next/next/no-img-element -- miniature d'une route privée */}
          <img src={src} alt="Aperçu de la photo de la bannière" className={`size-full object-cover ${busy ? "opacity-50" : ""}`} />
          <span className="absolute bottom-1 left-1 rounded bg-background/80 px-1.5 py-0.5 text-[11px] font-medium text-foreground">
            {busy ? "Envoi…" : value ? "Image actuelle" : "Image par défaut"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={value ? "outline" : "default"}
            size="sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Upload className="mr-1 h-4 w-4" aria-hidden="true" />
            )}
            {busy ? "Envoi…" : value ? "Remplacer" : "Choisir une photo"}
          </Button>
          {value && !busy && (
            <Button type="button" variant="ghost" size="sm" onClick={() => void remove()}>
              <Trash2 className="mr-1 h-4 w-4 text-destructive" aria-hidden="true" />
              Retirer
            </Button>
          )}
          {!value && !busy && (
            <span className="hidden text-xs text-muted-foreground lg:inline">ou glissez-déposez une image ici</span>
          )}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        aria-label="Choisir une photo de bannière"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleFile(file)
          e.target.value = ""
        }}
      />
      <p className="mt-1 text-xs text-muted-foreground">JPG, PNG ou WEBP, 6 Mo maximum. Format paysage conseillé.</p>
      {error && (
        <p className="mt-1 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
