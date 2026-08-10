/**
 * Section "Pourquoi nous choisir" de la homepage. Contenu personnalisable
 * depuis Paramètres > Site public (titre, sous-titre, avantages, masquage) ;
 * repli neutre si le tenant n'a rien configuré. Voir lib/site-content.ts.
 */

import { CheckCircle2 } from "lucide-react"
import { SectionHeading } from "@/components/ui/section-heading"
import { Reveal } from "@/components/ui/reveal"
import { getPublicSiteContent } from "@/lib/site-content"

export async function WhyUsSection() {
  const content = await getPublicSiteContent()
  const { enabled, title, subtitle, points } = content.whyUs
  if (!enabled) return null

  return (
    <section className="border-y border-border bg-card/30">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <SectionHeading eyebrow="Pourquoi nous choisir" title={title} subtitle={subtitle} />

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {points.map((point, i) => (
            <Reveal key={point} delay={i * 0.1}>
              <div className="flex items-start gap-3 rounded-2xl border border-border bg-background p-5">
                <CheckCircle2 className="mt-0.5 size-5 flex-none text-primary" aria-hidden="true" />
                <p className="text-pretty leading-relaxed text-foreground">{point}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
