/**
 * Sections DOM « normales » de la landing DetailFlow, rendues APRÈS la scène
 * immersive `ScrollStage` (hors du conteneur sticky). Aucun élément 3D ne
 * peut passer au-dessus ou derrière : le formulaire Beta et la FAQ disposent
 * de tout l'espace, sans collision ni position absolue liée au ScrollStage.
 *
 * Réutilise les composants existants (`Reveal`, `BetaForm`, `BetaPartners`,
 * `Accordion`) — aucune duplication.
 */

import Link from "next/link"
import { Check, Sparkles, ArrowRight } from "lucide-react"
import { marketing } from "@/config/marketing"
import { Reveal, StaggerGroup, StaggerItem } from "@/components/ui/reveal"
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion"
import { BetaForm } from "@/components/marketing/beta-form"
import { BetaPartners } from "@/components/marketing/beta-partners"

/** Transition douce depuis la sortie de la scène immersive. */
export function BenefitsSection() {
  return (
    <section className="relative border-t border-border/60 bg-background">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
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
  )
}

export function PartnersSection() {
  return (
    <section className="border-t border-border/60 bg-card/20">
      <div className="mx-auto max-w-5xl px-4 py-20 sm:px-6 lg:px-8">
        <Reveal>
          <BetaPartners />
        </Reveal>
      </div>
    </section>
  )
}

export function BetaSection() {
  const { beta } = marketing
  return (
    <section id="beta" className="scroll-mt-20 border-t border-border/60 bg-background">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        {/* En-tête : titre + explication */}
        <Reveal>
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
              {beta.badge}
            </span>
            <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight sm:text-4xl">{beta.title}</h2>
            <p className="mx-auto mt-4 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground">
              {beta.lead}
            </p>
          </div>
        </Reveal>

        {/* Trois avantages */}
        <StaggerGroup className="mt-12 grid gap-6 sm:grid-cols-3">
          {beta.perks.map((p) => (
            <StaggerItem key={p.title}>
              <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-6">
                <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Check className="size-5" aria-hidden="true" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">{p.title}</h3>
                <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">{p.description}</p>
              </div>
            </StaggerItem>
          ))}
        </StaggerGroup>

        {/* Mise en avant premium : bêta-testeur historique (sobre, sans effet VIP) */}
        <Reveal delay={0.1}>
          <div className="mt-6 overflow-hidden rounded-2xl border border-primary/25 bg-primary/[0.06] p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Sparkles className="size-5" aria-hidden="true" />
              </div>
              <div>
                <span className="text-xs font-semibold uppercase tracking-widest text-primary">
                  {beta.historic.label}
                </span>
                <h3 className="mt-1.5 text-xl font-bold tracking-tight">{beta.historic.title}</h3>
                <p className="mt-2 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
                  {beta.historic.description}
                </p>
              </div>
            </div>
          </div>
        </Reveal>

        {/* CTA de section vers le formulaire */}
        <Reveal delay={0.15}>
          <div className="mt-8 text-center">
            <Link
              href={beta.sectionCta.href}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-8 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:brightness-110"
            >
              {beta.sectionCta.label}
              <ArrowRight className="size-5" aria-hidden="true" />
            </Link>
          </div>
        </Reveal>

        {/* Intro + formulaire de candidature */}
        <div id="beta-form" className="mx-auto mt-16 max-w-2xl scroll-mt-20">
          <Reveal>
            <div className="text-center">
              <h3 className="text-balance text-2xl font-bold tracking-tight">{beta.formIntro.title}</h3>
              <p className="mx-auto mt-3 max-w-xl text-pretty leading-relaxed text-muted-foreground">
                {beta.formIntro.description}
              </p>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-xl shadow-primary/5 sm:p-8">
              <BetaForm />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

export function FaqSection() {
  return (
    <section id="faq" className="scroll-mt-20 border-t border-border/60 bg-card/20">
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <Reveal>
          <h2 className="text-balance text-center text-3xl font-bold tracking-tight sm:text-4xl">
            Questions fréquentes
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <Accordion className="mt-10 divide-y divide-border rounded-2xl border border-border bg-card px-2">
            {marketing.faq.map((item, i) => (
              <AccordionItem key={item.q} value={`faq-${i}`} className="px-4">
                <AccordionTrigger className="text-left text-base font-medium">{item.q}</AccordionTrigger>
                <AccordionContent className="text-pretty leading-relaxed text-muted-foreground">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  )
}
