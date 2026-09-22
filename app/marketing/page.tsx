import { marketing } from "@/config/marketing"
import { siteConfig } from "@/config/site"
import { HeroV2 } from "@/components/marketing/v2/hero"
import { PainPoints } from "@/components/marketing/v2/pain-points"
import { NoShowChain } from "@/components/marketing/v2/no-show-chain"
import { ClientJourney } from "@/components/marketing/v2/client-journey"
import { ProCockpit } from "@/components/marketing/v2/pro-cockpit"
import { AutomationsV2 } from "@/components/marketing/v2/automations"
import { PublicPageTeaser } from "@/components/marketing/v2/public-page-teaser"
import { Pricing } from "@/components/marketing/v2/pricing"
import { SocialProof } from "@/components/marketing/v2/social-proof"
import { FinalCtaV2 } from "@/components/marketing/v2/final-cta"
import { FaqSection } from "@/components/marketing/marketing-sections"

/**
 * Landing DetailFlow.fr (domaine racine).
 *
 * Server Component : aucune dépendance client au niveau de la page. Rend la
 * version premium statique et légèrement animée (plus de scène 3D immersive
 * `ScrollStage`), ce qui réduit fortement le JavaScript et améliore LCP/INP.
 * Les données structurées (SoftwareApplication, Organization, FAQPage) sont
 * injectées en JSON-LD pour le SEO et les moteurs IA — uniquement des
 * informations réellement présentes sur la page (aucune note ni avis inventé).
 */

const url = siteConfig.seo.url

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${url}/#organization`,
      name: marketing.brand.name,
      url,
      description: marketing.brand.tagline,
      logo: `${url}/icon.svg`,
    },
    {
      "@type": "WebSite",
      "@id": `${url}/#website`,
      name: marketing.brand.name,
      url,
      inLanguage: "fr-FR",
      publisher: { "@id": `${url}/#organization` },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${url}/#software`,
      name: marketing.brand.name,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url,
      description:
        "DetailFlow est un logiciel de gestion conçu pour les professionnels du detailing automobile. Il centralise les réservations, le planning, les clients, les véhicules, les prestations, les devis, les factures et les automatisations.",
      publisher: { "@id": `${url}/#organization` },
    },
    {
      "@type": "FAQPage",
      "@id": `${url}/#faq`,
      mainEntity: marketing.faq.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    },
  ],
}

export default function MarketingPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {/* Refonte marketing (Lot 3) — architecture validée Phase 2 :
          Hero -> Problèmes -> Chaîne no-show -> Parcours client -> Centralisation
          -> Automatisations -> Page pro -> Pricing -> Preuve sociale -> FAQ -> CTA final. */}
      <HeroV2 />
      <PainPoints />
      <NoShowChain />
      <ClientJourney />
      <ProCockpit />
      <AutomationsV2 />
      <PublicPageTeaser />
      <Pricing />
      <SocialProof />
      <FaqSection />
      <FinalCtaV2 />
    </>
  )
}
