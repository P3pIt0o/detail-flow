/**
 * PAGE D'ACCUEIL
 * Compose les différentes sections. Chaque section est autonome et lit ses
 * données depuis config/ (donc modifiable sans toucher au code de la page).
 */

import { Hero } from "@/components/sections/hero"
import { ServicesPreview } from "@/components/sections/services-preview"
import { Process } from "@/components/sections/process"
import { GalleryPreview } from "@/components/sections/gallery-preview"
import { ReviewsPreview } from "@/components/sections/reviews-preview"
import { CtaSection } from "@/components/sections/cta-section"

export default function HomePage() {
  return (
    <>
      <Hero />
      <ServicesPreview />
      <Process />
      <GalleryPreview />
      <ReviewsPreview />
      <CtaSection />
    </>
  )
}
