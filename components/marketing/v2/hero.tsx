import Image from "next/image"
import Link from "next/link"
import { ArrowRight, Check } from "lucide-react"
import { marketingV2 } from "@/config/marketing"
import { Reveal } from "@/components/ui/reveal"

/**
 * Hero v2 — orienté self-service (« Créer mon espace »).
 * Server Component : seules les animations `Reveal` sont clientes.
 */
export function HeroV2() {
  const hero = marketingV2.hero
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[42rem] max-w-[90vw] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl"
      />
      <div className="relative mx-auto max-w-4xl px-4 pb-12 pt-20 text-center sm:px-6 sm:pt-28 lg:px-8">
        <Reveal>
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-card/60 px-4 py-1.5 text-sm text-primary backdrop-blur">
            {hero.badge}
          </span>
        </Reveal>
        <Reveal delay={0.05}>
          <h1 className="mt-6 text-balance text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
            {hero.title}
          </h1>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground">
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
        <Reveal delay={0.18}>
          <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            {hero.highlights.map((h) => (
              <li key={h} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <Check className="size-4 text-primary" aria-hidden="true" />
                {h}
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={0.22}>
          <p className="mt-5 text-sm text-muted-foreground">{hero.reassurance}</p>
        </Reveal>
      </div>

      {/* Dashboard réel + notifications sobres (produit, pas maquette inventée) */}
      <div className="mx-auto max-w-6xl px-4 pb-8 sm:px-6 lg:px-8">
        <Reveal delay={0.2}>
          <div className="relative">
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

            <ul className="pointer-events-none absolute inset-0 hidden lg:block" aria-hidden="true">
              {hero.notifications.slice(0, 3).map((n, i) => (
                <li
                  key={n}
                  className="absolute flex items-center gap-2 rounded-xl border border-border bg-card/95 px-3 py-2 text-sm font-medium shadow-lg backdrop-blur"
                  style={
                    [
                      { top: "12%", left: "-3rem" },
                      { top: "44%", right: "-3rem" },
                      { bottom: "12%", left: "-2rem" },
                    ][i]
                  }
                >
                  <Check className="size-4 text-primary" />
                  {n}
                </li>
              ))}
            </ul>
          </div>

          <ul className="mt-6 flex flex-wrap justify-center gap-2 lg:hidden">
            {hero.notifications.map((n) => (
              <li
                key={n}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground"
              >
                <Check className="size-3.5 text-primary" aria-hidden="true" />
                {n}
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  )
}
