/**
 * Section Avis — « Ils nous ont fait confiance. »
 *
 * Affiche la note Google réelle (agrégat) et des cartes d'avis. En Phase 4, la
 * note, le nombre et les avis proviendront dynamiquement de la fiche Google du
 * tenant (module `lib/reviews`) : aucun nombre codé en dur qui deviendrait
 * obsolète. Le premier témoignage est réel (site actuel Rozan).
 */

import { RozanStars, RozanGoogleProof } from "./rozan-google-proof"
import { ROZAN_SECTIONS } from "./tokens"
import { ROZAN_GOOGLE, ROZAN_REVIEWS } from "./content"

export function RozanAvis() {
  return (
    <section id={ROZAN_SECTIONS.avis} className="bg-[var(--rozan-surface)]">
      <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <span className="rozan-rule" />
            <h2 className="rozan-title rozan-h2 mt-4 text-balance text-[var(--rozan-fg)]">
              Ils nous ont fait confiance.
            </h2>
            <p className="mt-3 text-pretty text-[var(--rozan-muted)]">
              Une note parfaite sur Google et des clients ravis dans tout le Pays de Gex et à Genève.
            </p>
          </div>
          <RozanGoogleProof rating={ROZAN_GOOGLE.rating} count={ROZAN_GOOGLE.count} href={ROZAN_GOOGLE.url} />
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {ROZAN_REVIEWS.map((r, i) => (
            <figure key={i} className="flex flex-col rounded-2xl border border-[color:var(--rozan-line)] bg-[var(--rozan-bg)] p-6">
              <RozanStars rating={r.rating} />
              <blockquote className="mt-4 flex-1 text-pretty text-sm leading-relaxed text-[var(--rozan-fg)]">
                {r.text}
              </blockquote>
              <figcaption className="mt-5 flex items-center gap-3 border-t border-[color:var(--rozan-line)] pt-4">
                <span className="inline-flex size-9 items-center justify-center rounded-full bg-[var(--rozan-accent-soft)] text-sm font-semibold text-[var(--rozan-accent)]">
                  {r.name.charAt(0)}
                </span>
                <span className="flex flex-col">
                  <span className="text-sm font-semibold text-[var(--rozan-fg)]">{r.name}</span>
                  {r.context && <span className="text-xs text-[var(--rozan-muted)]">{r.context}</span>}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}
