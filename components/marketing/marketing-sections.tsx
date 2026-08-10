/**
 * Sections DOM « normales » de la landing DetailFlow, rendues APRÈS la scène
 * immersive `ScrollStage` (hors du conteneur sticky). Aucun élément 3D ne
 * peut passer au-dessus ou derrière : le formulaire Beta et la FAQ disposent
 * de tout l'espace, sans collision ni position absolue liée au ScrollStage.
 *
 * Réutilise les composants existants (`Reveal`, `BetaForm`, `BetaPartners`,
 * `Accordion`) — aucune duplication.
 */

import { Check } from "lucide-react"
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
  return (
    <section id="beta" className="scroll-mt-20 border-t border-border/60 bg-background">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-16">
          {/* Colonne gauche : titre + explication + avantages Beta */}
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

          {/* Colonne droite : formulaire complet, pleine largeur de colonne */}
          <Reveal delay={0.1}>
            <div className="rounded-2xl border border-border bg-card p-6 shadow-xl shadow-primary/5 sm:p-8">
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
