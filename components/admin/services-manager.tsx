"use client"

import { useState, useTransition } from "react"
import { Pencil, Plus, Trash2, EyeOff } from "lucide-react"
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

      <ServiceDialog open={open} onOpenChange={setOpen} service={editing} />
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
        startTransition(() => deleteService(id))
      }}
    >
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
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
