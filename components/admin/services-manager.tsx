"use client"

import { useState, useTransition, useRef } from "react"
import Image from "next/image"
import { Pencil, Plus, Trash2, EyeOff, Upload, Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { formatPrice, formatDuration } from "@/lib/format"
import { saveService, deleteService } from "@/app/admin/(dashboard)/prestations/actions"

type Service = {
  id: number
  name: string
  description: string | null
  categoryId: number | null
  image: string | null
  basePriceCents: number
  durationMin: number
  visible: boolean
}

export function ServicesManager({ services }: { services: Service[] }) {
  const [editing, setEditing] = useState<Service | null>(null)
  const [open, setOpen] = useState(false)

  function openNew() {
    setEditing(null)
    setOpen(true)
  }
  function openEdit(s: Service) {
    setEditing(s)
    setOpen(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openNew}>
          <Plus className="mr-1 h-4 w-4" /> Nouvelle prestation
        </Button>
      </div>

      <div className="space-y-2">
        {services.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Aucune prestation. Créez-en une pour commencer.
          </p>
        ) : (
          services.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate font-medium text-foreground">{s.name}</p>
                  {!s.visible && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      <EyeOff className="h-3 w-3" /> Masquée
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  À partir de {formatPrice(s.basePriceCents)} · {formatDuration(s.durationMin)}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="icon" onClick={() => openEdit(s)} aria-label="Modifier">
                  <Pencil className="h-4 w-4" />
                </Button>
                <DeleteButton id={s.id} name={s.name} />
              </div>
            </div>
          ))
        )}
      </div>

      <ServiceDialog key={editing?.id ?? "new"} open={open} onOpenChange={setOpen} service={editing} />
    </div>
  )
}

function DeleteButton({ id, name }: { id: number; name: string }) {
  const [pending, startTransition] = useTransition()
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Supprimer"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Supprimer la prestation « ${name} » ? Les tarifs associés seront aussi supprimés.`)) return
        startTransition(() => {
          void deleteService(id)
        })
      }}
    >
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  )
}

function ImageField({
  value,
  onChange,
}: {
  value: string | null
  onChange: (v: string | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  async function handleFile(file: File) {
    setUploadError(null)
    if (!file.type.startsWith("image/")) {
      setUploadError("Le fichier doit être une image.")
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/admin/service-image", { method: "POST", body: fd })
      const data = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !data.url) {
        setUploadError(data.error || "Échec de l'envoi de l'image.")
        return
      }
      onChange(data.url)
    } catch {
      setUploadError("Échec de l'envoi de l'image.")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-1.5">
      <Label>Image de la prestation</Label>
      <div className="flex items-center gap-3">
        <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
          <Image
            src={value || "/services/default.png"}
            alt="Aperçu de la prestation"
            fill
            className="object-cover"
            sizes="96px"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-1 h-4 w-4" />
            )}
            {value ? "Remplacer" : "Téléverser"}
          </Button>
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={uploading}
              onClick={() => onChange(null)}
            >
              <Trash2 className="mr-1 h-4 w-4 text-destructive" />
              Retirer
            </Button>
          )}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleFile(file)
          e.target.value = ""
        }}
      />
      <p className="text-xs text-muted-foreground">
        {value ? "Image personnalisée active." : "Aucune image : l'image par défaut sera utilisée."}
      </p>
      {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
    </div>
  )
}

function ServiceDialog({
  open,
  onOpenChange,
  service,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  service: Service | null
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // `key` sur le dialogue (voir plus bas) réinitialise cet état à chaque
  // ouverture, donc l'image de départ correspond toujours à la prestation.
  const [image, setImage] = useState<string | null>(service?.image ?? null)

  function onSubmit(formData: FormData) {
    setError(null)
    const name = String(formData.get("name") || "")
    const description = String(formData.get("description") || "")
    const euros = Number.parseFloat(String(formData.get("price") || "0"))
    const durationMin = Number.parseInt(String(formData.get("duration") || "0"), 10)
    const visible = formData.get("visible") === "on"

    startTransition(async () => {
      const res = await saveService({
        id: service?.id,
        name,
        description,
        categoryId: service?.categoryId ?? null,
        basePriceCents: Math.round((Number.isFinite(euros) ? euros : 0) * 100),
        durationMin: Number.isFinite(durationMin) ? durationMin : 0,
        visible,
        image,
      })
      if (res.ok) onOpenChange(false)
      else setError(res.error ?? "Erreur")
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{service ? "Modifier la prestation" : "Nouvelle prestation"}</DialogTitle>
        </DialogHeader>
        <form action={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nom</Label>
            <Input id="name" name="name" defaultValue={service?.name ?? ""} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              defaultValue={service?.description ?? ""}
              rows={2}
            />
          </div>
          <ImageField value={image} onChange={setImage} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="price">Prix de base (€)</Label>
              <Input
                id="price"
                name="price"
                type="number"
                step="0.01"
                min="0"
                defaultValue={service ? (service.basePriceCents / 100).toString() : ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="duration">Durée (min)</Label>
              <Input
                id="duration"
                name="duration"
                type="number"
                min="0"
                step="5"
                defaultValue={service?.durationMin ?? 60}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="visible" name="visible" defaultChecked={service?.visible ?? true} />
            <Label htmlFor="visible">Visible sur le site</Label>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
