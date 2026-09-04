/**
 * Section FAQ réutilisable (accueil + pages de prestations). Composant serveur.
 *
 * - Rendu accessible via <details>/<summary> natifs (aucune dépendance, clavier
 *   OK). Aucun contenu masqué à Google : le texte est présent dans le DOM.
 * - Émet un FAQPage JSON-LD dont le contenu correspond EXACTEMENT aux Q/R
 *   visibles (même tableau `entries`), conformément aux règles Google.
 * - Réutilise strictement la trame visuelle Spirit existante.
 */

import { Reveal } from "@/components/ui/reveal"
import { SPIRIT_SECTIONS } from "./tokens"
import { buildFaqJsonLd, type FaqEntry } from "@/lib/seo/structured-data"

export function SpiritFaq({
  entries,
  title = "Questions fréquentes",
  withJsonLd = true,
  background = "paper",
  headingId = "spirit-faq-title",
}: {
  entries: FaqEntry[]
  title?: string
  /** Émet le FAQPage JSON-LD (une seule fois par page). */
  withJsonLd?: boolean
  /** Fond de section, pour alterner avec les sections voisines. */
  background?: "paper" | "paper-2"
  headingId?: string
}) {
  if (entries.length === 0) return null
  const bg = background === "paper-2" ? "var(--spirit-paper-2)" : "var(--spirit-paper)"

  return (
    <section
      id={SPIRIT_SECTIONS.faq}
      data-spirit-anchor
      className="text-[color:var(--spirit-ink)]"
      style={{ background: bg }}
      aria-labelledby={headingId}
    >
      {withJsonLd && (
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(buildFaqJsonLd(entries)) }}
        />
      )}
      <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <Reveal>
          <span className="spirit-rule" />
          <h2 id={headingId} className="spirit-title spirit-h2 mt-4 text-balance leading-[1.05]">
            {title}
          </h2>
        </Reveal>

        <div className="mt-8 overflow-hidden rounded-sm ring-1 ring-black/5">
          {entries.map((entry, i) => (
            <Reveal key={entry.question} delay={i * 0.03}>
              <details className="group border-b border-black/5 bg-[var(--spirit-paper-2)] last:border-b-0">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left text-base font-medium text-[color:var(--spirit-ink)] [&::-webkit-details-marker]:hidden">
                  <span>{entry.question}</span>
                  <svg
                    className="h-5 w-5 shrink-0 text-[color:var(--spirit-pink)] transition-transform duration-200 group-open:rotate-45"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" d="M12 5v14M5 12h14" />
                  </svg>
                </summary>
                <p className="px-5 pb-4 text-sm leading-relaxed text-[color:var(--spirit-muted)]">{entry.answer}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
