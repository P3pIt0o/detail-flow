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
import { saveOption, deleteOption } from "@/app/admin/(dashboard)/prestations/actions"

type Option = {
  id: number
  name: string
  description: string | null
  priceCents: number
  durationMin: number
  visible: boolean
}

export function OptionsManager({ options }: { options: Option[] }) {
  const [editing, setEditing] = useState<Option | null>(null)
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
          <Plus className="mr-1 h-4 w-4" /> Nouvelle option
        </Button>
      </div>

      <div className="space-y-2">
        {options.map((o) => (
          <div
            key={o.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate font-medium text-foreground">{o.name}</p>
                {!o.visible && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                    <EyeOff className="h-3 w-3" /> Masquée
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {formatPrice(o.priceCents)}
                {o.durationMin > 0 && ` · +${formatDuration(o.durationMin)}`}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Modifier"
                onClick={() => {
                  setEditing(o)
                  setOpen(true)
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <DeleteBtn id={o.id} name={o.name} />
            </div>
          </div>
        ))}
      </div>

      <OptionDialog open={open} onOpenChange={setOpen} option={editing} />
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
        if (!confirm(`Supprimer l'option « ${name} » ?`)) return
        startTransition(() => deleteOption(id))
      }}
    >
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  )
}

function OptionDialog({
  open,
  onOpenChange,
  option,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  option: Option | null
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onSubmit(formData: FormData) {
    setError(null)
    const euros = Number.parseFloat(String(formData.get("price") || "0"))
    const durationMin = Number.parseInt(String(formData.get("duration") || "0"), 10)
    startTransition(async () => {
      const res = await saveOption({
        id: option?.id,
        name: String(formData.get("name") || ""),
        description: String(formData.get("description") || ""),
        priceCents: Math.round((Number.isFinite(euros) ? euros : 0) * 100),
        durationMin: Number.isFinite(durationMin) ? durationMin : 0,
        visible: formData.get("visible") === "on",
      })
      if (res.ok) onOpenChange(false)
      else setError(res.error ?? "Erreur")
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{option ? "Modifier l'option" : "Nouvelle option"}</DialogTitle>
        </DialogHeader>
        <form action={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="o-name">Nom</Label>
            <Input id="o-name" name="name" defaultValue={option?.name ?? ""} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="o-desc">Description</Label>
            <Textarea id="o-desc" name="description" defaultValue={option?.description ?? ""} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="o-price">Prix (€)</Label>
              <Input
                id="o-price"
                name="price"
                type="number"
                step="0.01"
                min="0"
                defaultValue={option ? (option.priceCents / 100).toString() : ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="o-duration">Durée ajoutée (min)</Label>
              <Input
                id="o-duration"
                name="duration"
                type="number"
                min="0"
                step="5"
                defaultValue={option?.durationMin ?? 0}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="o-visible" name="visible" defaultChecked={option?.visible ?? true} />
            <Label htmlFor="o-visible">Visible sur le site</Label>
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
