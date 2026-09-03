"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { upload } from "@vercel/blob/client"
import { Loader2, Save, Upload, Trash2, Plus, ArrowUp, ArrowDown, X, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { optimizeImage, formatMo } from "@/lib/image/optimize-client"
import {
  createPhotoGalleryItem,
  updatePhotoGalleryItem,
  deletePhotoGalleryItem,
  reorderPhotoGalleryItems,
  setPhotoGalleryPublished,
  type PhotoGalleryItem,
} from "@/app/admin/(dashboard)/parametres/photo-gallery-actions"

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
const labelClass = "mb-1.5 block text-sm font-medium text-foreground"
const cardClass = "rounded-2xl border border-border bg-card p-5"

const ACCEPT = "image/jpeg,image/png,image/webp"
const ALLOWED_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"])
const MAX_IMAGE_BYTES = 6 * 1024 * 1024 // 6 Mo par image

type Props = {
  /** Photos actuelles du tenant, déjà triées par ordre d'affichage. */
  items: PhotoGalleryItem[]
  /** Slug du tenant pour construire les URLs d'aperçu (route publique isolée). */
  slug: string
  /** Id numérique du tenant : préfixe des chemins Blob (isolation upload). */
  companyId: number
}

function imgUrl(slug: string, pathname: string): string {
  return `/api/photo-gallery-image?company=${encodeURIComponent(slug)}&p=${encodeURIComponent(pathname)}`
}

/**
 * Téléverse une image DIRECTEMENT du navigateur vers le Blob privé (upload
 * client). Le binaire ne transite jamais par une Server Action (pas de limite
 * de corps de 1 Mo). Renvoie le pathname stocké. Même infrastructure que la
 * galerie Avant/Après, avec un préfixe `photo-gallery/` distinct.
 */
async function uploadImage(file: File, companyId: number): Promise<string> {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error("Format non supporté (JPG, PNG ou WEBP uniquement).")
  }
  const optimized = await optimizeImage(file, {
    maxDimension: 2000,
    maxBytes: MAX_IMAGE_BYTES,
    quality: 0.82,
  })
  if (optimized.size > MAX_IMAGE_BYTES) {
    throw new Error(
      `Image trop lourde : ${formatMo(optimized.size)} (max ${formatMo(MAX_IMAGE_BYTES)}). ` +
        `Réduisez sa définition puis réessayez.`,
    )
  }
  const ext = optimized.type === "image/png" ? "png" : optimized.type === "image/webp" ? "webp" : "jpg"
  const result = await upload(`photo-gallery/company-${companyId}-${Date.now()}.${ext}`, optimized, {
    access: "private",
    handleUploadUrl: "/api/photo-gallery-upload",
  })
  return result.pathname
}

