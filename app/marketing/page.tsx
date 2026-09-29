import { marketing } from "@/config/marketing"
import { siteConfig } from "@/config/site"
import { MARKETING_MAINTENANCE_ENABLED } from "@/lib/marketing/maintenance"
import { MaintenanceScreen } from "@/components/marketing/maintenance-screen"
import { Hero } from "@/components/marketing/v4/hero"
import { Partners } from "@/components/marketing/v4/partners"
import { Problem } from "@/components/marketing/v4/problem"
import { BookingSection } from "@/components/marketing/v4/booking-section"
import { Planning } from "@/components/marketing/v4/planning"
import { Bento } from "@/components/marketing/v4/bento"
import { Website } from "@/components/marketing/v4/website"
import { CaseStudy } from "@/components/marketing/v4/case-study"
import { CustomizeSection } from "@/components/marketing/v4/customize-section"
import { Invoicing } from "@/components/marketing/v4/invoicing"
import { Mobile } from "@/components/marketing/v4/mobile"
import { Detailing } from "@/components/marketing/v4/detailing"
import { Compare } from "@/components/marketing/v4/compare"
import { Pricing } from "@/components/marketing/v4/pricing"
import { Faq } from "@/components/marketing/v4/faq"
import { FinalCta } from "@/components/marketing/v4/final-cta"
import { LANDING_FAQ } from "@/components/marketing/v4/faq-data"

/**
 * Landing DetailFlow.fr (domaine racine) — v4.
 *
 * Server Component : seuls la navigation, la démo de réservation, la démo de
 * personnalisation et les révélations au scroll sont des îlots client.
 * Narration : produit → problème → réservation → planning → modules → site →
 * administration → facturation → mobile → métier → avant/après → tarifs → FAQ.
 *
 * JSON-LD : uniquement des informations réellement présentes (aucune note,
 * aucun avis, aucun chiffre inventé).
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
        "DetailFlow est un logiciel de gestion pour les professionnels du detailing automobile : site internet, réservation en ligne, planning, clients et véhicules, acomptes, facturation et avoirs.",
      publisher: { "@id": `${url}/#organization` },
    },
    {
      "@type": "FAQPage",
      "@id": `${url}/#faq`,
      mainEntity: LANDING_FAQ.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    },
  ],
}

export default function MarketingPage() {
  // MODE MAINTENANCE (vitrine marketing uniquement) : on court-circuite la
  // landing sans la supprimer.
  if (MARKETING_MAINTENANCE_ENABLED) {
    return <MaintenanceScreen />
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Hero />
      <Partners />
      <Problem />
      <BookingSection />
      <Planning />
      <Bento />
      <Website />
      <CaseStudy />
      <CustomizeSection />
      <Invoicing />
      <Mobile />
      <Detailing />
      <Compare />
      <Pricing />
      <Faq />
      <FinalCta />
    </>
  )
}
