/**
 * Section "Comment ça marche" — présente le déroulé en 4 étapes.
 * Textes personnalisables par tenant (companies.siteContent.process), avec
 * repli sur les textes par défaut. Icônes, animations et layout fixes.
 */

import { CalendarCheck, Car, Sparkles, ThumbsUp } from "lucide-react"
import { SectionHeading } from "@/components/ui/section-heading"
import { Reveal } from "@/components/ui/reveal"
import { getPublicSiteContent } from "@/lib/site-content"

const STEP_ICONS = [CalendarCheck, Car, Sparkles, ThumbsUp]

export async function Process() {
  const content = await getPublicSiteContent()
  const process = content.process
  if (process.enabled === false) return null

  const steps = process.steps.map((step, i) => ({ ...step, icon: STEP_ICONS[i] }))

  return (
    <section className="border-y border-border bg-card/30">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <SectionHeading eyebrow={process.eyebrow} title={process.title} description={process.description} />

        <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <Reveal key={i} delay={i * 0.1}>
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
