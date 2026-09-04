/**
 * Section « Comment se déroule une prestation ? » (déroulement en 4 étapes).
 * Contenu éditorial local isolé (SPIRIT_PROCESS_STEPS). Réutilise strictement la
 * trame visuelle Spirit existante (max-w-7xl, spirit-rule, spirit-h2).
 * Purement présentationnel, composant serveur.
 */

import { Reveal } from "@/components/ui/reveal"
import { SPIRIT_SECTIONS } from "./tokens"
import { SPIRIT_PROCESS_STEPS } from "./seo-content"

export function SpiritProcess() {
  return (
    <section
      id={SPIRIT_SECTIONS.etapes}
      data-spirit-anchor
      className="bg-[var(--spirit-paper)] text-[color:var(--spirit-ink)]"
    >
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <Reveal>
          <span className="spirit-rule" />
          <h2 className="spirit-title spirit-h2 mt-4 text-balance leading-[1.05]">
            Comment se déroule une prestation ?
          </h2>
        </Reveal>

        <ol className="mt-8 grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:mt-10 lg:grid-cols-4 lg:gap-5">
          {SPIRIT_PROCESS_STEPS.map((step, i) => (
            <Reveal key={step.title} delay={i * 0.06}>
              <li className="flex h-full flex-col gap-3 rounded-sm bg-[var(--spirit-paper-2)] p-6 ring-1 ring-black/5">
                <span
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--spirit-pink)]/15 text-sm font-semibold text-[color:var(--spirit-pink)]"
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <h3 className="spirit-title text-base font-semibold text-[color:var(--spirit-ink)]">{step.title}</h3>
                <p className="text-sm leading-relaxed text-[color:var(--spirit-muted)]">{step.description}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  )
}
