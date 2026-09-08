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
  reserveHref,
}: {
  /** Pages de prestations (publiées + en navigation) issues du catalogue. */
  services: PublicServicePage[]
  /** Lien « En savoir plus » → page SEO dédiée (tenant conservé). */
  serviceHref: (slug: string) => string
  /** Lien « Réserver » → configurateur contextualisé (tenant conservé). */
  reserveHref: (slug: string) => string
}) {
  if (services.length === 0) return null

  return (
    <section
      id={SPIRIT_SECTIONS.prestations}
      data-spirit-anchor
      className="bg-[var(--spirit-navy)] text-white"
    >
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <Reveal>
          <p className="spirit-eyebrow">Nos prestations</p>
          <h2 className="spirit-title spirit-h2 mt-3 text-balance leading-[1.05] text-white">
            Choisissez, puis demandez votre devis
          </h2>
          {/* Paragraphe SEO visible, présent dans le HTML initial (non masqué). */}
          <p className="spirit-prose mt-4 max-w-3xl text-base text-[color:var(--spirit-muted)]">
            Spirit ACS propose à Lagny-sur-Marne des prestations de nettoyage automobile, polissage, protection
            céramique, PPF, rénovation des phares et detailing moto. Découvrez chaque service et trouvez la solution
            adaptée à votre véhicule.
          </p>
        </Reveal>

        <div className="mt-8 grid grid-cols-1 items-stretch gap-4 min-[420px]:grid-cols-2 lg:mt-12 lg:grid-cols-3 lg:gap-6">
          {services.map((page, i) => (
            <Reveal key={page.slug} delay={i * 0.06} className="h-full">
              {/*
                Carte à DEUX actions distinctes (cf. UX validée) :
                  - action PRINCIPALE « Réserver » → configurateur contextualisé ;
                  - action SECONDAIRE « En savoir plus » → page SEO dédiée.
                L'image + le titre restent un lien vers la page SEO (toute la
                zone visuelle est cliquable), et les boutons d'action sont posés
                DESSOUS, hors du lien, pour ne pas imbriquer deux <a>.
                `min-h` + `h-full` + items-stretch harmonisent la hauteur.
              */}
              <div className="group relative flex h-full min-h-[18rem] flex-col justify-end overflow-hidden rounded-lg ring-1 ring-white/10 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.8)] transition-all duration-300 hover:-translate-y-0.5 hover:ring-white/20 hover:shadow-[0_26px_60px_-24px_rgba(0,0,0,0.9)] sm:min-h-[19rem]">
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
                  className="absolute inset-0 bg-gradient-to-t from-[color:var(--spirit-navy)] via-[color:var(--spirit-navy)]/60 to-transparent"
                />

                {/* Contenu en colonne (titre → description → actions), aligné en bas. */}
                <div className="relative z-10 flex flex-col gap-3 p-5">
                  {/* La zone titre/description ouvre la page SEO (grande cible tactile). */}
                  <a
                    href={serviceHref(page.slug)}
                    className="flex flex-col gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--spirit-teal)]"
                  >
                    {/* Accent rose de marque. */}
                    <span aria-hidden="true" className="h-0.5 w-9 rounded-full bg-[var(--spirit-pink)]" />
                    {/* Titre : taille responsive clamp(), jamais tronqué. */}
                    <h3 className="spirit-title font-semibold leading-tight text-white [font-size:clamp(1rem,4.5vw,1.25rem)]">
                      {page.navLabel}
                    </h3>
                    <p className="text-sm leading-snug text-white/85">{page.cardTagline ?? page.cardTitle}</p>
                  </a>

                  {/* Deux actions : « Réserver » (primaire, magenta) puis
                      « En savoir plus » (secondaire, lien clair). Zones tactiles
                      confortables (h-11) et hiérarchie visuelle nette. */}
                  <div className="mt-1 flex items-center gap-3">
                    <a
                      href={reserveHref(page.slug)}
                      className="inline-flex h-11 flex-1 items-center justify-center rounded-sm bg-[var(--spirit-pink)] px-4 text-sm font-semibold uppercase tracking-wide text-white transition-colors hover:bg-[var(--spirit-pink-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    >
                      Réserver
                    </a>
                    <a
                      href={serviceHref(page.slug)}
                      className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-sm px-2 text-sm font-medium text-white/90 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--spirit-teal)]"
                    >
                      En savoir plus
                      <span aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-0.5">
                        →
                      </span>
                    </a>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
