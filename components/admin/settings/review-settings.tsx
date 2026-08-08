"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Save, Trash2, Plus, X, Eye, EyeOff, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  createReview,
  updateReview,
  deleteReview,
  toggleReviewVisibility,
  type AdminReview,
} from "@/app/admin/(dashboard)/parametres/review-actions"

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
const labelClass = "mb-1.5 block text-sm font-medium text-foreground"
const cardClass = "rounded-2xl border border-border bg-card p-5"

type Props = {
  /** Avis actuels du tenant, déjà triés par ordre d'affichage. */
  items: AdminReview[]
}

/** Sélecteur d'une note de 1 à 5 étoiles (accessible). */
function RatingPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Note">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} étoile${n > 1 ? "s" : ""}`}
          onClick={() => onChange(n)}
          className="rounded p-0.5 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Star className={cn("size-6", n <= value ? "fill-primary text-primary" : "fill-muted text-muted")} />
        </button>
      ))}
    </div>
  )
}

export function ReviewSettings({ items }: Props) {
  const router = useRouter()

  return (
    <div className="space-y-6">
      <div className={cardClass}>
        <h2 className="mb-1 text-base font-semibold text-foreground">Avis clients</h2>
        <p className="mb-4 text-sm text-muted-foreground text-pretty">
          Ajoutez les avis de vos clients. Seuls les avis « affichés » apparaissent sur votre site public.
        </p>
        <AddForm onDone={() => router.refresh()} />
      </div>

      {items.length > 0 ? (
        <div className="space-y-4">
          {items.map((item) => (
            <ReviewRow key={item.id} item={item} onDone={() => router.refresh()} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Aucun avis pour le moment.</p>
      )}
    </div>
  )
}

/* ------------------------------ Ajout d'un avis ------------------------------ */

function AddForm({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [rating, setRating] = useState(5)
  const formRef = useRef<HTMLFormElement>(null)

  function reset() {
    formRef.current?.reset()
    setRating(5)
    setError(null)
  }

  function submit(formData: FormData) {
    setError(null)
    const authorName = ((formData.get("authorName") as string | null) ?? "").trim()
    const vehicle = ((formData.get("vehicle") as string | null) ?? "").trim()
    const text = ((formData.get("text") as string | null) ?? "").trim()
    const visible = formData.get("visible") === "on"

    if (!authorName) return setError("Le nom du client est obligatoire.")
    if (!text) return setError("Le texte de l'avis est obligatoire.")

    startTransition(async () => {
      const res = await createReview({ authorName, vehicle, rating, text, visible })
      if (!res.ok) {
        setError(res.error || "Erreur lors de l'enregistrement.")
        return
      }
      reset()
      setOpen(false)
      onDone()
    })
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
        Ajouter un avis
      </Button>
    )
  }

  return (
    <form ref={formRef} action={submit} className="space-y-4 rounded-xl border border-border p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="add-author" className={labelClass}>
            Nom du client
          </label>
          <input id="add-author" name="authorName" type="text" className={inputClass} placeholder="Ex. Julien M." />
        </div>
        <div>
          <label htmlFor="add-vehicle" className={labelClass}>
            Véhicule <span className="text-muted-foreground">(facultatif)</span>
          </label>
          <input id="add-vehicle" name="vehicle" type="text" className={inputClass} placeholder="Ex. BMW Série 3" />
        </div>
      </div>
      <div>
        <span className={labelClass}>Note</span>
        <RatingPicker value={rating} onChange={setRating} />
      </div>
      <div>
        <label htmlFor="add-text" className={labelClass}>
          Avis
        </label>
        <textarea id="add-text" name="text" rows={3} className={inputClass} placeholder="Le message du client…" />
      </div>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" name="visible" defaultChecked className="size-4 rounded border-border" />
        Afficher sur le site public
      </label>
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

/* ------------------------------ Ligne d'un avis ------------------------------ */

function ReviewRow({ item, onDone }: { item: AdminReview; onDone: () => void }) {
  const [editing, setEditing] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [rating, setRating] = useState(item.rating)
  const formRef = useRef<HTMLFormElement>(null)

  function remove() {
    if (!confirm("Supprimer cet avis ? Cette action est irréversible.")) return
    startTransition(async () => {
      const res = await deleteReview(item.id)
      if (!res.ok) setError(res.error || "Erreur lors de la suppression.")
      else onDone()
    })
  }

  function toggle() {
    startTransition(async () => {
      const res = await toggleReviewVisibility(item.id, !item.visible)
      if (!res.ok) setError(res.error || "Erreur.")
      else onDone()
    })
  }

  function submitEdit(formData: FormData) {
    setError(null)
    const authorName = ((formData.get("authorName") as string | null) ?? "").trim()
    const vehicle = ((formData.get("vehicle") as string | null) ?? "").trim()
    const text = ((formData.get("text") as string | null) ?? "").trim()

    if (!authorName) return setError("Le nom du client est obligatoire.")
    if (!text) return setError("Le texte de l'avis est obligatoire.")

    startTransition(async () => {
      const res = await updateReview({ id: item.id, authorName, vehicle, rating, text })
      if (!res.ok) {
        setError(res.error || "Erreur lors de l'enregistrement.")
        return
      }
      setEditing(false)
      onDone()
    })
  }

  return (
    <div className={cardClass}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium text-foreground">{item.authorName}</p>
            {item.vehicle && <span className="truncate text-xs text-muted-foreground">· {item.vehicle}</span>}
            {!item.visible && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Masqué</span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-0.5" aria-label={`Note : ${item.rating} sur 5`}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className={cn("size-4", i < item.rating ? "fill-primary text-primary" : "fill-muted text-muted")} />
            ))}
          </div>
          <p className="mt-2 text-sm text-muted-foreground text-pretty">{item.text}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={toggle} disabled={pending}>
            {item.visible ? <EyeOff className="mr-1 h-4 w-4" /> : <Eye className="mr-1 h-4 w-4" />}
            {item.visible ? "Masquer" : "Afficher"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing((v) => !v)} disabled={pending}>
            {editing ? <X className="mr-1 h-4 w-4" /> : null}
            {editing ? "Fermer" : "Modifier"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={remove} disabled={pending}>
            <Trash2 className="mr-1 h-4 w-4" />
            Supprimer
          </Button>
        </div>
      </div>

      {editing && (
        <form ref={formRef} action={submitEdit} className="mt-4 space-y-4 rounded-xl border border-border p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`edit-author-${item.id}`} className={labelClass}>
                Nom du client
              </label>
              <input id={`edit-author-${item.id}`} name="authorName" type="text" defaultValue={item.authorName} className={inputClass} />
            </div>
            <div>
              <label htmlFor={`edit-vehicle-${item.id}`} className={labelClass}>
                Véhicule
              </label>
              <input id={`edit-vehicle-${item.id}`} name="vehicle" type="text" defaultValue={item.vehicle ?? ""} className={inputClass} />
            </div>
          </div>
          <div>
            <span className={labelClass}>Note</span>
            <RatingPicker value={rating} onChange={setRating} />
          </div>
          <div>
            <label htmlFor={`edit-text-${item.id}`} className={labelClass}>
              Avis
            </label>
            <textarea id={`edit-text-${item.id}`} name="text" rows={3} defaultValue={item.text} className={inputClass} />
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
