import Image from "next/image"
import Link from "next/link"
import { ArrowRight, Check } from "lucide-react"
import { marketing } from "@/config/marketing"
import { Reveal, StaggerGroup, StaggerItem } from "@/components/ui/reveal"
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion"
import { BetaForm } from "@/components/marketing/beta-form"

export default function MarketingPage() {
  return (
    <>
      {/* ============================ HERO ============================ */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl"
        />
        <div className="relative mx-auto max-w-4xl px-4 pb-16 pt-24 text-center sm:px-6 sm:pt-32 lg:px-8">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-card/60 px-4 py-1.5 text-sm text-primary backdrop-blur">
              {marketing.hero.badge}
            </span>
          </Reveal>
          <Reveal delay={0.05}>
            <h1 className="mt-6 text-balance text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
              {marketing.hero.title}
            </h1>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground">
              {marketing.hero.subtitle}
            </p>
          </Reveal>
          <Reveal delay={0.15}>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href={marketing.hero.primaryCta.href}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-8 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:brightness-110"
              >
                {marketing.hero.primaryCta.label}
                <ArrowRight className="size-5" aria-hidden="true" />
              </Link>
              <Link
                href={marketing.hero.secondaryCta.href}
                className="inline-flex h-12 items-center justify-center rounded-full border border-border bg-card/50 px-8 text-base font-semibold text-foreground backdrop-blur transition-colors hover:border-primary/50"
              >
                {marketing.hero.secondaryCta.label}
              </Link>
            </div>
          </Reveal>
        </div>

        {/* Aperçu de l'interface */}
        <div className="mx-auto max-w-6xl px-4 pb-8 sm:px-6 lg:px-8">
          <Reveal delay={0.2}>
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-primary/10">
              <Image
                src="/marketing/dashboard-preview.png"
                alt="Aperçu du tableau de bord DetailFlow"
                width={1600}
                height={1000}
                priority
                className="h-auto w-full"
              />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ========================== OVERVIEW ========================== */}
      <section className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 lg:px-8">
        <Reveal>
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">{marketing.overview.title}</h2>
          <p className="mx-auto mt-4 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
            {marketing.overview.description}
          </p>
        </Reveal>
      </section>

      {/* ========================== FEATURES ========================== */}
      <section id="features" className="mx-auto max-w-7xl scroll-mt-20 px-4 pb-20 sm:px-6 lg:px-8">
        <StaggerGroup className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {marketing.features.map((f) => (
            <StaggerItem key={f.title}>
              <div className="h-full rounded-2xl border border-border bg-card p-6 transition-colors hover:border-primary/40">
                <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <f.icon className="size-5" aria-hidden="true" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">{f.description}</p>
              </div>
            </StaggerItem>
          ))}
        </StaggerGroup>
      </section>

      {/* ========================== BENEFITS ========================== */}
      <section className="border-y border-border/60 bg-card/30 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <h2 className="text-balance text-center text-3xl font-bold tracking-tight sm:text-4xl">
              {marketing.benefits.title}
            </h2>
          </Reveal>
          <StaggerGroup className="mt-12 grid gap-8 sm:grid-cols-2">
            {marketing.benefits.items.map((b) => (
              <StaggerItem key={b.title}>
                <div className="flex gap-4">
                  <div className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <Check className="size-4" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">{b.title}</h3>
                    <p className="mt-1 text-pretty text-sm leading-relaxed text-muted-foreground">{b.description}</p>
                  </div>
                </div>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </section>

      {/* ======================= BETA PROGRAM ======================= */}
      <section id="beta" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-20 sm:px-6 lg:px-8">
        <div className="grid items-start gap-10 lg:grid-cols-2">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
              {marketing.beta.badge}
            </span>
            <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight sm:text-4xl">{marketing.beta.title}</h2>
            <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">{marketing.beta.lead}</p>
            <ul className="mt-8 space-y-4">
              {marketing.beta.points.map((p) => (
                <li key={p} className="flex items-start gap-3">
                  <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <Check className="size-4" aria-hidden="true" />
                  </div>
                  <span className="text-pretty leading-relaxed text-foreground">{p}</span>
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={0.1}>
            <BetaForm />
          </Reveal>
        </div>
      </section>

      {/* ============================ FAQ ============================ */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 pb-24 sm:px-6 lg:px-8">
        <Reveal>
          <h2 className="text-balance text-center text-3xl font-bold tracking-tight sm:text-4xl">Questions fréquentes</h2>
        </Reveal>
        <Reveal delay={0.1}>
          <Accordion className="mt-10 divide-y divide-border rounded-2xl border border-border bg-card px-2">
            {marketing.faq.map((item, i) => (
              <AccordionItem key={item.q} value={`faq-${i}`} className="px-4">
                <AccordionTrigger className="text-left text-base font-medium">{item.q}</AccordionTrigger>
                <AccordionContent className="text-pretty leading-relaxed text-muted-foreground">{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </section>
    </>
  )
}
