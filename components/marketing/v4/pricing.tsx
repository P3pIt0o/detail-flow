import Link from "next/link"
import { ArrowRight, Check, ChevronDown, Clock, Gift, Heart, MessageSquare, Minus, Receipt } from "lucide-react"
import {
  COMMERCIAL_PLANS,
  CUSTOM_PLATFORM_OFFER,
  PLAN_JOURNEY,
  PRICING_COPY,
  type CommercialPlan,
} from "@/lib/pricing/plans"
import {
  FEE_CAP_EXPLANATION,
  LOYALTY_COPY,
  SMS_OVERAGE_NOTE,
  STRIPE_FEES_NOTE,
  feeCapLabel,
  getCommercialTierForPlan,
  smsAllowanceLabel,
} from "@/lib/pricing/commercial-rules"
import { StaggerGroup, StaggerItem } from "@/components/ui/reveal"
import { cn } from "@/lib/utils"
import { Container, DetailFlowMark, SectionIntro } from "./primitives"
import { COMPARE_CATEGORIES, COMPARE_COLUMNS } from "./pricing-data"
import { LifetimeOffer } from "./lifetime-offer"

/**
 * Tarifs alimentés par la SOURCE UNIQUE `lib/pricing/plans.ts`.
 * Une offre `coming_soon` n'a JAMAIS de lien vers /demarrer (bouton désactivé).
 * Server Component : le comparateur repliable utilise <details> natif (0 JS).
 */

function PlanCta({ plan, emphasis }: { plan: CommercialPlan; emphasis: boolean }) {
  const base =
    "mt-7 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition"
  if (plan.availability === "coming_soon" || !plan.cta.href) {
    return (
      <button
        type="button"
        disabled
        aria-disabled="true"
        className={cn(base, "cursor-not-allowed bg-muted text-muted-foreground")}
      >
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
        emphasis
          ? "bg-foreground text-background hover:-translate-y-px"
          : "border border-border bg-card text-foreground hover:border-foreground/30",
      )}
    >
      {plan.cta.label}
      <ArrowRight className="size-4" aria-hidden="true" />
    </Link>
  )
}

