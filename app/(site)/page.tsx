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
import { CustomRequestsSection } from "@/components/sections/custom-requests-section"
import { CtaSection } from "@/components/sections/cta-section"
import { getPublicContact } from "@/lib/public-contact"
import { getPublicSiteContent, getPublicSectionOrder, type HomeSectionKey } from "@/lib/site-content"
import { requireWebsiteFeature } from "@/lib/licensing/website-guard"
import { resolveCustomSite, getCustomSitePublicData } from "@/lib/custom-sites/server"
import { getCurrentTenant } from "@/lib/tenant"
import { getTenantHeroImage, getTenantHeroOverlay } from "@/lib/tenant-hero"

export default async function HomePage() {
  // Garde du site vitrine (feature website). LEGACY / domaine racine => autorisé.
  // Reste active y compris pour un site personnalisé (aucun contournement).
  await requireWebsiteFeature()

  // DISPATCH PUBLIC : si le tenant a un customSiteKey enregistré, on rend SON
  // accueil personnalisé. Clé null/inconnue => `null` => site standard exact
  // ci-dessous (aucune régression, aucun autre tenant affecté).
  const customSite = await resolveCustomSite()
  if (customSite) {
    const data = await getCustomSitePublicData()
    if (data) {
      const CustomPage = customSite.Page
      return <CustomPage data={data} />
    }
  }

  const [tenant, contact, content, order] = await Promise.all([
    getCurrentTenant(),
    getPublicContact(),
    getPublicSiteContent(),
    getPublicSectionOrder(),
  ])

  // Image de fond du Hero résolue à partir de l'ENTREPRISE (slug validé côté
  // serveur), jamais de l'URL. Repli sur l'image par défaut pour tout autre
  // tenant et pour la vitrine racine sans tenant.
  const heroImage = getTenantHeroImage(tenant?.slug)
  // Voile du Hero résolu côté serveur par slug. Historique par défaut ; réduit
  // uniquement pour justcleandetailing. Aucun autre tenant n'est affecté.
  const heroOverlay = getTenantHeroOverlay(tenant?.slug)

  // Chaque section conserve sa logique interne d'activation/masquage ; seul
  // l'ORDRE change ici. La section Contact reste masquée si elle est désactivée.
  const sections: Record<HomeSectionKey, React.ReactNode> = {
    about: <AboutSection key="about" />,
    whyUs: <WhyUsSection key="whyUs" />,
    services: <ServicesPreview key="services" />,
    process: <Process key="process" />,
    gallery: <GallerySection key="gallery" />,
    reviews: <ReviewsPreview key="reviews" />,
    // Rendu conditionnel géré dans le composant (désactivé/aucun type => null).
    customRequests: <CustomRequestsSection key="customRequests" />,
    contact: content.contact.enabled ? <CtaSection key="contact" /> : null,
  }

  return (
    <>
      <Hero brandName={contact.name} hero={contact.hero} imageSrc={heroImage} overlay={heroOverlay} />
      {order.map((key) => sections[key])}
    </>
  )
}
