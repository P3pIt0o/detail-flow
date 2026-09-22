import Link from "next/link"
import { ArrowRight, Check, Mail, Sparkles } from "lucide-react"
import { marketingV2 } from "@/config/marketing"
import { Reveal, StaggerGroup, StaggerItem } from "@/components/ui/reveal"

/**
 * Pricing v2 — présentation commerciale (Lot 3).
 *
 * Les prix proviennent de `config/marketing.ts` (valeurs validées en Phase 2).
 * Le moteur d'entitlements et Stripe Billing (Lots 4/5) ne sont PAS branchés :
 * tous les CTA d'offre pointent vers le self-service « Créer mon espace ».
 *
 * L'offre Lifetime précise clairement que les adaptations sur mesure ne sont
 * pas incluses automatiquement et se traitent via contact@detailflow.fr.
 */
export function Pricing() {
  const { pricing } = marketingV2
  const { lifetime } = pricing
  return (
    <section id="tarifs" className="scroll-mt-20 border-t border-border/60 bg-card/20">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <Reveal>
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">{pricing.title}</h2>
            <p className="mx-auto mt-4 max-w-2xl text-pretty leading-relaxed text-muted-foreground">{pricing.lead}</p>
          </div>
        </Reveal>

        {/* Offres récurrentes */}
        <StaggerGroup className="mt-12 grid items-stretch gap-6 lg:grid-cols-3">
          {pricing.plans.map((plan) => (
            <StaggerItem key={plan.id}>
              <div
                className={`flex h-full flex-col rounded-2xl border p-6 sm:p-8 ${
                  plan.highlighted
                    ? "border-primary/50 bg-primary/[0.06] shadow-xl shadow-primary/10"
                    : "border-border bg-card"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold">{plan.name}</h3>
                  {plan.badge && (
                    <span className="inline-flex items-center rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                      {plan.badge}
                    </span>
                  )}
                </div>
                <div className="mt-4 flex items-baseline gap-1.5">
                  <span className="text-4xl font-bold tracking-tight">{plan.price}</span>
                  <span className="text-sm text-muted-foreground">{plan.period}</span>
                </div>
                <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">{plan.description}</p>
                <ul className="mt-6 space-y-3">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-3 text-sm leading-relaxed text-foreground">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.cta.href}
                  className={`mt-8 inline-flex h-11 items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold transition-all ${
                    plan.highlighted
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:brightness-110"
                      : "border border-border bg-background text-foreground hover:border-primary/50"
                  }`}
                >
                  {plan.cta.label}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </div>
            </StaggerItem>
          ))}
        </StaggerGroup>

        {/* Offre Lifetime + adaptations sur mesure */}
        <Reveal delay={0.1}>
          <div className="mt-6 overflow-hidden rounded-2xl border border-primary/25 bg-primary/[0.06] p-6 sm:p-8">
            <div className="grid gap-8 lg:grid-cols-2">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-background/40 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary">
                  <Sparkles className="size-3.5" aria-hidden="true" />
                  {lifetime.badge}
                </span>
                <div className="mt-4 flex items-baseline gap-1.5">
                  <span className="text-4xl font-bold tracking-tight">{lifetime.price}</span>
                  <span className="text-sm text-muted-foreground">{lifetime.period}</span>
                </div>
                <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">{lifetime.description}</p>
                <ul className="mt-6 space-y-3">
                  {lifetime.features.map((f) => (
                    <li key={f} className="flex items-start gap-3 text-sm leading-relaxed text-foreground">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={lifetime.cta.href}
                  className="mt-8 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:brightness-110"
                >
                  {lifetime.cta.label}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </div>

              {/* Adaptations sur mesure — clairement non incluses dans le prix */}
              <div className="rounded-2xl border border-border bg-card/60 p-6">
                <h3 className="text-lg font-semibold">{lifetime.custom.title}</h3>
                <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">
                  {lifetime.custom.description}
                </p>
                <Link
                  href={lifetime.custom.cta.href}
                  className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-full border border-primary/40 bg-background px-6 text-sm font-semibold text-foreground transition-colors hover:border-primary/70"
                >
                  <Mail className="size-4 text-primary" aria-hidden="true" />
                  {lifetime.custom.cta.label}
                </Link>
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.15}>
          <p className="mt-6 text-center text-xs text-muted-foreground">{pricing.note}</p>
        </Reveal>
      </div>
    </section>
  )
}
