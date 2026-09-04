/**
 * Section « Nos prestations de detailing » de Spirit ACS (composant SERVEUR).
 *
 * Vitrine éditoriale (PAS un catalogue en base) : une grille de SIX cartes
 * photographiques, une par prestation, chacune renvoyant vers sa PAGE DÉDIÉE
 * (SEO) en conservant le tenant via `serviceHref`.
 *
 * - Images RÉELLES déjà présentes dans le projet (aucune génération).
 * - Toute la carte est un vrai lien <a> (exploitable sans JS, focus clavier).
 * - Titres de cartes en <h3> (hiérarchie : H1 hero, H2 section, H3 cartes).
 * - Un court paragraphe SEO visible est rendu sous le titre de section.
 *
 * Grille responsive : 1 → 2 (≥420px) → 3 (bureau), sans carrousel.
 */

import Image from "next/image"
import { Reveal } from "@/components/ui/reveal"
import { SPIRIT_SECTIONS } from "./tokens"
import { getSpiritService } from "./seo-content"

/**
 * Les SIX cartes de l'accueil, dans l'ordre imposé. Libellés et descriptions
 * COURTS (contenu éditorial local de la vitrine, jamais des données Neon), et
 * image RÉELLE réutilisée depuis la configuration de chaque prestation. Le lien
 * pointe vers la page dédiée existante (via `serviceHref`, tenant conservé).
 */
const HOME_CARDS: { slug: string; title: string; description: string; image: string; imageAlt: string }[] = [
  {
    slug: "nettoyage-automobile",
    title: "Nettoyage automobile",
    description: "Nettoyage intérieur et extérieur",
    // Aucune image dédiée « nettoyage » n'existe : on réutilise une image RÉELLE
    // cohérente déjà disponible (lavage premium).
    image: "/services/lavage-premium.png",
    imageAlt: "Véhicule après un nettoyage automobile intérieur et extérieur",
  },
  {
    slug: "polissage-automobile",
    title: "Polissage automobile",
    description: "Correction des défauts et restauration de la brillance",
    image: "/services/protection-ceramique.png",
    imageAlt: "Carrosserie brillante après un polissage automobile",
  },
  {
    slug: "protection-ceramique",
    title: "Protection céramique",
    description: "Protection durable et entretien facilité",
    image: "/services/protection-ceramique.png",
    imageAlt: "Application d'une protection céramique sur la carrosserie",
  },
  {
    slug: "protection-ppf",
    title: "Protection PPF",
    description: "Film transparent contre les impacts et les rayures",
    image: "/services/renovation-carrosserie.png",
    imageAlt: "Zone de carrosserie protégée par un film PPF transparent",
  },
  {
    slug: "renovation-phares",
    title: "Rénovation des phares",
    description: "Restauration de la clarté des optiques",
    image: "/services/renovation-carrosserie.png",
    imageAlt: "Optique de phare rénovée sur un véhicule",
  },
  {
    slug: "detailing-moto",
    title: "Detailing moto",
    description: "Entretien esthétique et personnalisation",
    image: "/custom-sites/spirit-acs/service-moto.png",
    imageAlt: "Moto après une prestation esthétique de detailing",
  },
]

// Sécurité : chaque carte doit correspondre à une prestation existante (le lien
// mènerait sinon vers une page inexistante). On filtre sur les slugs connus.
const CARDS = HOME_CARDS.filter((c) => getSpiritService(c.slug))

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
          <h2 className="spirit-title spirit-h2 mt-4 text-balance leading-[1.05]">Nos prestations de detailing</h2>
          {/* Paragraphe SEO visible, présent dans le HTML initial (non masqué).
              Justifié (spirit-prose) et contraste renforcé (ink/75 au lieu du
              gris clair) pour rester bien lisible sur fond blanc. */}
          <p className="spirit-prose mt-4 max-w-3xl text-base text-[color:var(--spirit-ink)]/75">
            Spirit ACS propose à Lagny-sur-Marne des prestations de nettoyage automobile, polissage, protection
            céramique, PPF, rénovation des phares et detailing moto. Découvrez chaque service et trouvez la solution
            adaptée à votre véhicule.
          </p>
        </Reveal>

        <div className="mt-8 grid grid-cols-1 items-stretch gap-4 min-[420px]:grid-cols-2 lg:mt-12 lg:grid-cols-3 lg:gap-6">
          {CARDS.map((card, i) => (
            <Reveal key={card.slug} delay={i * 0.06} className="h-full">
              {/*
                HAUTEUR MINIMALE (min-h) plutôt qu'un ratio fixe : la carte peut
                GRANDIR quand le titre passe sur 2–3 lignes → plus aucun rognage
                du titre par le haut (ex. « Polissage automobile »). `h-full`
                + items-stretch harmonisent la hauteur des cartes d'une ligne.
              */}
              <a
                href={serviceHref(card.slug)}
                className="group relative flex h-full min-h-[16rem] flex-col justify-end overflow-hidden rounded-lg ring-1 ring-black/10 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_50px_-24px_rgba(6,19,28,0.65)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--spirit-pink)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--spirit-paper-2)] sm:min-h-[17rem]"
              >
                {/* Photographie plein cadre (object-cover, sans déformation).
                    Sous la ligne de flottaison → chargement différé (lazy). */}
                <Image
                  src={card.image || "/placeholder.svg"}
                  alt={card.imageAlt}
                  fill
                  sizes="(min-width: 1024px) 33vw, (min-width: 420px) 50vw, 100vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.05]"
                  loading="lazy"
                />
                {/* Dégradé sombre bas pour garantir la lisibilité du texte blanc. */}
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-gradient-to-t from-[color:var(--spirit-navy)] via-[color:var(--spirit-navy)]/55 to-transparent"
                />

                {/* Contenu en colonne (titre → description → CTA), aligné en bas,
                    marges internes hautes/basses suffisantes. */}
                <div className="relative z-10 flex flex-col gap-2 p-5">
                  {/* Accent rose de marque. */}
                  <span aria-hidden="true" className="h-0.5 w-9 rounded-full bg-[var(--spirit-pink)]" />
                  {/* Titre : taille responsive clamp(), jamais tronqué (aucune
                      limite de lignes), peut occuper 2–3 lignes. */}
                  <h3 className="spirit-title font-semibold leading-tight text-white [font-size:clamp(1rem,4.5vw,1.25rem)]">
                    {card.title}
                  </h3>
                  <p className="text-sm leading-snug text-white/85">{card.description}</p>
                  <span className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-white">
                    En savoir plus
                    <span
                      aria-hidden="true"
                      className="transition-transform duration-300 group-hover:translate-x-1"
                    >
                      →
                    </span>
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
