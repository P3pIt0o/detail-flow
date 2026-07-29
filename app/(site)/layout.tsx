import type React from "react"
import { siteConfig } from "@/config/site"
import { Navbar } from "@/components/layout/navbar"
import { Footer } from "@/components/layout/footer"
import { WhatsAppButton } from "@/components/layout/whatsapp-button"
import { getCurrentTenant } from "@/lib/tenant"

// Données structurées Schema.org (LocalBusiness) pour un SEO local optimal.
// Uniquement sur les pages publiques (pas dans l'espace pro).
function StructuredData() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "AutoWash",
    name: siteConfig.brand.name,
    description: siteConfig.seo.description,
    url: siteConfig.seo.url,
    telephone: siteConfig.contact.phoneRaw,
    email: siteConfig.contact.email,
    image: `${siteConfig.seo.url}${siteConfig.seo.ogImage}`,
    address: {
      "@type": "PostalAddress",
      streetAddress: siteConfig.contact.address.street,
      postalCode: siteConfig.contact.address.zip,
      addressLocality: siteConfig.contact.address.city,
      addressCountry: siteConfig.contact.address.country,
    },
    openingHours: siteConfig.hours
      .filter((h) => h.open)
      .map((h) => `${["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"][h.day]} ${h.from}-${h.to}`),
    sameAs: Object.values(siteConfig.social).filter(Boolean),
  }
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  )
}

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  // Branding par tenant : nom + logo de l'entreprise du site courant.
  // Sur le domaine racine (vitrine DetailFlow), aucun tenant → repli siteConfig.
  const tenant = await getCurrentTenant()
  const brandName = tenant?.name
  const logoSrc = tenant?.logoUrl ? `/api/company-logo?company=${encodeURIComponent(tenant.slug)}` : undefined

  return (
    <>
      <StructuredData />
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Aller au contenu
      </a>
      <Navbar brandName={brandName} logoSrc={logoSrc} />
      <main id="contenu">{children}</main>
      <Footer brandName={brandName} logoSrc={logoSrc} />
      <WhatsAppButton />
    </>
  )
}
