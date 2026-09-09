/**
 * Section « Avis » — rassurante et premium. Note globale + cartes d'avis.
 *
 * En Phase 2, les avis viennent de `ROZAN_REVIEWS` et la note de `ROZAN_GOOGLE`.
 * En Phase 4, ils seront résolus dynamiquement (vrais avis Google du tenant),
 * via le même contrat — sans changer la présentation.
 */

import { Star } from "lucide-react"
import { ROZAN_GOOGLE, ROZAN_REVIEWS } from "./content"
import { ROZAN_SECTIONS } from "./tokens"

function Stars({ n, className = "" }: { n: number; className?: string }) {
  return (
    <span className={`flex items-center gap-0.5 ${className}`} aria-label={`${n} sur 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`size-4 ${i < n ? "fill-[var(--rozan-gold)] text-[var(--rozan-gold)]" : "text-[color:var(--rozan-line)]"}`}
          aria-hidden="true"
        />
      ))}
    </span>
  )
}

export function RozanReviews() {
  return (
    <section id={ROZAN_SECTIONS.avis} className="bg-[var(--rozan-surface-2)] py-20 sm:py-24 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <span className="rozan-rule" aria-hidden="true" />
            <h2 className="rozan-title rozan-h2 mt-4 text-balance text-[var(--rozan-fg)]">
              Ils nous ont fait confiance.
            </h2>
          </div>
          <a
            href={ROZAN_GOOGLE.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 rounded-full border border-[color:var(--rozan-line)] bg-[var(--rozan-surface)] px-5 py-3"
          >
            <span className="rozan-title text-2xl text-[var(--rozan-fg)]">{ROZAN_GOOGLE.rating.toFixed(1)}</span>
            <span className="flex flex-col">
              <Stars n={5} />
              <span className="text-xs text-[var(--rozan-muted)]">{ROZAN_GOOGLE.count} avis Google</span>
            </span>
          </a>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {ROZAN_REVIEWS.map((r, i) => (
            <figure
              key={i}
              className="flex flex-col rounded-2xl border border-[color:var(--rozan-line)] bg-[var(--rozan-surface)] p-6"
            >
              <Stars n={r.rating} />
              <blockquote className="mt-4 flex-1 text-pretty text-sm leading-relaxed text-[var(--rozan-fg)]">
                “{r.text}”
              </blockquote>
              <figcaption className="mt-5 border-t border-[color:var(--rozan-line)] pt-4">
                <span className="block text-sm font-semibold text-[var(--rozan-fg)]">{r.name}</span>
                {(r.context || r.city) && (
                  <span className="mt-0.5 block text-xs text-[var(--rozan-muted)]">
                    {[r.context, r.city].filter(Boolean).join(" · ")}
                  </span>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}
