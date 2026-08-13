"use client"

import { useState, useTransition } from "react"
import { Pencil, Plus, Trash2 } from "lucide-react"
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
import { saveVehicleType, deleteVehicleType } from "@/app/admin/(dashboard)/prestations/actions"

type VehicleType = {
  id: number
  name: string
  description: string | null
  examples: string | null
  active: boolean
}

export function VehicleTypesManager({ vehicleTypes }: { vehicleTypes: VehicleType[] }) {
  const [editing, setEditing] = useState<VehicleType | null>(null)
  const [open, setOpen] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={() => {
            setEditing(null)
            setOpen(true)
          }}
        >
          <Plus className="mr-1 h-4 w-4" /> Nouveau type
        </Button>
      </div>

      <div className="space-y-2">
        {vehicleTypes.map((v) => (
          <div
            key={v.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">
                {v.name}
                {!v.active && <span className="ml-2 text-xs text-muted-foreground">(inactif)</span>}
              </p>
              {v.description && (
                <p className="truncate text-xs text-muted-foreground">{v.description}</p>
              )}
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Modifier"
                onClick={() => {
                  setEditing(v)
                  setOpen(true)
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <DeleteBtn id={v.id} name={v.name} />
            </div>
          </div>
        ))}
      </div>

      <VehicleDialog open={open} onOpenChange={setOpen} vehicle={editing} />
    </div>
  )
}

function DeleteBtn({ id, name }: { id: number; name: string }) {
  const [pending, startTransition] = useTransition()
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Supprimer"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Supprimer le type « ${name} » ? Les tarifs associés seront supprimés.`)) return
        startTransition(() => deleteVehicleType(id))
      }}
    >
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  )
}

function VehicleDialog({
  open,
  onOpenChange,
  vehicle,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  vehicle: VehicleType | null
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const res = await saveVehicleType({
        id: vehicle?.id,
        name: String(formData.get("name") || ""),
        description: String(formData.get("description") || ""),
        examples: String(formData.get("examples") || ""),
        active: formData.get("active") === "on",
      })
      if (res.ok) onOpenChange(false)
      else setError(res.error ?? "Erreur")
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{vehicle ? "Modifier le type" : "Nouveau type de véhicule"}</DialogTitle>
        </DialogHeader>
        <form action={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="v-name">Nom</Label>
            <Input id="v-name" name="name" defaultValue={vehicle?.name ?? ""} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="v-desc">Description <span className="text-muted-foreground">(facultatif)</span></Label>
            <Textarea
              id="v-desc"
              name="description"
              defaultValue={vehicle?.description ?? ""}
              rows={2}
              placeholder="Véhicules surélevés de taille moyenne"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="v-examples">
              Exemples de véhicules <span className="text-muted-foreground">(facultatif)</span>
            </Label>
            <Input
              id="v-examples"
              name="examples"
              defaultValue={vehicle?.examples ?? ""}
              placeholder="3008, Tiguan, Model Y, Q3"
            />
            <p className="text-xs text-muted-foreground">Aide le client à choisir la bonne catégorie.</p>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="v-active" name="active" defaultChecked={vehicle?.active ?? true} />
            <Label htmlFor="v-active">Actif</Label>
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
