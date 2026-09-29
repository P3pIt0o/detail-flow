import Image from "next/image"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { marketingV3 } from "@/config/marketing"
import { Reveal } from "@/components/ui/reveal"

/**
 * Hero v3 — philosophie Karzly : un H1 explicite, une phrase, deux boutons,
 * puis le produit immédiatement visible. Aucune décoration superflue.
 * Server Component (seul `Reveal` est client).
 */
export function HeroV3() {
  const { hero } = marketingV3
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 left-1/2 h-80 w-[40rem] max-w-[90vw] -translate-x-1/2 rounded-full bg-primary/12 blur-3xl"
      />
      <div className="relative mx-auto max-w-3xl px-4 pb-10 pt-16 text-center sm:px-6 sm:pt-24 lg:px-8">
        <Reveal>
          <span className="inline-flex items-center rounded-full border border-primary/30 bg-card/60 px-4 py-1.5 text-xs font-medium text-primary backdrop-blur sm:text-sm">
            {hero.eyebrow}
          </span>
        </Reveal>
        <Reveal delay={0.05}>
          <h1 className="mt-6 text-balance text-3xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
            {hero.h1}
          </h1>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            {hero.subtitle}
          </p>
        </Reveal>
        <Reveal delay={0.15}>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={hero.primaryCta.href}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-8 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:brightness-110 sm:w-auto"
            >
              {hero.primaryCta.label}
              <ArrowRight className="size-5" aria-hidden="true" />
            </Link>
            <Link
              href={hero.secondaryCta.href}
              className="inline-flex h-12 w-full items-center justify-center rounded-full border border-border bg-card/50 px-8 text-base font-semibold text-foreground backdrop-blur transition-colors hover:border-primary/50 sm:w-auto"
            >
              {hero.secondaryCta.label}
            </Link>
          </div>
        </Reveal>
        <Reveal delay={0.2}>
          <p className="mt-5 text-sm text-muted-foreground">{hero.reassurance}</p>
        </Reveal>
      </div>

      {/* Le produit apparaît immédiatement, sans illustration décorative. */}
      <div className="mx-auto max-w-5xl px-4 pb-6 sm:px-6 lg:px-8">
        <Reveal delay={0.15}>
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-primary/10">
            <Image
              src={hero.image.src || "/placeholder.svg"}
              alt={hero.image.alt}
              width={1600}
              height={1000}
              priority
              sizes="(max-width: 1024px) 100vw, 1024px"
              className="h-auto w-full"
            />
          </div>
        </Reveal>
      </div>
    </section>
  )
}
