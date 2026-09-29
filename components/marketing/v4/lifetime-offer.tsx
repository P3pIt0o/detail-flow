"use client"

import { useState } from "react"
import { ArrowRight, Check, Infinity as InfinityIcon, Info } from "lucide-react"
import { LIFETIME_OFFER } from "@/lib/pricing/plans"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/**
 * Encart Lifetime — alternative « paiement unique », PAS une 5ᵉ formule.
 * Compact et secondaire (moins imposant que les 4 cards), il ne détourne pas
 * l'attention des abonnements. Le CTA ouvre un simple modal d'information
 * marketing : aucun Checkout, aucun Stripe, aucun compteur dynamique.
 */
export function LifetimeOffer() {
  const [open, setOpen] = useState(false)
  const o = LIFETIME_OFFER

  return (
    <>
      <div className="mt-6 overflow-hidden rounded-3xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
              <InfinityIcon className="size-3.5" aria-hidden="true" />
              {o.eyebrow}
            </span>
            <h3 className="mt-3 text-balance text-lg font-semibold tracking-tight text-foreground sm:text-xl">
              {o.title}
            </h3>
            <p className="mt-1.5 max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground">{o.intro}</p>
          </div>

          <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:gap-6 lg:flex-col lg:items-end lg:gap-3">
            <div className="lg:text-right">
              <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-2xl font-semibold tracking-tight text-foreground">{o.priceOnce}</span>
                <span className="text-xs text-muted-foreground">{o.priceOnceLabel}</span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                ou <span className="font-medium text-foreground">{o.priceSplit}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-foreground/20 bg-background px-6 text-sm font-semibold text-foreground transition hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto"
            >
              {o.cta}
              <ArrowRight className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">{o.scarcity}</p>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
              <InfinityIcon className="size-3.5" aria-hidden="true" />
              {o.eyebrow}
            </span>
            <DialogTitle className="mt-3 text-xl">{o.modal.title}</DialogTitle>
            <DialogDescription>{o.modal.subtitle}</DialogDescription>
          </DialogHeader>

          <div className="rounded-2xl border border-border bg-muted/40 p-4">
            <ul className="flex flex-col gap-1.5">
              {o.modal.priceBullets.map((b) => (
                <li key={b} className="text-sm font-semibold text-foreground">
                  {b}
                </li>
              ))}
            </ul>
          </div>

          <ul className="mt-1 flex flex-col gap-2.5">
            {o.modal.features.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-sm text-foreground">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                {f}
              </li>
            ))}
          </ul>

          <ul className="mt-1 flex flex-col gap-2 border-t border-border pt-4">
            {o.modal.notes.map((n) => (
              <li key={n} className="flex items-start gap-2.5 text-xs leading-relaxed text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/70" aria-hidden="true" />
                {n}
              </li>
            ))}
          </ul>

          <div className="mt-2 flex flex-col gap-2 border-t border-border pt-4">
            {o.modal.legal.map((l) => (
              <p key={l} className="text-[11px] leading-relaxed text-muted-foreground">
                {l}
              </p>
            ))}
          </div>

          <div className="mt-2 flex flex-col items-center gap-2 border-t border-border pt-4">
            <a
              href={`mailto:${o.modal.contactEmail}?subject=${encodeURIComponent(o.modal.contactSubject)}`}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {o.modal.contactCta}
              <ArrowRight className="size-4" aria-hidden="true" />
            </a>
            <p className="text-[11px] text-muted-foreground">{o.modal.contactHint}</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
