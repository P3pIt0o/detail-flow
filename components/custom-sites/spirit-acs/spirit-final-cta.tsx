/**
 * CTA final de Spirit ACS (maquette : bandeau sombre « Prêt à redonner de
 * l'éclat à votre véhicule ? »).
 *
 * - CTA principal : ancre vers la section « Demander un devis » (formulaire
 *   réel embarqué) si la fonctionnalité est active — jamais vers /reservation.
 * - Ligne d'infos : ville réelle si disponible (jamais l'adresse exacte).
 *
 * Sert aussi d'ancre `contact`.
 */

import { MapPin } from "lucide-react"
import { Reveal } from "@/components/ui/reveal"
import { SpiritSplash } from "./spirit-splash"
import { SPIRIT_ANCHOR_PRIMARY, SPIRIT_SECTIONS } from "./tokens"

type SpiritFinalCtaProps = {
  title: string
  city: string | null
  quoteEnabled: boolean
}

export function SpiritFinalCta({ title, city, quoteEnabled }: SpiritFinalCtaProps) {
  return (
    <section
      id={SPIRIT_SECTIONS.contact}
      data-spirit-anchor
      className="relative overflow-hidden border-t border-white/10 bg-[var(--spirit-navy-3)]"
    >
      {/* Décor « projection de lavage » de part et d'autre (purement décoratif). */}
      <SpiritSplash className="pointer-events-none absolute -left-6 bottom-0 hidden h-44 w-52 sm:block" />
      <SpiritSplash flip className="pointer-events-none absolute -right-6 bottom-0 hidden h-44 w-52 sm:block" />

      <div className="relative mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 lg:px-8 lg:py-20">
        <Reveal>
          <h2 className="spirit-title text-balance text-3xl text-white sm:text-4xl">{title}</h2>
        </Reveal>
        {quoteEnabled && (
          <Reveal delay={0.1}>
            <div className="mt-9 flex justify-center">
              <a href={`#${SPIRIT_SECTIONS.demandeDevis}`} className={SPIRIT_ANCHOR_PRIMARY}>
                Demander un devis
              </a>
            </div>
          </Reveal>
        )}
        {city && (
          <Reveal delay={0.16}>
            <p className="mt-8 flex items-center justify-center gap-2 text-sm text-[color:var(--spirit-muted)]">
              <MapPin className="size-4 text-[var(--spirit-teal)]" aria-hidden="true" />
              {city}
            </p>
          </Reveal>
        )}
      </div>
    </section>
  )
}
