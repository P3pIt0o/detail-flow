/**
 * Section CTA finale — forte, sombre, orientée conversion.
 */

import { ROZAN_SECTIONS } from "./tokens"

export function RozanFinalCta() {
  return (
    <section className="bg-[var(--rozan-ink)] text-white">
      <div className="mx-auto w-full max-w-4xl px-4 py-20 text-center sm:px-6 lg:px-8 lg:py-28">
        <p className="rozan-eyebrow">Pays de Gex · Genève</p>
        <h2 className="rozan-title rozan-h2 mt-4 text-balance text-white">
          Besoin d&apos;un vrai nettoyage en profondeur ?
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-pretty text-white/70">
          Envoyez votre demande en quelques instants. Rozan vient directement jusqu&apos;à vous,
          entièrement autonome en eau et en électricité.
        </p>
        <div className="mt-8 flex justify-center">
          <a
            href={`#${ROZAN_SECTIONS.devis}`}
            className="inline-flex h-13 items-center justify-center rounded-full bg-[var(--rozan-accent)] px-9 text-sm font-semibold text-white transition-colors hover:bg-[var(--rozan-accent-strong)]"
          >
            Réserver ma prestation
          </a>
        </div>
      </div>
    </section>
  )
}
