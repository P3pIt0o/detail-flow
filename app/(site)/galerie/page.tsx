import type { Metadata } from "next"
import { galleryItems } from "@/config/content"
import { PageHeader } from "@/components/layout/page-header"
import { GalleryGrid } from "@/components/gallery-grid"
import { CtaSection } from "@/components/sections/cta-section"

export const metadata: Metadata = {
  title: "Galerie Avant / Après",
  description:
    "Découvrez nos transformations avant/après : polissage, protection céramique, rénovation intérieure. La preuve de notre savoir-faire en detailing.",
  alternates: { canonical: "/galerie" },
}

export default function GaleriePage() {
  return (
    <>
      <PageHeader
        eyebrow="Galerie"
        title="Avant / Après"
        description="Déplacez le curseur sur chaque image pour révéler la transformation. Des résultats concrets, sans retouche."
      />

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <GalleryGrid items={galleryItems} />
      </section>

      <CtaSection />
    </>
  )
}
