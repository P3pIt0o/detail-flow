import { marketing } from "@/config/marketing"
import { siteConfig } from "@/config/site"
import { MARKETING_MAINTENANCE_ENABLED } from "@/lib/marketing/maintenance"
import { MaintenanceScreen } from "@/components/marketing/maintenance-screen"
import { Hero } from "@/components/marketing/v5/hero"
import { ClientLogos } from "@/components/marketing/v5/client-logos"
import { Steps } from "@/components/marketing/v5/steps"
import { Features } from "@/components/marketing/v5/features"
import { Reviews } from "@/components/marketing/v5/reviews"
import { Pricing } from "@/components/marketing/v5/pricing"
import { Faq } from "@/components/marketing/v5/faq"
import { FinalCta } from "@/components/marketing/v5/final-cta"
import { FAQ_V5 } from "@/components/marketing/v5/data"

/**
 * Landing DetailFlow.fr (domaine racine) — v5 (L42, maquette `docs/lots/L42.apercu.html`).
 * Les composants v4 restent dans `components/marketing/v4/` (retour arrière = rebrancher les imports).
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
      mainEntity: FAQ_V5.map((item) => ({
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
      <ClientLogos />
      <Steps />
      <Features />
      <Reviews />
      <Pricing />
      <Faq />
      <FinalCta />
    </>
  )
}
