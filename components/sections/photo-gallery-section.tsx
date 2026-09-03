import { SectionHeading } from "@/components/ui/section-heading"
import { Reveal } from "@/components/ui/reveal"
import { getPublicPhotoGallery } from "@/lib/public-photo-gallery"

/**
 * Section « Galerie photos » du site public du tenant courant (photos simples,
 * distinctes du comparateur Avant/Après).
 *
 * ISOLATION : les données viennent de `getPublicPhotoGallery()` (scopé au tenant,
 * uniquement les photos publiées).
 * MASQUAGE : si le tenant n'a aucune photo publiée, la section n'est pas rendue
 * (aucun espace vide, aucune régression pour les tenants sans galerie photo).
 */
export async function PhotoGallerySection() {
  const items = await getPublicPhotoGallery()
  if (items.length === 0) return null

  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <SectionHeading eyebrow="Galerie" title="Nos réalisations en images" />

      <div className="mt-12 grid items-start gap-6 sm:grid-cols-2 sm:gap-8 lg:grid-cols-3">
        {items.map((item) => (
          <Reveal key={item.id}>
            <figure className="flex flex-col">
              <div className="overflow-hidden rounded-xl border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.imageUrl || "/placeholder.svg"}
                  alt={item.altText || item.title || "Réalisation"}
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover"
                />
              </div>
              {(item.title || item.description) && (
                <figcaption className="mt-4">
                  {item.title && (
                    <p className="text-pretty text-base font-semibold leading-snug text-foreground">{item.title}</p>
                  )}
                  {item.description && (
                    <p className="mt-1.5 text-pretty text-sm leading-relaxed text-muted-foreground">
                      {item.description}
                    </p>
                  )}
                </figcaption>
              )}
            </figure>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
