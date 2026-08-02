import type React from "react"
import { Navbar } from "@/components/layout/navbar"
import { Footer } from "@/components/layout/footer"
import { WhatsAppButton } from "@/components/layout/whatsapp-button"
import { getCurrentTenant } from "@/lib/tenant"
import { getPublicContact, type PublicContact } from "@/lib/public-contact"

// Données structurées Schema.org (LocalBusiness) pour un SEO local optimal.
// Uniquement sur les pages publiques, et UNIQUEMENT à partir des coordonnées
// réelles du tenant (aucune donnée statique).
function StructuredData({ name, contact }: { name: string; contact: PublicContact }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "AutoWash",
    name,
    ...(contact.phoneRaw ? { telephone: contact.phoneRaw } : {}),
    ...(contact.email ? { email: contact.email } : {}),
    ...(contact.website ? { url: contact.website } : {}),
    ...(contact.address ? { address: contact.address } : {}),
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

  // Coordonnées publiques réelles du tenant (jamais de données statiques).
  const contact = await getPublicContact()

  // Couleurs de marque du tenant : surcharge des variables de thème UNIQUEMENT
  // si l'entreprise en a défini. Sinon aucune variable n'est injectée → la
  // vitrine racine (detailflow.fr) et les tenants sans couleur gardent le thème
  // par défaut de globals.css. Les hex sont des valeurs CSS valides pour ces vars.
  const brandStyle: React.CSSProperties = {}
  if (tenant?.brandPrimary) {
    ;(brandStyle as Record<string, string>)["--primary"] = tenant.brandPrimary
    ;(brandStyle as Record<string, string>)["--ring"] = tenant.brandPrimary
  }
  if (tenant?.brandSecondary) {
    ;(brandStyle as Record<string, string>)["--secondary"] = tenant.brandSecondary
  }
  const hasBrandColors = Boolean(tenant?.brandPrimary || tenant?.brandSecondary)

  return (
    <div style={hasBrandColors ? brandStyle : undefined}>
      {contact.name && <StructuredData name={contact.name} contact={contact} />}
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Aller au contenu
      </a>
      <Navbar brandName={brandName} logoSrc={logoSrc} phone={contact.phone} phoneRaw={contact.phoneRaw} />
      <main id="contenu">{children}</main>
      <Footer
        brandName={brandName}
        logoSrc={logoSrc}
        tenantSlug={tenant?.slug ?? null}
        contact={contact}
      />
      <WhatsAppButton />
    </div>
  )
}
