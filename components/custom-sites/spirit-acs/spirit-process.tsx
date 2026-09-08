/**
 * Section « Comment ça se passe » — déroulement en 4 étapes.
 *
 * Direction visuelle alignée sur la MAQUETTE VALIDÉE : fond bleu nuit (navy),
 * eyebrow cyan, gros titre condensé blanc, puis une liste VERTICALE compacte où
 * chaque étape est marquée par un numéro dans un cercle cyan, un titre blanc et
 * une description gris bleuté. Aucune grande carte blanche : la section est
 * dans la même continuité sombre que le reste du site (hero, prestations,
 * réalisations, zone d'intervention).
 *
 * Ce bloc EXPLIQUE le processus au client ; il ne reproduit pas les écrans
 * techniques du configurateur. Contenu éditorial local (SPIRIT_PROCESS_STEPS).
 * Purement présentationnel, composant serveur.
 */

import { Reveal } from "@/components/ui/reveal"
import { SPIRIT_SECTIONS } from "./tokens"
import { SPIRIT_PROCESS_STEPS } from "./seo-content"

export function SpiritProcess() {
  return (
    <section id={SPIRIT_SECTIONS.etapes} data-spirit-anchor className="bg-[var(--spirit-navy)] text-white">
      <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <Reveal>
          <p className="spirit-eyebrow">Comment ça se passe</p>
          <h2 className="spirit-title spirit-h2 mt-3 text-balance leading-[1.05] text-white">
            Votre prestation en 4 étapes
          </h2>
        </Reveal>

        {/* Liste verticale compacte (mobile-first). Le trait vertical relie les
            cercles cyan pour matérialiser la progression, sans grande carte. */}
        <ol className="mt-8 flex flex-col gap-7 lg:mt-10 lg:gap-8">
          {SPIRIT_PROCESS_STEPS.map((step, i) => (
            <Reveal key={step.title} delay={i * 0.06}>
              <li className="flex items-start gap-4">
                <span
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--spirit-teal)] text-sm font-bold text-[var(--spirit-navy)]"
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <div className="min-w-0 pt-1">
                  <h3 className="spirit-title text-lg font-bold leading-tight text-white">{step.title}</h3>
                  <p className="mt-1.5 text-pretty text-sm leading-relaxed text-[color:var(--spirit-muted)]">
                    {step.description}
                  </p>
                </div>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  )
}
