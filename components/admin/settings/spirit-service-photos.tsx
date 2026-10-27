"use client"

import { useEffect, useRef, useState } from "react"
import { upload } from "@vercel/blob/client"
import { ImageUp, Loader2, RotateCcw, Save, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  resetSpiritServicePhoto,
  saveSpiritServicePhoto,
  type SpiritPhotoView,
} from "@/app/admin/(dashboard)/parametres/spirit-photos-actions"
import { SPIRIT_PHOTO_MAX_BYTES, spiritPhotoUploadPrefix } from "@/components/custom-sites/spirit-acs/service-photos"

const ACCEPT = "image/jpeg,image/png,image/webp"
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }

/**
 * « Photos des prestations » du site Spirit ACS (L32). Aperçu de la carte en
 * local avant enregistrement (rien n'est envoyé avant « Enregistrer ») ; le
 * serveur contrôle le fichier et le ré-encode en WebP ≤ 1600 px.
 */
export function SpiritServicePhotos({ companyId, initialPhotos }: { companyId: number; initialPhotos: SpiritPhotoView[] }) {
  const [photos, setPhotos] = useState(initialPhotos)
  return (
    <section aria-labelledby="spirit-photos-title" className="space-y-4">
      <div>
        <h2 id="spirit-photos-title" className="text-lg font-semibold text-foreground">
          Photos des prestations
        </h2>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          Choisissez la photo de chaque prestation. Elle remplace la photo d&apos;origine partout où elle s&apos;affiche sur
          votre site. Formats acceptés : JPG, PNG ou WebP, 8 Mo maximum.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {photos.map((p) => (
          <PhotoSlot key={p.key} photo={p} companyId={companyId} onSaved={setPhotos} />
        ))}
      </div>
    </section>
  )
}

function PhotoSlot({
  photo,
  companyId,
  onSaved,
}: {
  photo: SpiritPhotoView
  companyId: number
  onSaved: (photos: SpiritPhotoView[]) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview)
  }, [preview])

  function choose(f: File | undefined) {
    setError(null)
    if (!f) return
    if (!EXT[f.type]) return setError("Format non accepté : JPG, PNG ou WebP uniquement.")
    if (f.size > SPIRIT_PHOTO_MAX_BYTES) return setError("Fichier trop volumineux (8 Mo maximum).")
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  function cancel() {
    setFile(null)
    setPreview(null)
    setError(null)
    if (input.current) input.current.value = ""
  }

  async function save() {
    if (!file) return
    setPending(true)
    setError(null)
    try {
      const sent = await upload(`${spiritPhotoUploadPrefix(companyId, photo.key)}${Date.now()}.${EXT[file.type]}`, file, {
        access: "private",
        handleUploadUrl: "/api/admin/spirit-service-photo-upload",
      })
      const res = await saveSpiritServicePhoto(photo.key, sent.pathname)
      if (!res.ok || !res.photos) return setError(res.error ?? "Enregistrement impossible. Réessayez.")
      cancel()
      onSaved(res.photos)
    } catch {
      setError("Envoi impossible. Vérifiez votre connexion puis réessayez.")
    } finally {
      setPending(false)
    }
  }

  async function reset() {
    setPending(true)
    setError(null)
    try {
      const res = await resetSpiritServicePhoto(photo.key)
      if (!res.ok || !res.photos) return setError(res.error ?? "Enregistrement impossible. Réessayez.")
      onSaved(res.photos)
    } catch {
      setError("Action impossible. Vérifiez votre connexion puis réessayez.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div
      className={`flex flex-col gap-3 rounded-xl border bg-card p-3 ${preview ? "border-2 border-primary" : "border-border"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{photo.title}</h3>
        <span
          className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
            photo.custom ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
          }`}
        >
          {photo.custom ? "Photo personnalisée" : "Photo d'origine"}
        </span>
      </div>

      {preview ? (
        <div className="flex flex-col gap-2 rounded-lg bg-muted p-2">
          <span className="text-xs text-muted-foreground">Aperçu de la carte avant enregistrement</span>
          {/* Même rendu que la carte du configurateur : photo plein cadre, voile, titre. */}
          <div className="relative h-[104px] overflow-hidden rounded-[14px] border border-white/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt={photo.title} className="absolute inset-0 size-full object-cover" />
            <span className="absolute inset-0 bg-gradient-to-r from-[rgba(2,9,14,.86)] via-[rgba(2,9,14,.35)] to-[rgba(2,9,14,.15)]" />
            <span className="absolute inset-y-0 left-4 right-12 flex items-center text-base font-semibold uppercase leading-tight text-white">
              {photo.title}
            </span>
          </div>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo.src} alt={photo.title} className="aspect-video w-full rounded-lg object-cover" />
      )}

      <p className="text-xs text-muted-foreground">Affichée sur : {photo.where.join(", ")}</p>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        aria-label={`Changer la photo : ${photo.title}`}
        onChange={(e) => choose(e.target.files?.[0])}
      />
      <div className="flex flex-wrap gap-2">
        {preview ? (
          <>
            <Button type="button" size="sm" onClick={save} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
              Enregistrer
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={cancel} disabled={pending}>
              <X className="size-4" aria-hidden="true" />
              Annuler
            </Button>
          </>
        ) : (
          <>
            <Button type="button" size="sm" variant="outline" onClick={() => input.current?.click()} disabled={pending}>
              <ImageUp className="size-4" aria-hidden="true" />
              Changer la photo
            </Button>
            {photo.custom ? (
              <Button type="button" size="sm" variant="ghost" onClick={reset} disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <RotateCcw className="size-4" aria-hidden="true" />}
                Revenir à la photo d&apos;origine
              </Button>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
