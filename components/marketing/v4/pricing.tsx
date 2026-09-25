import Link from "next/link"
import { ArrowRight, Check, Clock, Mail } from "lucide-react"
import { COMMERCIAL_PLANS, LIFETIME_OFFER, PRICING_COPY, type CommercialPlan } from "@/lib/pricing/plans"
import { StaggerGroup, StaggerItem } from "@/components/ui/reveal"
import { cn } from "@/lib/utils"
import { Container, SectionIntro } from "./primitives"

/**
 * Tarifs alimentés par la SOURCE UNIQUE `lib/pricing/plans.ts`.
 * Une offre `coming_soon` n'a JAMAIS de lien vers /demarrer (bouton désactivé).
 */

function PlanCta({ plan, emphasis }: { plan: CommercialPlan; emphasis: boolean }) {
  const base = "mt-8 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition"
  if (plan.availability === "coming_soon" || !plan.cta.href) {
    return (
      <button type="button" disabled aria-disabled="true" className={cn(base, "cursor-not-allowed bg-muted text-muted-foreground")}>
        <Clock className="size-4" aria-hidden="true" />
        {plan.cta.label}
      </button>
    )
  }
  return (
    <Link
      href={plan.cta.href}
      className={cn(
        base,
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        emphasis ? "bg-foreground text-background hover:-translate-y-px" : "border border-border bg-card text-foreground hover:border-foreground/30",
      )}
    >
      {plan.cta.label}
      <ArrowRight className="size-4" aria-hidden="true" />
    </Link>
  )
}

function PlanCard({ plan }: { plan: CommercialPlan }) {
  const available = plan.availability === "self_serve"
  return (
    <div
      className={cn(
        "flex h-full flex-col rounded-3xl border bg-card p-6 sm:p-7",
        available ? "border-foreground/20 shadow-[0_30px_80px_-40px_oklch(0.25_0.08_260/0.45)]" : "border-border",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-foreground">{plan.name}</h3>
        {available ? (
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">Disponible</span>
        ) : (
          <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            {PRICING_COPY.comingSoonLabel}
          </span>
        )}
      </div>
      <p className="mt-5 flex items-baseline gap-1.5">
        <span className="text-4xl font-semibold tracking-tight text-foreground">{plan.price}</span>
        <span className="text-sm text-muted-foreground">{plan.period}</span>
      </p>
      <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">{plan.description}</p>
      <ul className="mt-6 flex flex-col gap-2.5 border-t border-border pt-6">
        {plan.highlights.map((h) => (
          <li key={h} className="flex items-start gap-2.5 text-sm text-foreground">
            <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            {h}
          </li>
        ))}
      </ul>
      <div className="mt-auto">
        <PlanCta plan={plan} emphasis={available} />
      </div>
    </div>
  )
}

export function Pricing() {
  return (
    <section id="tarifs" aria-labelledby="pricing-title" className="scroll-mt-24 border-t border-border bg-muted/40 py-24 sm:py-32">
      <Container>
        <SectionIntro titleId="pricing-title" eyebrow="Tarifs" title={PRICING_COPY.title} lead={PRICING_COPY.lead} align="center" />

        <StaggerGroup className="mt-14 grid gap-4 lg:grid-cols-3">
          {COMMERCIAL_PLANS.map((plan) => (
            <StaggerItem key={plan.id} className="h-full">
              <PlanCard plan={plan} />
            </StaggerItem>
          ))}
        </StaggerGroup>

        <div className="mt-4 grid gap-4 rounded-3xl border border-border bg-card p-6 sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-10">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-foreground">{LIFETIME_OFFER.name}</h3>
              <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                {PRICING_COPY.comingSoonLabel}
              </span>
            </div>
            <p className="mt-3 flex items-baseline gap-1.5">
              <span className="text-3xl font-semibold tracking-tight text-foreground">{LIFETIME_OFFER.price}</span>
              <span className="text-sm text-muted-foreground">{LIFETIME_OFFER.period}</span>
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{LIFETIME_OFFER.description}</p>
          </div>
          <div className="flex flex-col gap-3 border-t border-border pt-5 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
            <p className="text-sm font-semibold text-foreground">{LIFETIME_OFFER.custom.title}</p>
            <p className="text-sm leading-relaxed text-muted-foreground">{LIFETIME_OFFER.custom.description}</p>
            <Link
              href={LIFETIME_OFFER.custom.cta.href}
              className="inline-flex h-10 w-fit items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:border-foreground/30"
            >
              <Mail className="size-4 text-primary" aria-hidden="true" />
              {LIFETIME_OFFER.custom.cta.label}
            </Link>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">{PRICING_COPY.note}</p>
      </Container>
    </section>
  )
}
