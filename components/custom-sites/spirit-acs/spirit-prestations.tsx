/**
 * Section « Un soin adapté à chaque véhicule » de Spirit ACS (composant SERVEUR).
 *
 * Présente les FAMILLES de prestations (vitrine éditoriale) — PAS un catalogue
 * en base. Chaque carte :
 *  - affiche un texte court utile sous le titre (contenu éditorial local) ;
 *  - renvoie vers la PAGE DÉDIÉE de la prestation (SEO), en conservant le tenant.
 *
 * Les 4 cartes reprennent, dans l'ordre, les 4 premières prestations de
 * SPIRIT_SERVICES. Images RÉELLES déjà présentes dans le projet.
 *
 * Fond, titre + filet rose (`spirit-rule`), 4 cartes photo avec dégradé sombre.
 * Grille : 1 → 2 (mobile) → 4 (bureau).
 */

import Image from "next/image"
import { Reveal } from "@/components/ui/reveal"
import { SPIRIT_SECTIONS } from "./tokens"
import { SPIRIT_SERVICES } from "./seo-content"

// Les 4 familles mises en avant sur l'accueil (ordre imposé par la maquette) :
// nettoyage, polissage/céramique, PPF, moto. Les 6 prestations restent toutes
// accessibles via leurs pages dédiées et le maillage interne.
const HOME_CARD_SLUGS = ["nettoyage-automobile", "polissage-automobile", "protection-ppf", "detailing-moto"] as const
const CARDS = HOME_CARD_SLUGS.map((slug) => SPIRIT_SERVICES.find((s) => s.slug === slug)!).filter(Boolean)

export function SpiritPrestations({ serviceHref }: { serviceHref: (slug: string) => string }) {
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
            Nos prestations de detailing
          </h2>
        </Reveal>

        <div className="mt-8 grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:mt-10 lg:grid-cols-4 lg:gap-5">
          {CARDS.map((card, i) => (
            <Reveal key={card.slug} delay={i * 0.06}>
              <a
                href={serviceHref(card.slug)}
                className="group flex h-full flex-col overflow-hidden rounded-sm bg-[var(--spirit-paper)] ring-1 ring-black/5 transition-shadow hover:shadow-[0_18px_40px_-20px_rgba(6,19,28,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--spirit-pink)]"
              >
                <div className="relative aspect-[4/3]">
                  <Image
                    src={card.image || "/placeholder.svg"}
                    alt={card.imageAlt || card.cardTitle}
                    fill
                    sizes="(min-width: 1024px) 25vw, (min-width: 420px) 50vw, 100vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[color:var(--spirit-navy)]/70 via-transparent to-transparent" />
                </div>
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <h3 className="spirit-title text-sm font-semibold leading-tight text-[color:var(--spirit-ink)] sm:text-base">
                    {card.cardTitle}
                  </h3>
                  <span className="block h-0.5 w-8 rounded-full bg-[var(--spirit-pink)]" />
                  <p className="text-sm leading-relaxed text-[color:var(--spirit-muted)]">{card.cardText}</p>
                  <span className="mt-auto pt-2 text-sm font-medium text-[color:var(--spirit-teal)]">
                    En savoir plus
                    <span aria-hidden="true"> →</span>
                  </span>
                </div>
              </a>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