function PlanCard({ plan }: { plan: CommercialPlan }) {
  const available = plan.availability === "self_serve"
  const featured = plan.highlighted
  const tier = getCommercialTierForPlan(plan.licensePlan)
  const smsLine = tier ? smsAllowanceLabel(tier.sms) : null
  return (
    <div
      className={cn(
        "relative flex h-full flex-col rounded-3xl border bg-card p-6",
        featured
          ? "border-primary/40 shadow-[0_30px_80px_-40px_oklch(0.55_0.16_255/0.5)]"
          : available
            ? "border-foreground/20"
            : "border-border",
      )}
    >
      {plan.badge ? (
        <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground shadow-sm">
          {plan.badge}
        </span>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-foreground">{plan.name}</h3>
        {available ? (
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
            Disponible
          </span>
        ) : (
          <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            {PRICING_COPY.comingSoonLabel}
          </span>
        )}
      </div>

      <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>

      <p className="mt-5 flex items-baseline gap-1.5">
        <span className="text-4xl font-semibold tracking-tight text-foreground">{plan.price}</span>
        <span className="text-sm text-muted-foreground">{plan.period}</span>
      </p>

      {plan.trial ? (
        <span className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
          <Gift className="size-3.5" aria-hidden="true" />
          {plan.trial}
        </span>
      ) : (
        <span className="mt-3 text-[11px] font-medium text-muted-foreground">Sans engagement</span>
      )}

      <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">{plan.description}</p>

      <ul className="mt-6 flex flex-col gap-2.5 border-t border-border pt-6">
        {plan.highlights.map((h) => (
          <li key={h} className="flex items-start gap-2.5 text-sm text-foreground">
            <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            {h}
          </li>
        ))}
      </ul>

      {tier ? (
        <dl className="mt-5 flex flex-col gap-2 border-t border-border pt-5">
          <div className="flex items-start gap-2.5">
            <Receipt className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <dt className="sr-only">Frais DetailFlow</dt>
              <dd className="text-[13px] font-medium leading-snug text-foreground">{feeCapLabel(tier.fee)}</dd>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <MessageSquare className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <dt className="sr-only">SMS</dt>
              <dd className="text-[13px] leading-snug text-muted-foreground">{smsLine ?? "Module SMS non inclus"}</dd>
            </div>
          </div>
        </dl>
      ) : null}

      <div className="mt-auto">
        <PlanCta plan={plan} emphasis={available || !!featured} />
      </div>
    </div>
  )
}

/** « DetailFlow grandit avec vous » — montée en gamme sans lire le tableau. */
function GrowthJourney() {
  return (
    <div className="mt-4 rounded-3xl border border-border bg-card p-6 sm:p-8">
      <h3 className="text-pretty text-lg font-semibold text-foreground">DetailFlow grandit avec votre activité.</h3>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Une trajectoire claire, de vos premières réservations au pilotage d'un centre.
      </p>
      <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PLAN_JOURNEY.map((step, i) => (
          <li key={step.planId} className="relative rounded-2xl border border-border bg-background p-4">
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                {i + 1}
              </span>
              <p className="text-sm font-semibold text-foreground">{step.name}</p>
            </div>
            <p className="mt-2 text-base font-semibold text-foreground">{step.verb}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.audience}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** Comparateur repliable, organisé par catégories — <details> natif. */
function FeatureCompare() {
  return (
    <details className="group mt-4 overflow-hidden rounded-3xl border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-6 text-sm font-semibold text-foreground [&::-webkit-details-marker]:hidden">
        {PRICING_COPY.compareLabel}
        <ChevronDown
          className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>

      <div className="border-t border-border px-4 pb-6 pt-2 sm:px-6">
        {/* En-tête de colonnes, sticky pour rester lisible en défilant */}
        <div className="sticky top-16 z-10 -mx-4 grid grid-cols-[minmax(0,1fr)_repeat(4,minmax(2.5rem,1fr))] gap-x-1 border-b border-border bg-card/95 px-4 py-3 text-[11px] font-semibold text-muted-foreground backdrop-blur sm:mx-0 sm:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))] sm:px-0 sm:text-xs">
          <span className="sr-only sm:not-sr-only">Fonctionnalité</span>
          {COMPARE_COLUMNS.map((c) => (
            <span key={c.id} className="text-center text-foreground">
              {c.name}
            </span>
          ))}
        </div>

        {COMPARE_CATEGORIES.map((cat) => (
          <div key={cat.name} className="mt-4">
            <p className="px-1 text-[11px] font-bold uppercase tracking-wide text-primary">{cat.name}</p>
            <div className="mt-1.5">
              {cat.rows.map((row) => (
                <div
                  key={row.label}
                  className="grid grid-cols-[minmax(0,1fr)_repeat(4,minmax(2.5rem,1fr))] items-center gap-x-1 border-t border-border/60 py-2.5 text-sm sm:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]"
                >
                  <span className="pr-2 text-pretty text-[13px] leading-snug text-foreground">{row.label}</span>
                  {COMPARE_COLUMNS.map((c) => {
                    const value = row.values[c.id]
                    if (value === "upcoming") {
                      return (
                        <span key={c.id} className="flex items-center justify-center">
                          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase leading-none tracking-wide text-muted-foreground sm:text-[10px]">
                            À venir
                          </span>
                          <span className="sr-only">À venir dans {c.name}</span>
                        </span>
                      )
                    }
                    return (
                      <span key={c.id} className="flex items-center justify-center">
                        {value ? (
                          <>
                            <Check className="size-4 text-primary" aria-hidden="true" />
                            <span className="sr-only">Inclus dans {c.name}</span>
                          </>
                        ) : (
                          <>
                            <Minus className="size-4 text-muted-foreground/40" aria-hidden="true" />
                            <span className="sr-only">Non inclus dans {c.name}</span>
                          </>
                        )}
                      </span>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        ))}

        <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
          Certaines fonctionnalités des offres payantes arrivent progressivement. Les formules payantes seront activées
          prochainement.
        </p>
      </div>
    </details>
  )
}

/** Prestation sur mesure — bloc premium sombre (rupture visuelle assumée). */
function CustomPlatform() {
  const o = CUSTOM_PLATFORM_OFFER
  return (
    <div className="df-product mt-6 overflow-hidden rounded-3xl border border-border bg-background text-foreground shadow-[0_50px_120px_-50px_oklch(0.2_0.06_260/0.7)]">
      <div className="grid gap-8 p-7 sm:p-10 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:items-center lg:gap-10">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
            {o.eyebrow}
          </span>
          <h3 className="mt-4 text-balance text-2xl font-semibold tracking-tight sm:text-3xl">{o.title}</h3>
          <p className="mt-3 max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground">{o.description}</p>

          <p className="mt-6 text-balance text-lg font-medium leading-snug text-foreground sm:text-xl">
            {o.argument}
          </p>

          <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
            {o.bullets.map((b) => (
              <li key={b} className="flex items-start gap-2.5 text-sm text-foreground/90">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                {b}
              </li>
            ))}
          </ul>

          <div className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-center">
            <p className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold tracking-tight sm:text-3xl">{o.price}</span>
            </p>
            <Link
              href={o.cta.href}
              className="inline-flex h-11 w-fit items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {o.cta.label}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>

          <p className="mt-5 text-sm font-medium text-foreground">{o.ownership}</p>
          <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-muted-foreground">{o.ownershipNote}</p>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{o.priceNote}</p>
        </div>

        {/* Aperçu abstrait d'une plateforme dédiée, dans l'identité DetailFlow */}
        <div className="hidden lg:block" aria-hidden="true">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_30px_70px_-40px_oklch(0.2_0.06_260/0.8)]">
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <DetailFlowMark className="size-5" />
              <span className="text-xs font-semibold text-foreground">Votre plateforme</span>
              <span className="ml-auto text-[10px] font-medium text-muted-foreground">votre-marque.fr</span>
            </div>
            <div className="mt-3 flex gap-3">
              <div className="flex w-14 shrink-0 flex-col gap-2">
                <span className="h-2 rounded-full bg-primary/50" />
                <span className="h-2 rounded-full bg-muted" />
                <span className="h-2 rounded-full bg-muted" />
                <span className="h-2 rounded-full bg-muted" />
              </div>
              <div className="flex-1">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-border bg-background p-2.5">
                    <span className="block h-1.5 w-8 rounded-full bg-muted" />
                    <span className="mt-2 block h-3 w-12 rounded bg-primary/40" />
                  </div>
                  <div className="rounded-lg border border-border bg-background p-2.5">
                    <span className="block h-1.5 w-8 rounded-full bg-muted" />
                    <span className="mt-2 block h-3 w-10 rounded bg-foreground/30" />
                  </div>
                </div>
                <div className="mt-2 rounded-lg border border-border bg-background p-2.5">
                  <span className="block h-1.5 w-16 rounded-full bg-muted" />
                  <div className="mt-2 flex items-end gap-1.5">
                    <span className="h-6 w-3 rounded-sm bg-primary/30" />
                    <span className="h-9 w-3 rounded-sm bg-primary/50" />
                    <span className="h-5 w-3 rounded-sm bg-primary/25" />
                    <span className="h-11 w-3 rounded-sm bg-primary/60" />
                    <span className="h-7 w-3 rounded-sm bg-primary/40" />
                    <span className="h-10 w-3 rounded-sm bg-primary/55" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Bloc fidélité premium : l'avantage d'abord, la règle de reset ensuite. */
function LoyaltyBlock() {
  return (
    <div className="mt-6 overflow-hidden rounded-3xl border border-border bg-card p-6 sm:p-8">
      <div className="flex items-start gap-4">
        <span
          className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"
          aria-hidden="true"
        >
          <Heart className="size-6" />
        </span>
        <div>
          <h3 className="text-pretty text-lg font-semibold text-foreground">{LOYALTY_COPY.title}</h3>
          <p className="mt-1.5 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
            {LOYALTY_COPY.body}
          </p>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{LOYALTY_COPY.resetNote}</p>
        </div>
      </div>
    </div>
  )
}

export function Pricing() {
  return (
    <section
      id="tarifs"
      aria-labelledby="pricing-title"
      className="scroll-mt-24 border-t border-border bg-muted/40 py-24 sm:py-32"
    >
      <Container>
        <SectionIntro
          titleId="pricing-title"
          eyebrow={PRICING_COPY.eyebrow}
          title={PRICING_COPY.title}
          lead={PRICING_COPY.lead}
          align="center"
        />

        {/* Message fort : premier mois offert */}
        <div className="mx-auto mt-8 flex max-w-2xl flex-col items-center gap-1.5 rounded-2xl border border-primary/25 bg-primary/5 px-5 py-4 text-center">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Gift className="size-4 text-primary" aria-hidden="true" />
            {PRICING_COPY.trialHeadline}
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">{PRICING_COPY.trialSub}</p>
        </div>

        <StaggerGroup className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {COMMERCIAL_PLANS.map((plan) => (
            <StaggerItem key={plan.id} className="h-full">
              <PlanCard plan={plan} />
            </StaggerItem>
          ))}
        </StaggerGroup>

        {/* Transparence sur les frais DetailFlow plafonnés (jamais cachés) */}
        <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
          {FEE_CAP_EXPLANATION} {STRIPE_FEES_NOTE} {SMS_OVERAGE_NOTE}
        </p>

        <LoyaltyBlock />

        <LifetimeOffer />

        <GrowthJourney />

        <FeatureCompare />

        <CustomPlatform />

        <p className="mt-6 text-center text-xs text-muted-foreground">{PRICING_COPY.note}</p>
      </Container>
    </section>
  )
}
