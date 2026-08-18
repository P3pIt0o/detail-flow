"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { upload } from "@vercel/blob/client"
import { Loader2, Save, Upload, Trash2, Plus, ArrowUp, ArrowDown, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { optimizeImage, formatMo } from "@/lib/image/optimize-client"
import {
  createGalleryItem,
  updateGalleryItem,
  deleteGalleryItem,
  reorderGalleryItems,
  type GalleryItem,
} from "@/app/admin/(dashboard)/parametres/gallery-actions"

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
const labelClass = "mb-1.5 block text-sm font-medium text-foreground"
const cardClass = "rounded-2xl border border-border bg-card p-5"

const ACCEPT = "image/jpeg,image/png,image/webp"
const ALLOWED_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"])
const MAX_IMAGE_BYTES = 6 * 1024 * 1024 // 6 Mo par image

type Props = {
  /** Réalisations actuelles du tenant, déjà triées par ordre d'affichage. */
  items: GalleryItem[]
  /** Slug du tenant pour construire les URLs d'aperçu (route publique isolée). */
  slug: string
  /** Id numérique du tenant : préfixe des chemins Blob (isolation upload). */
  companyId: number
}

function imgUrl(slug: string, pathname: string): string {
  return `/api/gallery-image?company=${encodeURIComponent(slug)}&p=${encodeURIComponent(pathname)}`
}

/**
 * Téléverse une image DIRECTEMENT du navigateur vers le Blob privé (upload
 * client). Le binaire ne transite donc jamais par une Server Action, ce qui
 * évite la limite de corps de 1 Mo de Next.js. Renvoie le pathname stocké.
 */
async function uploadImage(file: File, kind: "before" | "after", companyId: number): Promise<string> {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error("Format non supporté (JPG, PNG ou WEBP uniquement).")
  }
  // Optimisation navigateur (redimensionnement + compression + orientation EXIF)
  // afin que les grosses photos de smartphone passent sous la limite serveur.
  const optimized = await optimizeImage(file, {
    maxDimension: 2000,
    maxBytes: MAX_IMAGE_BYTES,
    quality: 0.82,
  })
  // Sécurité : cohérente avec la limite serveur (`maximumSizeInBytes`).
  if (optimized.size > MAX_IMAGE_BYTES) {
    throw new Error(
      `Image trop lourde : ${formatMo(optimized.size)} (max ${formatMo(MAX_IMAGE_BYTES)}). ` +
        `Réduisez sa définition puis réessayez.`,
    )
  }
  const ext = optimized.type === "image/png" ? "png" : optimized.type === "image/webp" ? "webp" : "jpg"
  const result = await upload(`gallery/company-${companyId}-${kind}-${Date.now()}.${ext}`, optimized, {
    access: "private",
    handleUploadUrl: "/api/gallery-upload",
  })
  return result.pathname
}

