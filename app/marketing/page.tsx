import { StaticMarketingContent } from "@/components/marketing/static-marketing-content"
import { marketing } from "@/config/marketing"
import { siteConfig } from "@/config/site"

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
      <StaticMarketingContent />
    </>
  )
}
