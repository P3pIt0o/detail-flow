import Image from "next/image"
import Link from "next/link"
import { ArrowRight, ChevronRight, Check } from "lucide-react"
import { marketingV3 } from "@/config/marketing"
import { Reveal, StaggerGroup, StaggerItem } from "@/components/ui/reveal"
import { ScreenshotPlaceholder } from "@/components/marketing/v2/screenshot-placeholder"

type Feature = (typeof marketingV3.features)[number]

/** Bandeau d'étapes horizontal (chips reliés par des flèches), responsive. */
function FlowStrip({ steps }: { steps: readonly string[] }) {
  return (
    <ol className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-2">
      {steps.map((step, i) => (
        <li key={step} className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground">
            {step}
          </span>
          {i < steps.length - 1 && (
            <ChevronRight className="size-4 shrink-0 text-primary" aria-hidden="true" />
          )}
        </li>
      ))}
    </ol>
  )
}

/** Média produit d'une section : capture réelle ou placeholder balisé. */
function FeatureMedia({ media }: { media: Feature["media"] }) {
  if (media.type === "image") {
    return (
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-primary/10">
        <Image
          src={media.src || "/placeholder.svg"}
          alt={media.alt}
          width={1400}
          height={900}
          loading="lazy"
          sizes="(max-width: 1024px) 100vw, 520px"
          className="h-auto w-full"
        />
      </div>
    )
  }
  return <ScreenshotPlaceholder label={media.label} ratio="16 / 10" />
}

/** Section fonctionnelle : alternance texte / produit, H2 SEO explicite. */
export function FeatureSection({ feature }: { feature: Feature }) {
  const hasFlow = "flow" in feature && Array.isArray(feature.flow)
  const hasPoints = "points" in feature && Array.isArray(feature.points)
  const footnote = "footnote" in feature ? feature.footnote : undefined

  return (
    <section id={feature.id} className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <Reveal className={feature.reversed ? "lg:order-2" : undefined}>
            <div>
              <h2 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl">{feature.h2}</h2>
              <p className="mt-4 max-w-md text-pretty leading-relaxed text-muted-foreground">{feature.lead}</p>

              {hasFlow && <FlowStrip steps={feature.flow} />}

              {hasPoints && (
                <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                  {feature.points.map((p) => (
                    <li key={p} className="flex items-center gap-2.5 text-sm font-medium text-foreground">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                        <Check className="size-3.5" aria-hidden="true" />
                      </span>
                      {p}
                    </li>
                  ))}
                </ul>
              )}

              {footnote && <p className="mt-6 text-xs leading-relaxed text-muted-foreground">{footnote}</p>}
            </div>
          </Reveal>

          <Reveal delay={0.1} className={feature.reversed ? "lg:order-1" : undefined}>
            <FeatureMedia media={feature.media} />
          </Reveal>
        </div>
      </div>
    </section>
  )
}

/** Problème éparpillé -> convergence vers DetailFlow. */
export function ProblemConverge() {
  const { problem } = marketingV3
  return (
    <section className="border-t border-border/60 bg-card/20">
      <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-20 lg:px-8">
        <Reveal>
          <h2 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl">{problem.title}</h2>
          <p className="mx-auto mt-4 max-w-xl text-pretty leading-relaxed text-muted-foreground">{problem.lead}</p>
        </Reveal>
        <Reveal delay={0.08}>
          <ul className="mx-auto mt-8 flex max-w-2xl flex-wrap justify-center gap-2">
            {problem.scattered.map((item) => (
              <li
                key={item}
                className="rounded-full border border-border bg-background px-3.5 py-1.5 text-sm text-muted-foreground"
              >
                {item}
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={0.14}>
          <div className="mt-8 flex flex-col items-center">
            <span className="text-primary" aria-hidden="true">
              ↓
            </span>
            <span className="mt-4 inline-flex items-center rounded-full bg-primary px-5 py-2 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/30">
              {problem.convergeLabel}
            </span>
            <p className="mt-5 max-w-md text-balance text-lg font-semibold text-foreground">
              {problem.convergeMessage}
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/** Intro des sections fonctionnelles (H2 SEO « tout ce qu'il faut »). */
export function Overview() {
  const { overview } = marketingV3
  return (
    <section id={overview.id} className="scroll-mt-20">
      <div className="mx-auto max-w-3xl px-4 pt-16 text-center sm:px-6 sm:pt-20 lg:px-8">
        <Reveal>
          <h2 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl">{overview.title}</h2>
          <p className="mx-auto mt-4 max-w-xl text-pretty leading-relaxed text-muted-foreground">{overview.lead}</p>
        </Reveal>
      </div>
    </section>
  )
}

/** Page / site public : trois options claires. */
export function SiteOptions() {
  const { site } = marketingV3
  return (
    <section id={site.id} className="scroll-mt-20 border-t border-border/60 bg-card/20">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl">{site.h2}</h2>
            <p className="mx-auto mt-4 max-w-xl text-pretty leading-relaxed text-muted-foreground">{site.lead}</p>
          </div>
        </Reveal>
        <StaggerGroup className="mt-10 grid gap-5 md:grid-cols-3">
          {site.options.map((opt) => (
            <StaggerItem key={opt.title}>
              <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-6">
                <h3 className="text-base font-semibold text-foreground">{opt.title}</h3>
                <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">{opt.description}</p>
              </div>
            </StaggerItem>
          ))}
        </StaggerGroup>
      </div>
    </section>
  )
}

/** Adaptation métier : mêmes briques, prestations différentes. */
export function Adaptation() {
  const { adaptation } = marketingV3
  return (
    <section id={adaptation.id} className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl">{adaptation.h2}</h2>
            <p className="mx-auto mt-4 max-w-xl text-pretty leading-relaxed text-muted-foreground">
              {adaptation.lead}
            </p>
          </div>
        </Reveal>
        <StaggerGroup className="mt-10 grid gap-5 md:grid-cols-3">
          {adaptation.examples.map((ex) => (
            <StaggerItem key={ex.metier}>
              <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-6">
                <h3 className="text-base font-semibold text-foreground">{ex.metier}</h3>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {ex.fields.map((f) => (
                    <li
                      key={f}
                      className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground"
                    >
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            </StaggerItem>
          ))}
        </StaggerGroup>
      </div>
    </section>
  )
}

/** CTA final. */
export function FinalCtaV3() {
  const { finalCta } = marketingV3
  return (
    <section className="border-t border-border/60">
      <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 sm:py-24 lg:px-8">
        <Reveal>
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">{finalCta.h2}</h2>
          <p className="mx-auto mt-4 max-w-xl text-pretty leading-relaxed text-muted-foreground">
            {finalCta.subtitle}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={finalCta.primaryCta.href}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-8 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:brightness-110 sm:w-auto"
            >
              {finalCta.primaryCta.label}
              <ArrowRight className="size-5" aria-hidden="true" />
            </Link>
            <Link
              href={finalCta.secondaryCta.href}
              className="inline-flex h-12 w-full items-center justify-center rounded-full border border-border bg-card/50 px-8 text-base font-semibold text-foreground transition-colors hover:border-primary/50 sm:w-auto"
            >
              {finalCta.secondaryCta.label}
            </Link>
          </div>
          <p className="mt-5 text-sm text-muted-foreground">{finalCta.reassurance}</p>
        </Reveal>
      </div>
    </section>
  )
}
