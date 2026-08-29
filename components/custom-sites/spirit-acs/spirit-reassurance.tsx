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
        {/* Mobile : liste compacte icône-gauche / texte-droite, séparateurs
            horizontaux fins. Desktop : 3 colonnes égales, séparateurs verticaux
            discrets, centrées. Aucune carte, aucun fond derrière l'icône. */}
        <ul className="grid divide-y divide-white/10 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {ITEMS.map((item, i) => (
            <li
              key={item.title}
              className="py-5 sm:flex sm:min-h-[132px] sm:flex-col sm:items-center sm:justify-center sm:px-6 sm:py-8 sm:text-center"
            >
              <Reveal delay={i * 0.06}>
                <div className="flex items-center gap-3.5 sm:flex-col sm:gap-3">
                  <item.icon
                    className="size-6 shrink-0 text-[var(--spirit-teal)] sm:size-7"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                  <div className="sm:mt-0.5">
                    <h3 className="spirit-title text-sm text-white sm:text-base">{item.title}</h3>
                    <p className="mt-0.5 text-xs leading-snug text-[color:var(--spirit-muted)] sm:mt-1.5 sm:text-sm">
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
