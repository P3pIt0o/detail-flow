/**
 * PAGE D'ACCUEIL (vitrine du tenant)
 * Compose les sections à partir des données du tenant courant (base de données),
 * jamais des données statiques DetailFlow.
 * - Hero : nom du tenant.
 * - AboutSection / WhyUsSection : textes personnalisables (Paramètres > Site
 *   public), fallback neutre si non configurés.
 * - Prestations : catalogue du tenant (getPublicServices, filtré par companyId) ;
 *   titre/intro personnalisables.
 * - GallerySection : réalisations Avant/Après du tenant (table beforeAfterGallery,
 *   filtrée par companyId). Masquée si le tenant n'a aucune réalisation ou si
 *   la section est désactivée.
 * - ReviewsPreview : avis du tenant courant (masquée si aucun avis ou désactivée).
 * - CtaSection : coordonnées réelles du tenant ; masquée si désactivée.
 */

import { Hero } from "@/components/sections/hero"
import { AboutSection } from "@/components/sections/about-section"
import { WhyUsSection } from "@/components/sections/why-us-section"
import { ServicesPreview } from "@/components/sections/services-preview"
import { Process } from "@/components/sections/process"
import { GallerySection } from "@/components/sections/gallery-section"
import { ReviewsPreview } from "@/components/sections/reviews-preview"
import { CtaSection } from "@/components/sections/cta-section"
import { getPublicContact } from "@/lib/public-contact"
import { getPublicSiteContent } from "@/lib/site-content"

export default async function HomePage() {
  const [contact, content] = await Promise.all([getPublicContact(), getPublicSiteContent()])
  return (
    <>
      <Hero brandName={contact.name} hero={contact.hero} />
      <AboutSection />
      <WhyUsSection />
      <ServicesPreview />
      <Process />
      <GallerySection />
      <ReviewsPreview />
      {content.contact.enabled && <CtaSection />}
    </>
  )
}