export function GallerySettings({ items, slug, companyId }: Props) {
  const router = useRouter()

  return (
    <div className="space-y-6">
      <div className={cardClass}>
        <h2 className="mb-1 text-base font-semibold text-foreground">Galerie Avant / Après</h2>
        <p className="mb-4 text-sm text-muted-foreground text-pretty">
          Présentez vos réalisations sur votre site public avec un comparateur Avant / Après. Formats acceptés : JPG,
          PNG, WEBP. Les photos volumineuses sont automatiquement optimisées lors de l&apos;envoi.
        </p>
        <AddForm slug={slug} companyId={companyId} onDone={() => router.refresh()} />
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

/* --------------------------- Ajout d'une réalisation --------------------------- */

function AddForm({ slug, companyId, onDone }: { slug: string; companyId: number; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const [beforeFile, setBeforeFile] = useState<File | null>(null)
  const [afterFile, setAfterFile] = useState<File | null>(null)
  const [beforePreview, setBeforePreview] = useState<string | null>(null)
  const [afterPreview, setAfterPreview] = useState<string | null>(null)

  function reset() {
    formRef.current?.reset()
    setBeforeFile(null)
    setAfterFile(null)
    setBeforePreview(null)
    setAfterPreview(null)
    setError(null)
  }

  function submit(formData: FormData) {
    setError(null)
    const title = ((formData.get("title") as string | null) ?? "").trim()
    const description = ((formData.get("description") as string | null) ?? "").trim()

    if (!beforeFile || !afterFile) {
      setError("Les photos Avant et Après sont obligatoires.")
      return
    }

    startTransition(async () => {
      try {
        // 1) Upload direct navigateur → Blob (les deux images).
        const [beforePath, afterPath] = await Promise.all([
          uploadImage(beforeFile, "before", companyId),
          uploadImage(afterFile, "after", companyId),
        ])
        // 2) On n'envoie QUE les pathnames à la Server Action.
        const res = await createGalleryItem({ beforePath, afterPath, title, description })
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
        Ajouter une réalisation
      </Button>
    )
  }

  return (
    <form ref={formRef} action={submit} className="space-y-4 rounded-xl border border-border p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <ImagePicker
          label="Photo Avant"
          preview={beforePreview}
          onPick={(f) => {
            setBeforeFile(f)
            setBeforePreview(f ? URL.createObjectURL(f) : null)
          }}
        />
        <ImagePicker
          label="Photo Après"
          preview={afterPreview}
          onPick={(f) => {
            setAfterFile(f)
            setAfterPreview(f ? URL.createObjectURL(f) : null)
          }}
        />
      </div>
      <div>
        <label htmlFor="add-title" className={labelClass}>
          Titre <span className="text-muted-foreground">(facultatif)</span>
        </label>
        <input id="add-title" name="title" type="text" className={inputClass} placeholder="Ex. Berline — rénovation complète" />
      </div>
      <div>
        <label htmlFor="add-desc" className={labelClass}>
          Description <span className="text-muted-foreground">(facultatif)</span>
        </label>
        <textarea id="add-desc" name="description" rows={3} className={inputClass} placeholder="Détails de la prestation…" />
      </div>
      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          {error}
        </div>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Enregistrer
        </Button>
        <Button type="button" variant="outline" onClick={() => { reset(); setOpen(false) }} disabled={pending}>
          Annuler
        </Button>
      </div>
    </form>
  )
}

/* --------------------------- Ligne d'une réalisation --------------------------- */

function ItemRow({
  item,
  slug,
  companyId,
  isFirst,
  isLast,
  orderedIds,
  onDone,
}: {
  item: GalleryItem
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
  const [beforeFile, setBeforeFile] = useState<File | null>(null)
  const [afterFile, setAfterFile] = useState<File | null>(null)
  const [beforePreview, setBeforePreview] = useState<string | null>(null)
  const [afterPreview, setAfterPreview] = useState<string | null>(null)

  function move(direction: -1 | 1) {
    const idx = orderedIds.indexOf(item.id)
    const target = idx + direction
    if (target < 0 || target >= orderedIds.length) return
    const next = [...orderedIds]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    startTransition(async () => {
      await reorderGalleryItems(next)
      onDone()
    })
  }

  function remove() {
    if (!confirm("Supprimer cette réalisation ? Cette action est irréversible.")) return
    startTransition(async () => {
      const res = await deleteGalleryItem(item.id)
      if (!res.ok) setError(res.error || "Erreur lors de la suppression.")
      else onDone()
    })
  }

  function submitEdit(formData: FormData) {
    setError(null)
    const title = ((formData.get("title") as string | null) ?? "").trim()
    const description = ((formData.get("description") as string | null) ?? "").trim()

    startTransition(async () => {
      try {
        // Upload uniquement des images réellement remplacées.
        let beforePath: string | null = null
        let afterPath: string | null = null
        if (beforeFile) beforePath = await uploadImage(beforeFile, "before", companyId)
        if (afterFile) afterPath = await uploadImage(afterFile, "after", companyId)

        const res = await updateGalleryItem({ id: item.id, beforePath, afterPath, title, description })
        if (!res.ok) {
          setError(res.error || "Erreur lors de l'enregistrement.")
          return
        }
        setEditing(false)
        setBeforeFile(null)
        setAfterFile(null)
        setBeforePreview(null)
        setAfterPreview(null)
        onDone()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Échec du téléversement.")
      }
    })
  }

  return (
    <div className={cardClass}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {/* Aperçus */}
        <div className="flex gap-3">
          <figure className="space-y-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imgUrl(slug, item.beforeImageUrl)} alt="Avant" className="h-24 w-32 rounded-lg border border-border object-cover" />
            <figcaption className="text-center text-xs text-muted-foreground">Avant</figcaption>
          </figure>
          <figure className="space-y-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imgUrl(slug, item.afterImageUrl)} alt="Après" className="h-24 w-32 rounded-lg border border-border object-cover" />
            <figcaption className="text-center text-xs text-muted-foreground">Après</figcaption>
          </figure>
        </div>

        {/* Infos + actions */}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-foreground">{item.title || "Sans titre"}</p>
          {item.description && <p className="mt-1 text-sm text-muted-foreground text-pretty">{item.description}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing((v) => !v)} disabled={pending}>
              {editing ? <X className="mr-1 h-4 w-4" /> : null}
              {editing ? "Fermer" : "Modifier"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => move(-1)} disabled={pending || isFirst} aria-label="Monter">
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => move(1)} disabled={pending || isLast} aria-label="Descendre">
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
          <p className="text-sm text-muted-foreground">
            Laissez un champ image vide pour conserver la photo actuelle.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <ImagePicker
              label="Nouvelle photo Avant"
              preview={beforePreview}
              onPick={(f) => {
                setBeforeFile(f)
                setBeforePreview(f ? URL.createObjectURL(f) : null)
              }}
            />
            <ImagePicker
              label="Nouvelle photo Après"
              preview={afterPreview}
              onPick={(f) => {
                setAfterFile(f)
                setAfterPreview(f ? URL.createObjectURL(f) : null)
              }}
            />
          </div>
          <div>
            <label htmlFor={`edit-title-${item.id}`} className={labelClass}>Titre</label>
            <input id={`edit-title-${item.id}`} name="title" type="text" defaultValue={item.title ?? ""} className={inputClass} />
          </div>
          <div>
            <label htmlFor={`edit-desc-${item.id}`} className={labelClass}>Description</label>
            <textarea id={`edit-desc-${item.id}`} name="description" rows={3} defaultValue={item.description ?? ""} className={inputClass} />
          </div>
          {error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
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
        <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
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
