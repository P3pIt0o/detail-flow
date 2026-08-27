/**
 * Section « Réalisations / Avant-Après » de Spirit ACS.
 *
 * SOURCE UNIQUE : la galerie Avant/Après réelle du tenant (getGallery), déjà
 * administrable depuis DetailFlow. On NE crée NI un second slider, NI une
 * seconde source de données : on réutilise le composant existant
 * `BeforeAfterSlider` et l'ordre/titres/descriptions enregistrés.
 *
 * - Élément mis en avant (premier de la galerie) : grand comparateur, reprenant
 *   l'intention « LA DIFFÉRENCE SE VOIT DANS LES DÉTAILS » de la maquette.
 * - Éléments suivants : grille de comparateurs plus compacts.
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

  const [featured, ...rest] = items

  return (
    <section id={SPIRIT_SECTIONS.realisations} data-spirit-anchor className="bg-[var(--spirit-navy)]">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <Reveal direction="right">
            <span className="spirit-rule" />
            <h2 className="spirit-title mt-4 text-balance text-3xl text-white sm:text-4xl">{title}</h2>
            {intro && (
              <p className="mt-5 max-w-md text-pretty leading-relaxed text-[color:var(--spirit-muted)]">{intro}</p>
            )}
            {featured.title && (
              <p className="mt-6 text-sm font-semibold uppercase tracking-wide text-[color:var(--spirit-teal)]">
                {featured.title}
              </p>
            )}
            {featured.description && (
              <p className="mt-1 text-sm text-[color:var(--spirit-muted)]">{featured.description}</p>
            )}
          </Reveal>

          <Reveal direction="left">
            <BeforeAfterSlider
              before={featured.beforeImageUrl}
              after={featured.afterImageUrl}
              alt={featured.title ?? "Réalisation Spirit"}
            />
          </Reveal>
        </div>

        {rest.length > 0 && (
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((item, i) => (
              <Reveal key={item.id} delay={Math.min(i, 3) * 0.08}>
                <figure>
                  <BeforeAfterSlider
                    before={item.beforeImageUrl}
                    after={item.afterImageUrl}
                    alt={item.title ?? "Réalisation Spirit"}
                  />
                  {item.title && (
                    <figcaption className="mt-3 text-sm font-medium text-white">{item.title}</figcaption>
                  )}
                </figure>
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
