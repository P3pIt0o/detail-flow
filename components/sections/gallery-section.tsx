import { SectionHeading } from "@/components/ui/section-heading"
import { BeforeAfterSlider } from "@/components/before-after-slider"
import { Reveal } from "@/components/ui/reveal"
import { getPublicGallery } from "@/lib/public-gallery"
import { getPublicSiteContent } from "@/lib/site-content"

/**
 * Section « Avant / Après » du site public du tenant courant.
 *
 * ISOLATION : les données viennent de `getPublicGallery()` (scopé au tenant).
 * MASQUAGE : si le tenant n'a aucune réalisation OU si la section est désactivée
 * depuis Paramètres > Site public, la section n'est pas rendue.
 */
export async function GallerySection() {
  const [items, content] = await Promise.all([getPublicGallery(), getPublicSiteContent()])
  if (items.length === 0 || !content.gallery.enabled) return null

  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <SectionHeading eyebrow="Avant / Après" title={content.gallery.title} subtitle={content.gallery.intro} />

      <div className="mt-12 grid gap-8 md:grid-cols-2">
        {items.map((item) => (
          <Reveal key={item.id} className="space-y-3">
            <BeforeAfterSlider
              before={item.beforeImageUrl}
              after={item.afterImageUrl}
              alt={item.title ?? "Réalisation avant / après"}
            />
            {(item.title || item.description) && (
              <div>
                {item.title && <p className="font-medium text-foreground">{item.title}</p>}
                {item.description && (
                  <p className="mt-1 text-pretty text-sm leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                )}
              </div>
            )}
          </Reveal>
        ))}
      </div>
    </section>
  )
}
