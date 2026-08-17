"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Trash2, Plus } from "lucide-react"
import { formatPrice } from "@/lib/format"
import {
  createPromoCode,
  togglePromoCode,
  deletePromoCode,
  type PromoCodeRow,
} from "@/app/admin/(dashboard)/parametres/promo-actions"

type Props = { codes: PromoCodeRow[] }

function formatDiscount(row: PromoCodeRow): string {
  return row.discountType === "percent" ? `-${row.discountValue} %` : `-${formatPrice(row.discountValue)}`
}

function formatValidity(row: PromoCodeRow): string {
  const fmt = (d: Date | null) => (d ? new Date(d).toLocaleDateString("fr-FR") : null)
  const s = fmt(row.startsAt)
  const e = fmt(row.endsAt)
  if (!s && !e) return "Toujours"
  if (s && e) return `${s} → ${e}`
  if (s) return `Dès le ${s}`
  return `Jusqu'au ${e}`
}

export function PromoSettings({ codes }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [code, setCode] = useState("")
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("percent")
  const [discountValue, setDiscountValue] = useState("")
  const [startsAt, setStartsAt] = useState("")
  const [endsAt, setEndsAt] = useState("")
  const [maxUses, setMaxUses] = useState("")
  const [active, setActive] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function submit() {
    setError(null)
    const value = Number.parseFloat(discountValue)
    if (!code.trim()) return setError("Code requis.")
    if (!Number.isFinite(value) || value <= 0) return setError("Valeur de remise invalide.")
    startTransition(async () => {
      const res = await createPromoCode({
        code,
        discountType,
        discountValue: value,
        startsAt: startsAt || null,
        endsAt: endsAt || null,
        maxUses: maxUses ? Number.parseInt(maxUses, 10) : null,
        active,
      })
      if (res.ok) {
        setCode("")
        setDiscountValue("")
        setStartsAt("")
        setEndsAt("")
        setMaxUses("")
        setActive(true)
        router.refresh()
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <div className="max-w-3xl space-y-8">
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-card-foreground">Nouveau code promo</h2>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          Remise en pourcentage ou montant fixe, appliquée au sous-total des prestations. La remise est validée et
          recalculée côté serveur à chaque réservation.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="promo-code" className="mb-1.5 block text-sm font-medium text-card-foreground">
              Code
            </label>
            <input
              id="promo-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="WELCOME10"
              className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm uppercase text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label htmlFor="promo-type" className="mb-1.5 block text-sm font-medium text-card-foreground">
              Type de remise
            </label>
            <select
              id="promo-type"
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as "percent" | "fixed")}
              className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="percent">Pourcentage (%)</option>
              <option value="fixed">Montant fixe (€)</option>
            </select>
          </div>
          <div>
            <label htmlFor="promo-value" className="mb-1.5 block text-sm font-medium text-card-foreground">
              {discountType === "percent" ? "Pourcentage (1-100)" : "Montant (€)"}
            </label>
            <input
              id="promo-value"
              type="number"
              min="0"
              step={discountType === "percent" ? "1" : "0.01"}
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              placeholder={discountType === "percent" ? "10" : "20"}
              className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label htmlFor="promo-max" className="mb-1.5 block text-sm font-medium text-card-foreground">
              Utilisations max (facultatif)
            </label>
            <input
              id="promo-max"
              type="number"
              min="1"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              placeholder="Illimité"
              className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label htmlFor="promo-start" className="mb-1.5 block text-sm font-medium text-card-foreground">
              Début (facultatif)
            </label>
            <input
              id="promo-start"
              type="date"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label htmlFor="promo-end" className="mb-1.5 block text-sm font-medium text-card-foreground">
              Fin (facultatif)
            </label>
            <input
              id="promo-end"
              type="date"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm text-card-foreground">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4" />
          Actif dès la création
        </label>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Créer le code
        </button>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-card-foreground">Codes existants</h2>
        {codes.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Aucun code promo pour le moment.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[540px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Code</th>
                  <th className="pb-2 pr-3 font-medium">Remise</th>
                  <th className="pb-2 pr-3 font-medium">Validité</th>
                  <th className="pb-2 pr-3 font-medium">Utilisations</th>
                  <th className="pb-2 pr-3 font-medium">Statut</th>
                  <th className="pb-2 font-medium sr-only">Actions</th>
                </tr>
              </thead>
              <tbody>
                {codes.map((row) => (
                  <PromoRow key={row.id} row={row} onChanged={() => router.refresh()} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function PromoRow({ row, onChanged }: { row: PromoCodeRow; onChanged: () => void }) {
  const [pending, startTransition] = useTransition()
  return (
    <tr className="border-b border-border/60 last:border-0">
      <td className="py-3 pr-3 font-mono font-semibold text-card-foreground">{row.code}</td>
      <td className="py-3 pr-3 text-card-foreground">{formatDiscount(row)}</td>
      <td className="py-3 pr-3 text-muted-foreground">{formatValidity(row)}</td>
      <td className="py-3 pr-3 text-muted-foreground">
        {row.usageCount}
        {row.maxUses != null ? ` / ${row.maxUses}` : ""}
      </td>
      <td className="py-3 pr-3">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await togglePromoCode(row.id, !row.active)
              onChanged()
            })
          }
          className={
            row.active
              ? "rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary"
              : "rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
          }
        >
          {row.active ? "Actif" : "Inactif"}
        </button>
      </td>
      <td className="py-3 text-right">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await deletePromoCode(row.id)
              onChanged()
            })
          }
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          aria-label={`Supprimer le code ${row.code}`}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </button>
      </td>
    </tr>
  )
}
