/**
 * Section "Comment ça marche" — présente le déroulé en 4 étapes.
 * Statique et éditorial : le texte peut être adapté par le professionnel.
 */

import { CalendarCheck, Car, Sparkles, ThumbsUp } from "lucide-react"
import { SectionHeading } from "@/components/ui/section-heading"
import { Reveal } from "@/components/ui/reveal"

const steps = [
  {
    icon: CalendarCheck,
    title: "1. Réservation",
    description: "Choisissez votre prestation et un créneau qui vous convient, en ligne ou par téléphone.",
  },
  {
    icon: Car,
    title: "2. Prise en charge",
    description: "Nous venons à vous ou vous accueillons à l'atelier, à l'heure convenue.",
  },
  {
    icon: Sparkles,
    title: "3. Detailing",
    description: "Votre véhicule est traité avec soin selon un protocole professionnel rigoureux.",
  },
  {
    icon: ThumbsUp,
    title: "4. Livraison",
    description: "Vous récupérez un véhicule impeccable, protégé et éclatant de propreté.",
  },
]

export function Process() {
  return (
    <section className="border-y border-border bg-card/30">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <SectionHeading
          eyebrow="Comment ça marche"
          title="Simple et sans effort"
          description="Un processus clair en quatre étapes pour une expérience sans souci."
        />

        <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <Reveal key={step.title} delay={i * 0.1}>
              <div className="flex flex-col items-start gap-4">
                <div className="flex size-12 items-center justify-center rounded-xl border border-border bg-background text-primary">
                  <step.icon className="size-6" aria-hidden="true" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">{step.title}</h3>
                <p className="text-pretty leading-relaxed text-muted-foreground">{step.description}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
