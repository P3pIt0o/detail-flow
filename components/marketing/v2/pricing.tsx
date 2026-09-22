import Link from "next/link"
import { ArrowRight, Check, Clock, Mail, Sparkles } from "lucide-react"
import { COMMERCIAL_PLANS, LIFETIME_OFFER, PRICING_COPY, type CommercialPlan } from "@/lib/pricing/plans"
import { Reveal, StaggerGroup, StaggerItem } from "@/components/ui/reveal"

/**
 * Pricing — présentation commerciale alimentée par la SOURCE UNIQUE
 * `lib/pricing/plans.ts` (plus aucun prix codé dans le marketing).
 *
 * Règle appliquée : une offre `coming_soon` (Pro, Business, Lifetime tant que
 * le Checkout n'est pas livré) N'A PAS de lien vers /demarrer. Son CTA est un
 * bouton désactivé « Bientôt disponible » — impossible de créer silencieusement
 * un compte FREE en croyant sélectionner une offre payante. Seule « Starter »
 * (self_serve → FREE) mène réellement au self-service.
 */

/** CTA d'une offre : lien réel si self_serve, bouton désactivé si coming_soon. */
function PlanCta({ plan, highlighted }: { plan: CommercialPlan; highlighted: boolean }) {
  const base =
    "mt-8 inline-flex h-11 items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold transition-all"

  if (plan.availability === "coming_soon" || !plan.cta.href) {
    return (
      <button
        type="button"
        disabled
        aria-disabled="true"
        className={`${base} cursor-not-allowed border border-border bg-muted/40 text-muted-foreground`}
      >
        <Clock className="size-4" aria-hidden="true" />
        {plan.cta.label}
      </button>
    )
  }

  return (
    <Link
      href={plan.cta.href}
      className={`${base} ${
        highlighted
          ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:brightness-110"
          : "border border-border bg-background text-foreground hover:border-primary/50"
      }`}
    >
      {plan.cta.label}
      <ArrowRight className="size-4" aria-hidden="true" />
    </Link>
  )
}

export function Pricing() {
  return (
    <section id="tarifs" className="scroll-mt-20 border-t border-border/60 bg-card/20">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <Reveal>
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">{PRICING_COPY.title}</h2>
            <p className="mx-auto mt-4 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
              {PRICING_COPY.lead}
            </p>
          </div>
        </Reveal>

        {/* Offres principales */}
        <StaggerGroup className="mt-12 grid items-stretch gap-6 lg:grid-cols-3">
          {COMMERCIAL_PLANS.map((plan) => {
            const comingSoon = plan.availability === "coming_soon"
            return (
              <StaggerItem key={plan.id}>
                <div
                  className={`relative flex h-full flex-col rounded-2xl border p-6 sm:p-8 ${
                    plan.highlighted
                      ? "border-primary/50 bg-primary/[0.06] shadow-xl shadow-primary/10"
                      : "border-border bg-card"
                  } ${comingSoon ? "opacity-80" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-lg font-semibold">{plan.name}</h3>
                    {comingSoon ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-semibold text-muted-foreground">
                        <Clock className="size-3.5" aria-hidden="true" />
                        {PRICING_COPY.comingSoonLabel}
                      </span>
                    ) : (
                      plan.badge && (
                        <span className="inline-flex items-center rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                          {plan.badge}
                        </span>
                      )
                    )}
                  </div>
                  <div className="mt-4 flex items-baseline gap-1.5">
                    <span className="text-4xl font-bold tracking-tight">{plan.price}</span>
                    <span className="text-sm text-muted-foreground">{plan.period}</span>
                  </div>
                  <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">{plan.description}</p>
                  <ul className="mt-6 space-y-3">
                    {plan.highlights.map((f) => (
                      <li key={f} className="flex items-start gap-3 text-sm leading-relaxed text-foreground">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <PlanCta plan={plan} highlighted={Boolean(plan.highlighted)} />
                </div>
              </StaggerItem>
            )
          })}
        </StaggerGroup>

        {/* Offre Lifetime (bientôt disponible) + adaptations sur mesure */}
        <Reveal delay={0.1}>
          <div className="mt-6 overflow-hidden rounded-2xl border border-primary/25 bg-primary/[0.06] p-6 sm:p-8">
            <div className="grid gap-8 lg:grid-cols-2">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-background/40 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary">
                    <Sparkles className="size-3.5" aria-hidden="true" />
                    {LIFETIME_OFFER.badge}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-semibold text-muted-foreground">
                    <Clock className="size-3.5" aria-hidden="true" />
                    {PRICING_COPY.comingSoonLabel}
                  </span>
                </div>
                <div className="mt-4 flex items-baseline gap-1.5">
                  <span className="text-4xl font-bold tracking-tight">{LIFETIME_OFFER.price}</span>
                  <span className="text-sm text-muted-foreground">{LIFETIME_OFFER.period}</span>
                </div>
                <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">{LIFETIME_OFFER.description}</p>
                <ul className="mt-6 space-y-3">
                  {LIFETIME_OFFER.highlights.map((f) => (
                    <li key={f} className="flex items-start gap-3 text-sm leading-relaxed text-foreground">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                      {f}
                    </li>
                  ))}
                </ul>
                <PlanCta plan={LIFETIME_OFFER} highlighted={false} />
              </div>

              {/* Adaptations sur mesure — simple contact (pas un achat) */}
              <div className="rounded-2xl border border-border bg-card/60 p-6">
                <h3 className="text-lg font-semibold">{LIFETIME_OFFER.custom.title}</h3>
                <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">
                  {LIFETIME_OFFER.custom.description}
                </p>
                <Link
                  href={LIFETIME_OFFER.custom.cta.href}
                  className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-full border border-primary/40 bg-background px-6 text-sm font-semibold text-foreground transition-colors hover:border-primary/70"
                >
                  <Mail className="size-4 text-primary" aria-hidden="true" />
                  {LIFETIME_OFFER.custom.cta.label}
                </Link>
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.15}>
          <p className="mt-6 text-center text-xs text-muted-foreground">{PRICING_COPY.note}</p>
        </Reveal>
      </div>
    </section>
  )
}
