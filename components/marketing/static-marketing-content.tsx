/**
 * Landing DetailFlow.fr — version premium, statique et légèrement animée.
 *
 * Aucune dépendance à la timeline de scroll immersive (pas de `useScroll`/
 * `useTransform`, pas de 3D). Les seules animations sont les fondus `Reveal`/
 * `Stagger` (déjà conscients de `prefers-reduced-motion`), ce qui garde un
 * bundle JS léger et un excellent LCP/CLS/INP.
 *
 * Toute la copie provient de `config/marketing.ts` (source unique). Les
 * sections Bénéfices / Partenaires / Beta / FAQ réutilisent les composants
 * partagés de `marketing-sections` — aucune duplication.
 */

import Image from "next/image"
import Link from "next/link"
import { ArrowRight, ArrowDown, Check, X } from "lucide-react"
import { marketing } from "@/config/marketing"
import { Reveal, StaggerGroup, StaggerItem } from "@/components/ui/reveal"
import { BenefitsSection, PartnersSection, BetaSection, FaqSection } from "./marketing-sections"

export function StaticMarketingContent() {
  return (
    <>
      {/* ============================ HERO ============================ */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[42rem] max-w-[90vw] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl"
        />
        <div className="relative mx-auto max-w-4xl px-4 pb-12 pt-20 text-center sm:px-6 sm:pt-28 lg:px-8">
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
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-8 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:brightness-110 sm:w-auto"
              >
                {marketing.hero.primaryCta.label}
                <ArrowRight className="size-5" aria-hidden="true" />
              </Link>
              <Link
                href={marketing.hero.secondaryCta.href}
                className="inline-flex h-12 w-full items-center justify-center rounded-full border border-border bg-card/50 px-8 text-base font-semibold text-foreground backdrop-blur transition-colors hover:border-primary/50 sm:w-auto"
              >
                {marketing.hero.secondaryCta.label}
              </Link>
            </div>
          </Reveal>
        </div>

        {/* Dashboard réel + notifications sobres (produit, pas maquette inventée) */}
        <div className="mx-auto max-w-6xl px-4 pb-8 sm:px-6 lg:px-8">
          <Reveal delay={0.2}>
            <div className="relative">
              <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-primary/10">
                <Image
                  src={marketing.hero.image.src || "/placeholder.svg"}
                  alt={marketing.hero.image.alt}
                  width={1600}
                  height={1000}
                  priority
                  sizes="(max-width: 1024px) 100vw, 1024px"
                  className="h-auto w-full"
                />
              </div>

              {/* Chips flottantes : visibles seulement ≥ lg pour éviter tout débordement mobile */}
              <ul className="pointer-events-none absolute inset-0 hidden lg:block" aria-hidden="true">
                {marketing.hero.notifications.slice(0, 3).map((n, i) => (
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

            {/* Version mobile/tablette : notifications listées sous l'image, sans chevauchement */}
            <ul className="mt-6 flex flex-wrap justify-center gap-2 lg:hidden">
              {marketing.hero.notifications.map((n) => (
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

      {/* ========================== OVERVIEW ========================== */}
      <section className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 lg:px-8">
        <Reveal>
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">{marketing.overview.title}</h2>
          <p className="mx-auto mt-4 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
            {marketing.overview.description}
          </p>
        </Reveal>
      </section>

      {/* ========================== PROBLÈME ========================== */}
      <section className="border-t border-border/60 bg-card/20">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 sm:py-24 lg:px-8">
          <Reveal>
            <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">{marketing.problem.title}</h2>
            <p className="mx-auto mt-4 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
              {marketing.problem.lead}
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <ul className="mx-auto mt-10 flex max-w-2xl flex-wrap justify-center gap-2.5">
              {marketing.problem.tools.map((tool) => (
                <li
                  key={tool}
                  className="rounded-lg border border-border bg-background px-3.5 py-2 text-sm text-muted-foreground"
                >
                  {tool}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={0.15}>
            <ArrowDown className="mx-auto mt-8 size-6 text-primary" aria-hidden="true" />
            <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg font-medium leading-relaxed text-foreground">
              {marketing.problem.conclusion}
            </p>
          </Reveal>
        </div>
      </section>

      {/* ========================= AVANT / APRÈS ======================= */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <Reveal>
          <h2 className="text-balance text-center text-3xl font-bold tracking-tight sm:text-4xl">
            {marketing.beforeAfter.title}
          </h2>
        </Reveal>
        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <Reveal>
            <div className="h-full rounded-2xl border border-border bg-card/40 p-6 sm:p-8">
              <h3 className="text-lg font-semibold text-muted-foreground">{marketing.beforeAfter.before.label}</h3>
              <ul className="mt-6 space-y-3">
                {marketing.beforeAfter.before.items.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm leading-relaxed text-muted-foreground">
                    <X className="mt-0.5 size-4 shrink-0 text-muted-foreground/70" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="h-full rounded-2xl border border-primary/30 bg-primary/5 p-6 sm:p-8">
              <h3 className="text-lg font-semibold text-primary">{marketing.beforeAfter.after.label}</h3>
              <ul className="mt-6 space-y-3">
                {marketing.beforeAfter.after.items.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm leading-relaxed text-foreground">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </section>

      {/* =========================== WORKFLOW ========================== */}
      <section id="workflow" className="scroll-mt-20 border-t border-border/60 bg-card/20">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
          <Reveal>
            <h2 className="text-balance text-center text-3xl font-bold tracking-tight sm:text-4xl">
              {marketing.workflow.title}
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-pretty text-center leading-relaxed text-muted-foreground">
              {marketing.workflow.lead}
            </p>
          </Reveal>
          <ol className="mt-14 space-y-12 lg:space-y-20">
            {marketing.workflow.steps.map((s, i) => (
              <li key={s.step}>
                <Reveal>
                  <div
                    className={`grid items-center gap-8 lg:grid-cols-2 ${i % 2 === 1 ? "lg:[&>*:first-child]:order-2" : ""}`}
                  >
                    <div>
                      <span className="text-sm font-semibold tracking-widest text-primary">{s.step}</span>
                      <h3 className="mt-2 text-2xl font-bold tracking-tight">{s.title}</h3>
                      <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">{s.description}</p>
                    </div>
                    {s.image ? (
                      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl shadow-primary/5">
                        <Image
                          src={s.image.src || "/placeholder.svg"}
                          alt={s.image.alt}
                          width={1200}
                          height={800}
                          loading="lazy"
                          sizes="(max-width: 1024px) 100vw, 512px"
                          className="h-auto w-full"
                        />
                      </div>
                    ) : (
                      <div className="hidden lg:block" aria-hidden="true" />
                    )}
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* =========================== FEATURES ========================== */}
      <section id="features" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <Reveal>
          <h2 className="text-balance text-center text-3xl font-bold tracking-tight sm:text-4xl">
            Tout ce qu'un atelier de detailing doit gérer
          </h2>
        </Reveal>
        <StaggerGroup className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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

      {/* ========================= AUTOMATISATIONS ===================== */}
      <section className="border-t border-border/60 bg-card/20">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
          <Reveal>
            <h2 className="text-balance text-center text-3xl font-bold tracking-tight sm:text-4xl">
              {marketing.automations.title}
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-pretty text-center leading-relaxed text-muted-foreground">
              {marketing.automations.lead}
            </p>
          </Reveal>
          <StaggerGroup className="mt-12 grid gap-6 sm:grid-cols-3">
            {marketing.automations.scenarios.map((s) => (
              <StaggerItem key={s.trigger}>
                <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-6">
                  <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <s.icon className="size-5" aria-hidden="true" />
                  </div>
                  <p className="mt-4 text-sm font-medium text-muted-foreground">{s.trigger}</p>
                  <ArrowDown className="my-2 size-4 text-primary" aria-hidden="true" />
                  <p className="text-pretty font-semibold leading-relaxed text-foreground">{s.action}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </section>

      {/* ===== Devis→Facture + Site connecté : deux chaînes compactes ===== */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-2">
          <ValueChain title={marketing.billing.title} lead={marketing.billing.lead} chain={marketing.billing.chain} />
          <ValueChain
            title={marketing.connectedSite.title}
            lead={marketing.connectedSite.lead}
            chain={marketing.connectedSite.chain}
          />
        </div>
      </section>

      {/* ========================= POSITIONNEMENT ====================== */}
      <section className="border-t border-border/60 bg-card/20">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 sm:py-24 lg:px-8">
          <Reveal>
            <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
              {marketing.positioning.title}
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
              {marketing.positioning.lead}
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <ul className="mx-auto mt-10 flex max-w-2xl flex-wrap justify-center gap-2.5">
              {marketing.positioning.items.map((item) => (
                <li
                  key={item}
                  className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-2 text-sm font-medium text-foreground"
                >
                  <Check className="size-4 text-primary" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* ===== Bénéfices / Partenaires / Beta / FAQ : sections partagées ===== */}
      <BenefitsSection />
      <PartnersSection />
      <BetaSection />
      <FaqSection />

      {/* =========================== CTA FINAL ========================= */}
      <section className="border-t border-border/60">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 sm:py-28 lg:px-8">
          <Reveal>
            <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">{marketing.finalCta.title}</h2>
            <p className="mx-auto mt-4 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground">
              {marketing.finalCta.subtitle}
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href={marketing.finalCta.primaryCta.href}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-8 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:brightness-110 sm:w-auto"
              >
                {marketing.finalCta.primaryCta.label}
                <ArrowRight className="size-5" aria-hidden="true" />
              </Link>
              <Link
                href={marketing.finalCta.secondaryCta.href}
                className="inline-flex h-12 w-full items-center justify-center rounded-full border border-border bg-card/50 px-8 text-base font-semibold text-foreground transition-colors hover:border-primary/50 sm:w-auto"
              >
                {marketing.finalCta.secondaryCta.label}
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  )
}

/** Petite chaîne de valeur "A → B → C" réutilisée (devis→facture, site connecté). */
function ValueChain({ title, lead, chain }: { title: string; lead: string; chain: readonly string[] }) {
  return (
    <Reveal>
      <div className="h-full rounded-2xl border border-border bg-card p-6 sm:p-8">
        <h3 className="text-xl font-bold tracking-tight">{title}</h3>
        <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">{lead}</p>
        <ol className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-2">
          {chain.map((node, i) => (
            <li key={node} className="flex items-center gap-2">
              <span className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground">
                {node}
              </span>
              {i < chain.length - 1 && <ArrowRight className="size-4 text-primary" aria-hidden="true" />}
            </li>
          ))}
        </ol>
      </div>
    </Reveal>
  )
}
