/**
 * Section « Réalisations » de Spirit ACS (photos réelles de l'atelier).
 *
 * Direction visuelle alignée sur la MAQUETTE VALIDÉE : fond bleu nuit (navy),
 * eyebrow cyan « Réalisations », gros titre condensé blanc « Nos derniers
 * passages à l'atelier », puis une GRILLE PHOTOGRAPHIQUE compacte (2 colonnes
 * dès le mobile, 3 sur grand écran) aux coins arrondis et faibles gouttières.
 * Plus aucun grand bloc blanc, plus de légende volumineuse sous chaque image :
 * l'ambiance est celle d'une galerie automobile premium.
 *
 * SOURCE DE DONNÉES INCHANGÉE : la galerie photo publique du tenant
 * (`getPhotoGallery()`). Les titres/descriptions enregistrés restent exploités
 * pour l'ACCESSIBILITÉ et le SEO (attribut `alt` + `figcaption` visuellement
 * masquée), sans imposer l'ancienne mise en page à grosses légendes.
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
    <section id={SPIRIT_SECTIONS.galeriePhotos} data-spirit-anchor className="bg-[var(--spirit-navy)] text-white">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <Reveal>
          <p className="spirit-eyebrow">Réalisations</p>
          <h2 className="spirit-title spirit-h2 mt-3 text-balance leading-[1.05] text-white">
            Nos derniers passages à l&apos;atelier
          </h2>
        </Reveal>

        {/* Grille photographique : 2 colonnes dès le mobile, 3 sur grand écran.
            Gouttières faibles + coins arrondis pour un rendu « mur de photos »
            premium. Chaque tuile garde le même ratio (carré) pour un alignement
            net sans légende sous l'image. */}
        <div className="mt-8 grid grid-cols-2 gap-2 sm:gap-3 lg:mt-10 lg:grid-cols-3">
          {items.map((item, i) => (
            <Reveal key={item.id} delay={Math.min(i, 5) * 0.05}>
              <figure className="group relative overflow-hidden rounded-xl ring-1 ring-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.imageUrl || "/placeholder.svg"}
                  alt={item.altText || item.title || "Réalisation Spirit ACS"}
                  loading="lazy"
                  className="aspect-square w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                />
                {/* Légende conservée pour le SEO/l'accessibilité, mais masquée
                    visuellement (plus de gros bloc de texte sous la photo). */}
                {(item.title || item.description) && (
                  <figcaption className="sr-only">
                    {item.title}
                    {item.title && item.description ? " — " : ""}
                    {item.description}
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
