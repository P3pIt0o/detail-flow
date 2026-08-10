"use client"

import { useState, useTransition } from "react"
import { Plus, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { formatPrice, formatDateShort } from "@/lib/format"
import { saveProductPurchase, deleteProductPurchase } from "@/app/admin/(dashboard)/produits/actions"

type Purchase = {
  id: number
  name: string
  priceCents: number
  purchaseDate: string
  quantity: number
  note: string | null
}

function emptyForm(p?: Purchase) {
  return {
    id: p?.id,
    name: p?.name ?? "",
    price: p ? (p.priceCents / 100).toString() : "",
    purchaseDate: p?.purchaseDate ?? new Date().toISOString().slice(0, 10),
    quantity: p ? String(p.quantity) : "1",
    note: p?.note ?? "",
  }
}

export function ProductPurchasesTable({ purchases }: { purchases: Purchase[] }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Purchase | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function openCreate() {
    setEditing(null)
    setForm(emptyForm())
    setError(null)
    setOpen(true)
  }

  function openEdit(p: Purchase) {
    setEditing(p)
    setForm(emptyForm(p))
    setError(null)
    setOpen(true)
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const priceCents = Math.round(Number.parseFloat(form.price.replace(",", ".")) * 100)
    if (!Number.isFinite(priceCents) || priceCents < 0) {
      setError("Prix d'achat invalide.")
      return
    }
    startTransition(async () => {
      const res = await saveProductPurchase({
        id: editing?.id,
        name: form.name,
        priceCents,
        purchaseDate: form.purchaseDate,
        quantity: Number.parseInt(form.quantity, 10) || 1,
        note: form.note,
      })
      if (res.ok) setOpen(false)
      else setError(res.error ?? "Une erreur est survenue.")
    })
  }

  function remove(id: number) {
    if (!confirm("Supprimer cet achat ?")) return
    startTransition(async () => {
      await deleteProductPurchase(id)
    })
  }

  return (
    <div className="space-y-4">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button onClick={openCreate}>
            <Plus className="size-4" aria-hidden="true" />
            Ajouter un achat
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier l'achat" : "Nouvel achat"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                Nom du produit <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Shampoing, polish, microfibres…"
                required
                autoFocus
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="price">
                  Prix d&apos;achat (€) <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="price"
                  inputMode="decimal"
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                  placeholder="19.90"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">
                  Date d&apos;achat <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="date"
                  type="date"
                  value={form.purchaseDate}
                  onChange={(e) => setForm((f) => ({ ...f, purchaseDate: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantité</Label>
              <Input
                id="quantity"
                type="number"
                min={1}
                value={form.quantity}
                onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="note">Note</Label>
              <Input
                id="note"
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="Optionnel"
              />
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

      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Produit</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">Date</th>
              <th className="hidden px-4 py-3 text-center font-medium sm:table-cell">Qté</th>
              <th className="px-4 py-3 text-right font-medium">Prix</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {purchases.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  Aucun achat enregistré.
                </td>
              </tr>
            ) : (
              purchases.map((p) => (
                <tr key={p.id} className="transition-colors hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <span className="font-medium text-foreground">{p.name}</span>
                    {p.note && <span className="block text-xs text-muted-foreground">{p.note}</span>}
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                    {formatDateShort(p.purchaseDate)}
                  </td>
                  <td className="hidden px-4 py-3 text-center text-muted-foreground sm:table-cell">
                    {p.quantity}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-foreground">
                    {formatPrice(p.priceCents)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(p)}
                        aria-label="Modifier"
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(p.id)}
                        aria-label="Supprimer"
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
