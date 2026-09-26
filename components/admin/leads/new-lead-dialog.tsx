"use client"

import { useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Plus } from "lucide-react"
import { withTenant } from "@/lib/tenant-link"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { createLeadAction } from "@/app/admin/(dashboard)/leads/actions"

/**
 * Création manuelle d'un prospect. Minimum : nom + (email OU téléphone). Les
 * autres champs sont facultatifs. En cas de doublon probable, on NE crée pas
 * silencieusement : on propose « Voir le prospect » ou « Créer quand même »
 * (aucune fusion automatique irréversible).
 */
const inputCls =
  "min-h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"

export function NewLeadDialog() {
  const router = useRouter()
  const tenant = useSearchParams().get("tenant")
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [duplicate, setDuplicate] = useState<{ id: number; contactName: string } | null>(null)

  function submit(form: HTMLFormElement, force: boolean) {
    const fd = new FormData(form)
    if (force) fd.set("force", "1")
    setError(null)
    startTransition(async () => {
      const res = await createLeadAction(fd)
      if (res.ok) {
        setOpen(false)
        setDuplicate(null)
        form.reset()
        if (res.leadId) router.push(withTenant(`/admin/leads/${res.leadId}`, tenant))
        router.refresh()
      } else {
        setError(res.error)
        setDuplicate(res.duplicate ?? null)
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) {
          setError(null)
          setDuplicate(null)
        }
      }}
    >
      <DialogTrigger
        render={
          <Button>
            <Plus className="size-4" aria-hidden="true" />
            Nouveau prospect
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nouveau prospect</DialogTitle>
          <DialogDescription>Nom obligatoire, plus au moins un email ou un téléphone.</DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            submit(e.currentTarget, false)
          }}
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="l-name" className="text-sm font-medium text-foreground">
              Nom <span className="text-destructive">*</span>
            </label>
            <input id="l-name" name="contactName" required className={inputCls} placeholder="Thomas Martin" />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="l-phone" className="text-sm font-medium text-foreground">
                Téléphone
              </label>
              <input id="l-phone" name="phone" type="tel" className={inputCls} placeholder="06 12 34 56 78" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="l-email" className="text-sm font-medium text-foreground">
                Email
              </label>
              <input id="l-email" name="email" type="email" className={inputCls} placeholder="thomas@exemple.fr" />
            </div>
          </div>

          <details className="rounded-lg border border-border bg-muted/30 p-3">
            <summary className="cursor-pointer text-sm font-medium text-foreground">Détails (facultatif)</summary>
            <div className="mt-3 flex flex-col gap-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input name="vehicleBrand" className={inputCls} placeholder="Marque véhicule" aria-label="Marque véhicule" />
                <input name="vehicleModel" className={inputCls} placeholder="Modèle" aria-label="Modèle véhicule" />
              </div>
              <input name="serviceInterest" className={inputCls} placeholder="Prestation recherchée" aria-label="Prestation recherchée" />
              <textarea
                name="internalSummary"
                rows={2}
                className="w-full resize-y rounded-lg border border-border bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
                placeholder="Note interne"
                aria-label="Note interne"
              />
              <div className="flex flex-col gap-1.5">
                <label htmlFor="l-follow" className="text-sm font-medium text-foreground">
                  Relance
                </label>
                <select id="l-follow" name="followUpInDays" className={inputCls}>
                  <option value="">Aucune</option>
                  <option value="0">Aujourd&apos;hui</option>
                  <option value="1">Demain</option>
                  <option value="3">Dans 3 jours</option>
                  <option value="7">Dans 1 semaine</option>
                </select>
              </div>
            </div>
          </details>

          {error ? (
            <div className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
              <p className="text-sm text-destructive">{error}</p>
              {duplicate ? (
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={withTenant(`/admin/leads/${duplicate.id}`, tenant)}
                    className="inline-flex min-h-9 items-center rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-muted"
                  >
                    Voir le prospect
                  </Link>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={(e) => {
                      const form = e.currentTarget.closest("form")
                      if (form) submit(form, true)
                    }}
                  >
                    Créer quand même
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Création…" : "Créer le prospect"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