export function PhotoGallerySettings({ items, slug, companyId }: Props) {
  const router = useRouter()

  return (
    <div className="space-y-6">
      <div className={cardClass}>
        <h2 className="mb-1 text-base font-semibold text-foreground">Galerie de photos</h2>
        <p className="mb-4 text-sm text-muted-foreground text-pretty">
          Présentez vos réalisations en photos simples sur votre site public. Chaque photo peut avoir un titre et une
          description. Formats acceptés : JPG, PNG, WEBP. Les photos volumineuses sont automatiquement optimisées lors
          de l&apos;envoi.
        </p>
        <AddForm companyId={companyId} onDone={() => router.refresh()} />
      </div>

      {items.length > 0 && (
        <div className="space-y-4">
          {items.map((item, index) => (
            <ItemRow
              key={item.id}
              item={item}
              slug={slug}
              companyId={companyId}
              isFirst={index === 0}
              isLast={index === items.length - 1}
              orderedIds={items.map((i) => i.id)}
              onDone={() => router.refresh()}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* --------------------------- Ajout d'une photo --------------------------- */

function AddForm({ companyId, onDone }: { companyId: number; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  function reset() {
    formRef.current?.reset()
    setFile(null)
    setPreview(null)
    setError(null)
  }

  function submit(formData: FormData) {
    setError(null)
    const title = ((formData.get("title") as string | null) ?? "").trim()
    const description = ((formData.get("description") as string | null) ?? "").trim()
    const altText = ((formData.get("altText") as string | null) ?? "").trim()

    if (!file) {
      setError("La photo est obligatoire.")
      return
    }

    startTransition(async () => {
      try {
        // 1) Upload direct navigateur → Blob.
        const imagePath = await uploadImage(file, companyId)
        // 2) On n'envoie QUE le pathname à la Server Action.
        const res = await createPhotoGalleryItem({ imagePath, title, description, altText })
        if (!res.ok) {
          setError(res.error || "Erreur lors de l'enregistrement.")
          return
        }
        reset()
        setOpen(false)
        onDone()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Échec du téléversement.")
      }
    })
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
        Ajouter une photo
      </Button>
    )
  }

  return (
    <form ref={formRef} action={submit} className="space-y-4 rounded-xl border border-border p-4">
      <ImagePicker
        label="Photo"
        preview={preview}
        onPick={(f) => {
          setFile(f)
          setPreview(f ? URL.createObjectURL(f) : null)
        }}
      />
      <div>
        <label htmlFor="add-photo-title" className={labelClass}>
          Titre <span className="text-muted-foreground">(facultatif)</span>
        </label>
        <input
          id="add-photo-title"
          name="title"
          type="text"
          className={inputClass}
          placeholder="Ex. Berline — rénovation complète"
        />
      </div>
      <div>
        <label htmlFor="add-photo-desc" className={labelClass}>
          Description <span className="text-muted-foreground">(facultatif)</span>
        </label>
        <textarea
          id="add-photo-desc"
          name="description"
          rows={3}
          className={inputClass}
          placeholder="Détails de la prestation…"
        />
      </div>
      <div>
        <label htmlFor="add-photo-alt" className={labelClass}>
          Texte alternatif <span className="text-muted-foreground">(accessibilité, facultatif)</span>
        </label>
        <input
          id="add-photo-alt"
          name="altText"
          type="text"
          className={inputClass}
          placeholder="Décrivez brièvement l'image pour les lecteurs d'écran"
        />
      </div>
      {error && (
        <div
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Enregistrer
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            reset()
            setOpen(false)
          }}
          disabled={pending}
        >
          Annuler
        </Button>
      </div>
    </form>
  )
}

/* --------------------------- Ligne d'une photo --------------------------- */

function ItemRow({
  item,
  slug,
  companyId,
  isFirst,
  isLast,
  orderedIds,
  onDone,
}: {
  item: PhotoGalleryItem
  slug: string
  companyId: number
  isFirst: boolean
  isLast: boolean
  orderedIds: number[]
  onDone: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  function move(direction: -1 | 1) {
    const idx = orderedIds.indexOf(item.id)
    const target = idx + direction
    if (target < 0 || target >= orderedIds.length) return
    const next = [...orderedIds]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    startTransition(async () => {
      await reorderPhotoGalleryItems(next)
      onDone()
    })
  }

  function togglePublished() {
    startTransition(async () => {
      const res = await setPhotoGalleryPublished(item.id, !item.published)
      if (!res.ok) setError(res.error || "Erreur.")
      else onDone()
    })
  }

  function remove() {
    if (!confirm("Supprimer cette photo ? Cette action est irréversible.")) return
    startTransition(async () => {
      const res = await deletePhotoGalleryItem(item.id)
      if (!res.ok) setError(res.error || "Erreur lors de la suppression.")
      else onDone()
    })
  }

  function submitEdit(formData: FormData) {
    setError(null)
    const title = ((formData.get("title") as string | null) ?? "").trim()
    const description = ((formData.get("description") as string | null) ?? "").trim()
    const altText = ((formData.get("altText") as string | null) ?? "").trim()

    startTransition(async () => {
      try {
        // Upload uniquement si l'image est réellement remplacée.
        let imagePath: string | null = null
        if (file) imagePath = await uploadImage(file, companyId)

        const res = await updatePhotoGalleryItem({ id: item.id, imagePath, title, description, altText })
        if (!res.ok) {
          setError(res.error || "Erreur lors de l'enregistrement.")
          return
        }
        setEditing(false)
        setFile(null)
        setPreview(null)
        onDone()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Échec du téléversement.")
      }
    })
  }

  return (
    <div className={cardClass}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {/* Aperçu */}
        <figure className="space-y-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imgUrl(slug, item.imageUrl) || "/placeholder.svg"}
            alt={item.altText || item.title || "Réalisation"}
            className="h-24 w-32 rounded-lg border border-border object-cover"
          />
        </figure>

        {/* Infos + actions */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium text-foreground">{item.title || "Sans titre"}</p>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                item.published
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {item.published ? "Publiée" : "Masquée"}
            </span>
          </div>
          {item.description && <p className="mt-1 text-sm text-muted-foreground text-pretty">{item.description}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing((v) => !v)} disabled={pending}>
              {editing ? <X className="mr-1 h-4 w-4" /> : null}
              {editing ? "Fermer" : "Modifier"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={togglePublished} disabled={pending}>
              {item.published ? <EyeOff className="mr-1 h-4 w-4" /> : <Eye className="mr-1 h-4 w-4" />}
              {item.published ? "Masquer" : "Publier"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => move(-1)}
              disabled={pending || isFirst}
              aria-label="Monter"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => move(1)}
              disabled={pending || isLast}
              aria-label="Descendre"
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={remove} disabled={pending}>
              <Trash2 className="mr-1 h-4 w-4" />
              Supprimer
            </Button>
          </div>
        </div>
      </div>

      {editing && (
        <form ref={formRef} action={submitEdit} className="mt-4 space-y-4 rounded-xl border border-border p-4">
          <p className="text-sm text-muted-foreground">Laissez le champ image vide pour conserver la photo actuelle.</p>
          <ImagePicker
            label="Nouvelle photo"
            preview={preview}
            onPick={(f) => {
              setFile(f)
              setPreview(f ? URL.createObjectURL(f) : null)
            }}
          />
          <div>
            <label htmlFor={`edit-photo-title-${item.id}`} className={labelClass}>
              Titre
            </label>
            <input
              id={`edit-photo-title-${item.id}`}
              name="title"
              type="text"
              defaultValue={item.title ?? ""}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor={`edit-photo-desc-${item.id}`} className={labelClass}>
              Description
            </label>
            <textarea
              id={`edit-photo-desc-${item.id}`}
              name="description"
              rows={3}
              defaultValue={item.description ?? ""}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor={`edit-photo-alt-${item.id}`} className={labelClass}>
              Texte alternatif <span className="text-muted-foreground">(accessibilité)</span>
            </label>
            <input
              id={`edit-photo-alt-${item.id}`}
              name="altText"
              type="text"
              defaultValue={item.altText ?? ""}
              className={inputClass}
            />
          </div>
          {error && (
            <div
              className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              role="alert"
            >
              {error}
            </div>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Enregistrer les modifications
          </Button>
        </form>
      )}

      {!editing && error && (
        <div
          className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      )}
    </div>
  )
}

/* --------------------------- Sélecteur d'image --------------------------- */

function ImagePicker({
  label,
  preview,
  onPick,
}: {
  label: string
  preview: string | null
  onPick: (file: File | null) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div>
      <span className={labelClass}>{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className="flex h-24 w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-background text-muted-foreground transition-colors hover:border-primary/60"
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview || "/placeholder.svg"} alt="Aperçu" className="h-full w-full object-cover" />
          ) : (
            <Upload className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
        <input
          ref={ref}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />
      </div>
    </div>
  )
}
