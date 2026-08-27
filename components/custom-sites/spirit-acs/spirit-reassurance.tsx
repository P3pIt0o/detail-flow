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
    <section className="border-y border-white/10 bg-[var(--spirit-navy-2)]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <ul className="grid divide-y divide-white/10 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {ITEMS.map((item, i) => (
            <li key={item.title} className="py-5 sm:px-6 sm:py-6 sm:first:pl-0 sm:last:pr-0">
              <Reveal delay={i * 0.06}>
                <div className="flex items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-[var(--spirit-teal)]/12 text-[var(--spirit-teal)]">
                    <item.icon className="size-4" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="spirit-title text-sm text-white sm:text-base">{item.title}</h3>
                    <p className="mt-0.5 text-xs leading-snug text-[color:var(--spirit-muted)] sm:text-sm">
                      {item.text}
                    </p>
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
