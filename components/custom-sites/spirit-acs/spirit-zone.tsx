/**
 * Section « Zone d'intervention » (SEO local raisonnable). Composant serveur.
 *
 * Direction visuelle alignée sur la MAQUETTE VALIDÉE : fond bleu nuit (navy) en
 * CONTINUITÉ directe avec la section « processus » qui la précède (aucune
 * rupture blanche). Le contenu est présenté dans une carte sombre centrée —
 * pictogramme cyan, eyebrow cyan, gros titre blanc (la ville réelle) puis texte
 * gris bleuté.
 *
 * `city`   : ville RÉELLE du tenant (jamais inventée) → sert de titre.
 * `cities` : communes RÉELLEMENT confirmées. Si vide, aucune liste n'est
 *            affichée (aucune commune inventée) : seul le texte de base est rendu.
 */

import { MapPin } from "lucide-react"
import { Reveal } from "@/components/ui/reveal"
import { SPIRIT_SECTIONS } from "./tokens"
import { SPIRIT_ZONE_TEXT } from "./seo-content"

export function SpiritZone({ cities, city }: { cities: string[]; city?: string | null }) {
  // Titre = ville réelle du tenant + « et alentours » (aucune géographie
  // inventée). Repli neutre si la ville n'est pas renseignée.
  const heading = city?.trim() ? `${city.trim()} et alentours` : "Notre zone d'intervention"

  return (
    <section id={SPIRIT_SECTIONS.zone} data-spirit-anchor className="bg-[var(--spirit-navy)] text-white">
      <div className="mx-auto max-w-4xl px-4 pb-16 pt-2 sm:px-6 lg:px-8 lg:pb-24">
        <Reveal>
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[var(--spirit-navy-2)] px-6 py-10 text-center shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)] sm:px-10 sm:py-12">
            <span
              className="inline-flex size-11 items-center justify-center rounded-full bg-[color:var(--spirit-teal)]/15 text-[var(--spirit-teal)]"
              aria-hidden="true"
            >
              <MapPin className="size-6" />
            </span>
            <p className="spirit-eyebrow mt-4">Zone d&apos;intervention</p>
            <h2 className="spirit-title spirit-h2 mt-2 text-balance leading-[1.05] text-white">{heading}</h2>
            <p className="mx-auto mt-4 max-w-xl text-pretty text-base leading-relaxed text-[color:var(--spirit-muted)]">
              {SPIRIT_ZONE_TEXT}
            </p>

            {cities.length > 0 && (
              <ul className="mt-6 flex flex-wrap justify-center gap-2" aria-label="Communes desservies">
                {cities.map((c) => (
                  <li
                    key={c}
                    className="rounded-full bg-white/5 px-3 py-1 text-sm text-[color:var(--spirit-muted)] ring-1 ring-white/10"
                  >
                    {c}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  )
}
