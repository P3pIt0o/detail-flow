/**
 * Rendu de repli pour `prefers-reduced-motion` : sections classiques
 * empilées, sans aucune dépendance à la timeline de scroll (aucun
 * `useTransform`/`useScroll`, aucune 3D). Chaque étape reste entièrement
 * compréhensible et accessible indépendamment du scroll. `Reveal` reste
 * utilisé pour un léger fondu au scroll — animation indépendante de la
 * timeline 3D et déjà elle-même consciente de `prefers-reduced-motion`.
 *
 * Les sections bénéfices / partenaires / beta / FAQ réutilisent exactement
 * les mêmes composants que le flux DOM normal (`marketing-sections`), afin
 * d'avoir une seule source de vérité (dont le formulaire Beta 2 colonnes).
 */

import Image from "next/image"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
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

      {/* ===== Bénéfices / Partenaires / Beta / FAQ : sections partagées ===== */}
      <BenefitsSection />
      <PartnersSection />
      <BetaSection />
      <FaqSection />
    </>
  )
}
