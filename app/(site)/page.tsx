/**
 * PAGE D'ACCUEIL (vitrine du tenant)
 * Compose les sections à partir des données du tenant courant (base de données),
 * jamais des données statiques DetailFlow.
 * - Hero : nom du tenant.
 * - Prestations : catalogue du tenant (getPublicServices, filtré par companyId).
 * - CtaSection : coordonnées réelles du tenant.
 * - GallerySection : réalisations Avant/Après du tenant (table beforeAfterGallery,
 *   filtrée par companyId). Masquée si le tenant n'a aucune réalisation.
 * Le bloc avis n'est pas rendu : aucune donnée par tenant n'existe en base, et
 * afficher les avis DetailFlow serait une fuite de données entre entreprises.
 */

import { Hero } from "@/components/sections/hero"
import { ServicesPreview } from "@/components/sections/services-preview"
import { Process } from "@/components/sections/process"
import { GallerySection } from "@/components/sections/gallery-section"
import { CtaSection } from "@/components/sections/cta-section"
import { getPublicContact } from "@/lib/public-contact"

export default async function HomePage() {
  const contact = await getPublicContact()
  return (
    <>
      <Hero brandName={contact.name} hero={contact.hero} />
      <ServicesPreview />
      <Process />
      {/* Galerie Avant/Après du tenant courant (masquée si aucune réalisation). */}
      <GallerySection />
      <CtaSection />
    </>
  )
}
