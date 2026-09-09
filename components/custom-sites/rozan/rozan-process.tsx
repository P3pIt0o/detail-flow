/**
 * Section « Comment ça marche ? » — maximum 3 étapes, claires et rassurantes.
 */

import { ListChecks, Send, Sparkles } from "lucide-react"
import { ROZAN_SECTIONS } from "./tokens"

const STEPS = [
  { icon: ListChecks, title: "Composez votre prestation", text: "Choisissez la prestation, la formule et les options qui vous conviennent." },
  { icon: Send, title: "Réservez votre créneau", text: "Vos informations, éventuellement des photos, puis un acompte confirme la réservation." },
  { icon: Sparkles, title: "Rozan intervient chez vous", text: "Nous venons équipés et autonomes ; le solde se règle une fois le travail terminé." },
] as const

export function RozanProcess() {
  return (
    <section id={ROZAN_SECTIONS.process} className="bg-[var(--rozan-bg)]">
      <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="max-w-2xl">
          <span className="rozan-rule" />
          <h2 className="rozan-title rozan-h2 mt-4 text-balance text-[var(--rozan-fg)]">Comment ça marche ?</h2>
        </div>

        <ol className="mt-10 grid gap-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative rounded-2xl border border-[color:var(--rozan-line)] bg-[var(--rozan-surface)] p-6">
              <span className="rozan-title text-sm text-[var(--rozan-accent)]">0{i + 1}</span>
              <span className="mt-3 inline-flex size-11 items-center justify-center rounded-full bg-[var(--rozan-accent-soft)] text-[var(--rozan-accent)]">
                <s.icon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="rozan-title mt-4 text-lg text-[var(--rozan-fg)]">{s.title}</h3>
              <p className="mt-2 text-pretty text-sm leading-relaxed text-[var(--rozan-muted)]">{s.text}</p>
            </li>
          ))}
        </ol>

        <div className="mt-10">
          <a
            href={`#${ROZAN_SECTIONS.devis}`}
            className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--rozan-accent)] px-8 text-sm font-semibold text-white transition-colors hover:bg-[var(--rozan-accent-strong)]"
          >
            Réserver ma prestation
          </a>
        </div>
      </div>
    </section>
  )
}
