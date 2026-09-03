/**
 * Section « Galerie photos » de Spirit ACS (photos simples, distinctes du
 * comparateur Avant/Après). Réutilise la source unique `getPhotoGallery()` du
 * contrat public (aucune donnée dupliquée, aucune image inventée).
 *
 * Présentation cohérente avec les réalisations : fond blanc cassé, trait rose
 * au-dessus du titre, grille uniforme (1 → 2 → 3 colonnes). Chaque photo garde
 * le même ratio (4/3) et affiche, sous l'image, son titre puis sa description
 * quand ils existent — jamais au survol.
 *
 * Masquée proprement si le tenant n'a aucune photo publiée (aucun espace vide).
 */

import { Reveal } from "@/components/ui/reveal"
import { SPIRIT_SECTIONS } from "./tokens"
import type { PublicPhotoGalleryItem } from "@/lib/public-photo-gallery"

type SpiritGaleriePhotosProps = {
  items: PublicPhotoGalleryItem[]
}

export function SpiritGaleriePhotos({ items }: SpiritGaleriePhotosProps) {
  if (items.length === 0) return null

  return (
    <section id={SPIRIT_SECTIONS.galeriePhotos} data-spirit-anchor className="bg-[var(--spirit-paper)]">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <Reveal>
          <span className="spirit-rule" />
          <h2 className="spirit-title mt-4 text-balance text-3xl text-[var(--spirit-ink)] sm:text-4xl">
            Galerie photos
          </h2>
        </Reveal>

        <div className="mt-10 grid items-start gap-6 sm:grid-cols-2 sm:gap-8 lg:mt-12 lg:grid-cols-3">
          {items.map((item, i) => (
            <Reveal key={item.id} delay={Math.min(i, 3) * 0.08}>
              <figure className="flex flex-col">
                <div className="overflow-hidden rounded-sm border border-[color:var(--spirit-ink)]/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.imageUrl || "/placeholder.svg"}
                    alt={item.altText || item.title || "Réalisation Spirit"}
                    loading="lazy"
                    className="aspect-[4/3] w-full object-cover"
                  />
                </div>
                {(item.title || item.description) && (
                  <figcaption className="mt-4">
                    {item.title && (
                      <p className="text-pretty text-base font-semibold leading-snug text-[var(--spirit-ink)]">
                        {item.title}
                      </p>
                    )}
                    {item.description && (
                      <p className="mt-1.5 text-pretty text-sm leading-relaxed text-[color:var(--spirit-ink)]/70">
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
