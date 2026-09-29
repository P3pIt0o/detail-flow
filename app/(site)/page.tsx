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
import { PhotoGallerySection } from "@/components/sections/photo-gallery-section"
import { ReviewsPreview } from "@/components/sections/reviews-preview"
import { CustomRequestsSection } from "@/components/sections/custom-requests-section"
import { CtaSection } from "@/components/sections/cta-section"
import { getPublicContact } from "@/lib/public-contact"
import { getPublicSiteContent, getPublicSectionOrder, type HomeSectionKey } from "@/lib/site-content"
import { requireWebsiteFeature } from "@/lib/licensing/website-guard"
import { resolveCustomSite, getCustomSitePublicData } from "@/lib/custom-sites/server"
import { getCurrentTenant } from "@/lib/tenant"
import { getTenantHeroImage, getTenantHeroOverlay } from "@/lib/tenant-hero"
import { getEffectivePublicPageForCurrentTenant } from "@/lib/public-page/config"
import { PracticalInfo } from "@/components/public-page/practical-info"

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

  const [tenant, contact, content, order, publicPage] = await Promise.all([
    getCurrentTenant(),
    getPublicContact(),
    getPublicSiteContent(),
    getPublicSectionOrder(),
    // Config LOT 2 (page publique paramétrable). null hors contexte tenant, et
    // repli company-only si la table n'existe pas encore → aucune régression.
    getEffectivePublicPageForCurrentTenant(),
  ])

  // Image de fond du Hero : l'image téléversée dans le configurateur (LOT 2)
  // est PRIORITAIRE si renseignée ; sinon repli sur la surcharge historique par
  // slug, puis sur l'image par défaut. Aucun tenant sans config n'est affecté.
  const heroImage = publicPage?.heroImageUrl ?? getTenantHeroImage(tenant?.slug)

  // Bascules de sections du configurateur : STRICTEMENT ADDITIVES. Une section
  // n'est masquée QUE si une config dédiée existe ET que le propriétaire l'a
  // explicitement désactivée. Sans config (tous les tenants existants) ou avec
  // une bascule à `true`, on laisse la logique interne de chaque section
  // décider — comportement historique intégralement préservé.
  const cfgHides = (visible: boolean) => Boolean(publicPage?.hasConfig) && !visible
  const hideAbout = cfgHides(publicPage?.showAbout ?? true)
  const hideGallery = cfgHides(publicPage?.showGallery ?? true)
  const hideReviews = cfgHides(publicPage?.showReviews ?? true)
  // Voile du Hero résolu côté serveur par slug. Historique par défaut ; réduit
  // uniquement pour justcleandetailing. Aucun autre tenant n'est affecté.
  const heroOverlay = getTenantHeroOverlay(tenant?.slug)

  // Chaque section conserve sa logique interne d'activation/masquage ; seul
  // l'ORDRE change ici. La section Contact reste masquée si elle est désactivée.
  const sections: Record<HomeSectionKey, React.ReactNode> = {
    about: hideAbout ? null : <AboutSection key="about" />,
    whyUs: <WhyUsSection key="whyUs" />,
    services: <ServicesPreview key="services" />,
    process: <Process key="process" />,
    gallery: hideGallery ? null : (
      <div key="gallery">
        {/* Comparateur Avant/Après (inchangé) puis galerie de photos simples ;
            chacune se masque seule si vide. Regroupées dans le même emplacement
            « gallery » de l'ordre configurable : aucun impact sur les autres
            sections ni sur les tenants sans galerie photo. */}
        <GallerySection />
        <PhotoGallerySection />
      </div>
    ),
    reviews: hideReviews ? null : <ReviewsPreview key="reviews" />,
    // Rendu conditionnel géré dans le composant (désactivé/aucun type => null).
    customRequests: <CustomRequestsSection key="customRequests" />,
    contact: content.contact.enabled ? <CtaSection key="contact" /> : null,
  }

  return (
    <>
      <Hero brandName={contact.name} hero={contact.hero} imageSrc={heroImage} overlay={heroOverlay} />
      {order.map((key) => sections[key])}
      {/* Informations pratiques (LOT 2) : rendu uniquement si le configurateur
          renseigne au moins un champ. Additif → aucun tenant sans config n'est
          affecté. */}
      {publicPage && (
        <PracticalInfo
          interventionZone={publicPage.interventionZone}
          depositRuleText={publicPage.depositRuleText}
          cancellationPolicy={publicPage.cancellationPolicy}
        />
      )}
    </>
  )
}
