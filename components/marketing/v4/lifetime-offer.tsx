"use client"

import Link from "next/link"
import { ArrowRight, Check, Infinity as InfinityIcon, Minus } from "lucide-react"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  LIFETIME_COPY,
  LIFETIME_OFFER,
  LIFETIME_TEASER,
  SMS_OVERAGE_NOTE,
  STRIPE_FEES_NOTE,
  formatEuroCents,
} from "@/lib/pricing/commercial-rules"

/**
 * DetailFlow Lifetime — encart distinct (PAS une 5ᵉ colonne de la grille).
 * L'accroche ouvre une modal premium. Client Component (interactivité modale).
 *
 * CTA HONNÊTE : « Demander mon accès » (mailto). Aucun encaissement tant que le
 * lot paiement Lifetime n'est pas livré. Le compteur affiche la CAPACITÉ TOTALE
 * (50 licences) — jamais un faux nombre de licences restantes.
 */
export function LifetimeOffer() {
  const oneTime = formatEuroCents(LIFETIME_OFFER.oneTimePriceCents)
  const installment = formatEuroCents(LIFETIME_OFFER.installmentAmountCents)
  const installmentTotal = formatEuroCents(LIFETIME_OFFER.installmentTotalCents)

  return (
    <div className="mt-6 overflow-hidden rounded-3xl border border-primary/30 bg-primary/5 p-6 sm:p-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <span
            className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"
            aria-hidden="true"
          >
            <InfinityIcon className="size-6" />
          </span>
          <div>
            <p className="text-pretty text-lg font-semibold text-foreground">{LIFETIME_TEASER.hook}</p>
            <p className="mt-1 text-sm text-muted-foreground">{LIFETIME_TEASER.subtitle}</p>
          </div>
        </div>

        <Dialog>
          <DialogTrigger
            render={
              <button
                type="button"
                className="inline-flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-full bg-foreground px-6 text-sm font-semibold text-background transition hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto"
              />
            }
          >
            {LIFETIME_TEASER.cta}
            <ArrowRight className="size-4" aria-hidden="true" />
          </DialogTrigger>

          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
              <InfinityIcon className="size-3.5" aria-hidden="true" />
              Lifetime
            </span>

            <DialogTitle className="mt-3 text-xl font-semibold tracking-tight text-foreground">
              {LIFETIME_COPY.name}
            </DialogTitle>
            <DialogDescription className="mt-1 text-pretty text-sm leading-relaxed text-muted-foreground">
              {LIFETIME_COPY.pitch}
            </DialogDescription>

            {/* Prix : comptant vs 2 fois (plus cher, affiché clairement) */}
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
                <p className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-semibold tracking-tight text-foreground">{oneTime}</span>
                  <span className="text-xs text-muted-foreground">HT</span>
                </p>
                <p className="mt-1 text-xs font-medium text-primary">{LIFETIME_COPY.oneTimeLabel}</p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-semibold tracking-tight text-foreground">
                    {LIFETIME_OFFER.installmentCount} × {installment}
                  </span>
                  <span className="text-xs text-muted-foreground">HT</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  soit {installmentTotal} HT — {LIFETIME_COPY.installmentNote}
                </p>
              </div>
            </div>

            <p className="mt-4 inline-flex w-fit items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-[11px] font-semibold text-foreground">
              {LIFETIME_COPY.licensesLabel}
            </p>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-primary">{LIFETIME_COPY.includedTitle}</p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {LIFETIME_COPY.included.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-[13px] leading-snug text-foreground">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {LIFETIME_COPY.excludedTitle}
                </p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {LIFETIME_COPY.excluded.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-[13px] leading-snug text-muted-foreground">
                      <Minus className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/50" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3 border-t border-border pt-5">
              <Link
                href={LIFETIME_COPY.cta.href}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {LIFETIME_COPY.cta.label}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <DialogClose
                render={
                  <button
                    type="button"
                    className="inline-flex h-9 w-full items-center justify-center rounded-full text-xs font-medium text-muted-foreground transition hover:text-foreground"
                  />
                }
              >
                Fermer
              </DialogClose>
            </div>

            <div className="mt-4 flex flex-col gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <p>{LIFETIME_COPY.terms}</p>
              <p>{STRIPE_FEES_NOTE}</p>
              <p>{SMS_OVERAGE_NOTE}</p>
              <p>{LIFETIME_COPY.ownershipNote}</p>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
