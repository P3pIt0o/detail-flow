/**
 * Bandeau de réassurance Spirit ACS.
 *
 * IMPORTANT : aucune donnée inventée. On n'affiche que des LIBELLÉS NEUTRES
 * décrivant l'activité de detailing (jamais une certification, un chiffre, un
 * label officiel ou un avis chiffré). Ces intitulés sont volontairement
 * génériques et non factuels ; ils reproduisent l'intention de la maquette
 * sans prétendre à une quelconque conformité ou distinction.
 */

import { Crosshair, FlaskConical, ShieldCheck } from "lucide-react"
import { Reveal } from "@/components/ui/reveal"

const ITEMS = [
  {
    icon: Crosshair,
    title: "Travail minutieux",
    text: "Chaque détail compte, rien n'est laissé au hasard.",
  },
  {
    icon: FlaskConical,
    title: "Produits professionnels",
    text: "Une sélection de produits pensés pour chaque surface.",
  },
  {
    icon: ShieldCheck,
    title: "Résultat soigné",
    text: "Un rendu propre et durable pour un véhicule sublimé.",
  },
] as const

export function SpiritReassurance() {
  return (
    <section className="bg-[var(--spirit-navy-2)]">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <ul className="grid gap-8 sm:grid-cols-3">
          {ITEMS.map((item, i) => (
            <li key={item.title}>
              <Reveal delay={i * 0.08}>
                <div className="flex items-start gap-4">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-[var(--spirit-teal)]/35 text-[var(--spirit-teal)]">
                    <item.icon className="size-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="spirit-title text-lg text-white">{item.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-[color:var(--spirit-muted)]">{item.text}</p>
                  </div>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
