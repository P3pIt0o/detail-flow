/**
 * Aperçu de la galerie avant/après sur la page d'accueil.
 * Affiche 2 comparateurs interactifs + lien vers la galerie complète.
 */

import { galleryItems } from "@/config/content"
import { SectionHeading } from "@/components/ui/section-heading"
import { BeforeAfterSlider } from "@/components/before-after-slider"
import { CtaButton } from "@/components/ui/cta-button"
import { Reveal } from "@/components/ui/reveal"

export function GalleryPreview() {
  const items = galleryItems.slice(0, 2)

  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <SectionHeading
        eyebrow="Avant / Après"
        title="Des résultats qui parlent"
        description="Déplacez le curseur pour découvrir la transformation. Chaque véhicule retrouve un éclat spectaculaire."
      />

      <div className="mt-14 grid gap-6 md:grid-cols-2">
        {items.map((item, i) => (
          <Reveal key={item.id} delay={i * 0.1}>
            <div className="space-y-3">
              <BeforeAfterSlider before={item.before} after={item.after} alt={item.title} />
              <div className="flex items-center justify-between">
                <p className="font-medium text-foreground">{item.title}</p>
                <span className="text-sm text-muted-foreground">{item.category}</span>
              </div>
            </div>
          </Reveal>
        ))}
      </div>

      <div className="mt-12 flex justify-center">
        <CtaButton href="/galerie" variant="outline" size="lg" showArrow>
          Voir toute la galerie
        </CtaButton>
      </div>
    </section>
  )
}
