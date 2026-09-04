/**
 * Section « Zone d'intervention » (SEO local raisonnable). Composant serveur.
 * `cities` : villes RÉELLEMENT confirmées. Si vide, AUCUNE liste n'est affichée
 * (aucune ville inventée) : seul le texte de base est rendu.
 */

import { Reveal } from "@/components/ui/reveal"
import { SPIRIT_SECTIONS } from "./tokens"
import { SPIRIT_ZONE_TEXT } from "./seo-content"

export function SpiritZone({ cities }: { cities: string[] }) {
  return (
    <section
      id={SPIRIT_SECTIONS.zone}
      data-spirit-anchor
      className="bg-[var(--spirit-paper-2)] text-[color:var(--spirit-ink)]"
    >
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <Reveal>
          <span className="spirit-rule" />
          <h2 className="spirit-title spirit-h2 mt-4 text-balance leading-[1.05]">Zone d&apos;intervention</h2>
          <p className="mt-4 max-w-2xl text-pretty text-base leading-relaxed text-[color:var(--spirit-muted)]">
            {SPIRIT_ZONE_TEXT}
          </p>
        </Reveal>

        {cities.length > 0 && (
          <Reveal delay={0.08}>
            <ul className="mt-6 flex flex-wrap gap-2" aria-label="Communes desservies">
              {cities.map((city) => (
                <li
                  key={city}
                  className="rounded-full bg-[var(--spirit-paper)] px-3 py-1 text-sm text-[color:var(--spirit-muted)] ring-1 ring-black/5"
                >
                  {city}
                </li>
              ))}
            </ul>
          </Reveal>
        )}
      </div>
    </section>
  )
}
