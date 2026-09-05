/**
 * Section « Nos prestations de detailing » de Spirit ACS (composant SERVEUR).
 *
 * Vitrine éditoriale rendue à partir de la SOURCE DE VÉRITÉ UNIQUE : le
 * `PublicSiteCatalog` (couche publique commune, Phase 2). Le composant ne
 * maintient plus AUCUNE liste en dur — il reçoit les pages de prestations
 * publiées/en-navigation déjà sélectionnées par `home-page.tsx`. Il ne peut
 * donc plus diverger de la navigation, du maillage ni du sitemap.
 *
 * - Images RÉELLES issues de la config éditoriale (aucune génération).
 * - Toute la carte est un vrai lien <a> (exploitable sans JS, focus clavier).
 * - Titres de cartes en <h3> (hiérarchie : H1 hero, H2 section, H3 cartes).
 * - Chaque carte mène à sa PAGE DÉDIÉE (SEO) via `serviceHref` (tenant conservé).
 *
 * Grille responsive : 1 → 2 (≥420px) → 3 (bureau), sans carrousel.
 */

import Image from "next/image"
import { Reveal } from "@/components/ui/reveal"
import type { PublicServicePage } from "@/lib/public-site/types"
import { SPIRIT_SECTIONS } from "./tokens"

export function SpiritPrestations({
  services,
  serviceHref,
}: {
  /** Pages de prestations (publiées + en navigation) issues du catalogue. */
  services: PublicServicePage[]
  serviceHref: (slug: string) => string
}) {
  if (services.length === 0) return null

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
          {services.map((page, i) => (
            <Reveal key={page.slug} delay={i * 0.06} className="h-full">
              {/*
                HAUTEUR MINIMALE (min-h) plutôt qu'un ratio fixe : la carte peut
                GRANDIR quand le titre passe sur 2–3 lignes → plus aucun rognage
                du titre par le haut (ex. « Polissage automobile »). `h-full`
                + items-stretch harmonisent la hauteur des cartes d'une ligne.
              */}
              <a
                href={serviceHref(page.slug)}
                className="group relative flex h-full min-h-[16rem] flex-col justify-end overflow-hidden rounded-lg ring-1 ring-black/10 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_50px_-24px_rgba(6,19,28,0.65)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--spirit-pink)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--spirit-paper-2)] sm:min-h-[17rem]"
              >
                {/* Photographie plein cadre (object-cover, sans déformation).
                    Sous la ligne de flottaison → chargement différé (lazy). */}
                <Image
                  src={page.image || "/placeholder.svg"}
                  alt={page.imageAlt ?? page.navLabel}
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
                    {page.navLabel}
                  </h3>
                  <p className="text-sm leading-snug text-white/85">{page.cardTagline ?? page.cardTitle}</p>
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
