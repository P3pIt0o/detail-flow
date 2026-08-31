/**
 * Section « UN SOIN ADAPTÉ À CHAQUE VÉHICULE » de Spirit ACS (composant SERVEUR).
 *
 * Présente les FAMILLES de prestations (vitrine éditoriale) — PAS un catalogue :
 *  - aucune prestation/tarif créé en base, aucun prix ni détail commercial ;
 *  - chaque carte renvoie vers le formulaire de devis EXISTANT (`#demande-devis`),
 *    sans présélection (le formulaire n'expose aucun paramètre de service) ;
 *  - images RÉELLES déjà présentes dans le projet (aucune génération payante,
 *    aucune capture de maquette utilisée comme image).
 *
 * Fond blanc, titre sombre avec filet rose (`spirit-rule`), 4 cartes photo avec
 * dégradé sombre en bas, titre blanc et petit trait rose. Grille : 1 colonne
 * (écran très étroit) → 2 colonnes (mobile) → 4 colonnes (bureau).
 */

import Image from "next/image"
import { Reveal } from "@/components/ui/reveal"
import { SPIRIT_SECTIONS } from "./tokens"

/**
 * Familles de services + image réelle associée (ordre imposé par la maquette).
 * Décrit l'activité de detailing sans donnée commerciale ni tarif.
 */
const CARDS = [
  {
    title: "Nettoyage intérieur & extérieur",
    image: "/services/interieur-complet.png",
    alt: "Nettoyage détaillé de l'habitacle d'un véhicule",
  },
  {
    title: "Polissage & céramique",
    image: "/services/protection-ceramique.png",
    alt: "Application d'une protection céramique sur une carrosserie",
  },
  {
    title: "Protection PPF",
    image: "/services/renovation-carrosserie.png",
    alt: "Pose d'un film de protection sur la carrosserie",
  },
  {
    title: "Moto & personnalisation",
    image: "/custom-sites/spirit-acs/service-moto.png",
    alt: "Moto sportive préparée en atelier",
  },
] as const

export function SpiritPrestations({ ctaHref }: { ctaHref: string }) {
  return (
    <section
      id={SPIRIT_SECTIONS.prestations}
      data-spirit-anchor
      className="bg-[var(--spirit-paper-2)] text-[color:var(--spirit-ink)]"
    >
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <Reveal>
          <span className="spirit-rule" />
          <h2 className="spirit-title spirit-h2 mt-4 text-balance leading-[1.05]">
            Un soin adapté à chaque véhicule
          </h2>
        </Reveal>

        <div className="mt-8 grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:mt-10 lg:grid-cols-4 lg:gap-5">
          {CARDS.map((card, i) => (
            <Reveal key={card.title} delay={i * 0.06}>
              <a
                href={ctaHref}
                className="group relative block overflow-hidden rounded-sm ring-1 ring-black/5 transition-shadow hover:shadow-[0_18px_40px_-20px_rgba(6,19,28,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--spirit-pink)]"
              >
                <div className="relative aspect-[4/5]">
                  <Image
                    src={card.image || "/placeholder.svg"}
                    alt={card.alt}
                    fill
                    sizes="(min-width: 1024px) 25vw, (min-width: 420px) 50vw, 100vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                  />
                  {/* Dégradé sombre en bas pour la lisibilité du titre blanc. */}
                  <div className="absolute inset-0 bg-gradient-to-t from-[color:var(--spirit-navy)]/85 via-[color:var(--spirit-navy)]/25 to-transparent" />
                </div>
                <div className="absolute inset-x-0 bottom-0 p-4">
                  <h3 className="spirit-title text-sm font-semibold leading-tight text-white sm:text-base">
                    {card.title}
                  </h3>
                  <span className="mt-2 block h-0.5 w-8 rounded-full bg-[var(--spirit-pink)]" />
                </div>
              </a>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
