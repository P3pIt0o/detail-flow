/**
 * Section « Réalisations / Avant-Après » de Spirit ACS.
 *
 * SOURCE UNIQUE : la galerie Avant/Après réelle du tenant (getGallery), déjà
 * administrable depuis DetailFlow. On NE crée NI un second slider, NI une
 * seconde source de données : on réutilise le composant existant
 * `BeforeAfterSlider` et l'ordre/titres/descriptions enregistrés.
 *
 * A5/A6 — présentation UNIFORME : toutes les réalisations partagent la même
 * structure dans une grille régulière (2 à 3 colonnes sur ordinateur, 1 sur
 * mobile). Plus aucune carte n'est agrandie ni comprimée arbitrairement. Sous
 * chaque comparateur, un bloc dédié affiche le TITRE (contraste élevé, lisible,
 * pleine largeur, toujours visible — jamais au survol) puis la DESCRIPTION
 * quand elle existe (hiérarchie plus discrète). Les titres/descriptions
 * proviennent uniquement des champs enregistrés (aucun texte inventé). Les
 * badges « Avant »/« Après » restent gérés par le comparateur (pas de doublon).
 *
 * Masquée proprement si le tenant n'a aucune réalisation (aucun espace vide).
 */

import { BeforeAfterSlider } from "@/components/before-after-slider"
import { Reveal } from "@/components/ui/reveal"
import { SPIRIT_SECTIONS } from "./tokens"
import type { PublicGalleryItem } from "@/lib/public-gallery"

type SpiritRealisationsProps = {
  title: string
  intro: string | null
  items: PublicGalleryItem[]
}

export function SpiritRealisations({ title, intro, items }: SpiritRealisationsProps) {
  if (items.length === 0) return null

  return (
    <section
      id={SPIRIT_SECTIONS.realisations}
      data-spirit-anchor
      className="spirit-compare bg-[var(--spirit-navy)]"
    >
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        {/* En-tête de section */}
        <Reveal>
          <span className="spirit-rule" />
          <h2 className="spirit-title mt-4 text-balance text-3xl text-white sm:text-4xl">{title}</h2>
          {intro && (
            <p className="mt-5 max-w-2xl text-pretty leading-relaxed text-[color:var(--spirit-muted)]">{intro}</p>
          )}
        </Reveal>

        {/* Grille uniforme : 1 colonne (mobile), 2 (≥ sm), 3 (≥ lg). Chaque
            carte a la même structure et le même ratio d'image. `items-start`
            garantit des cartes indépendantes en hauteur, sans étirement. */}
        <div className="mt-10 grid items-start gap-6 sm:grid-cols-2 sm:gap-8 lg:mt-12 lg:grid-cols-3">
          {items.map((item, i) => (
            <Reveal key={item.id} delay={Math.min(i, 3) * 0.08}>
              <figure className="flex flex-col">
                <BeforeAfterSlider
                  before={item.beforeImageUrl}
                  after={item.afterImageUrl}
                  alt={item.title ?? "Réalisation Spirit"}
                />
                {(item.title || item.description) && (
                  <figcaption className="mt-4">
                    {item.title && (
                      <p className="text-pretty text-base font-semibold leading-snug text-white">{item.title}</p>
                    )}
                    {item.description && (
                      <p className="mt-1.5 text-pretty text-sm leading-relaxed text-[color:var(--spirit-muted)]">
                        {item.description}
                      </p>
                    )}
                  </figcaption>
                )}
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
