import { marketing, marketingV3 } from "@/config/marketing"
import { siteConfig } from "@/config/site"
import { HeroV3 } from "@/components/marketing/v3/hero"
import {
  ProblemConverge,
  Overview,
  FeatureSection,
  SiteOptions,
  Adaptation,
  FinalCtaV3,
} from "@/components/marketing/v3/sections"
import { FaqV3 } from "@/components/marketing/v3/faq"
import { Pricing } from "@/components/marketing/v2/pricing"
import { SocialProof } from "@/components/marketing/v2/social-proof"

/**
 * Landing DetailFlow.fr (domaine racine) — refonte « philosophie Karzly ».
 *
 * Server Component : aucune dépendance client au niveau de la page (seules les
 * animations `Reveal` le sont), ce qui préserve LCP/INP. Narration continue :
 * Hero -> Problème -> Centralisation -> Réservation -> Planning -> Clients ->
 * Paiements -> Automatisations -> Page/Site -> Tableau de bord -> Adaptation
 * métier -> Pricing -> Preuve sociale -> FAQ -> CTA final.
 *
 * Données structurées (Organization, WebSite, SoftwareApplication, FAQPage)
 * injectées en JSON-LD — uniquement des informations réellement présentes
 * (aucune note, aucun avis, aucun chiffre inventé).
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
        "DetailFlow est un logiciel de gestion pour les professionnels du detailing automobile : réservations en ligne, planning, clients et véhicules, acomptes, facturation, rappels automatiques et site internet.",
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
      <HeroV3 />
      <ProblemConverge />
      <Overview />
      {marketingV3.features.map((feature) => (
        <FeatureSection key={feature.id} feature={feature} />
      ))}
      <SiteOptions />
      <Adaptation />
      <Pricing />
      <SocialProof />
      <FaqV3 />
      <FinalCtaV3 />
    </>
  )
}
