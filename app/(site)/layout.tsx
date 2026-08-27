import type React from "react"
import type { Metadata } from "next"
import { Navbar } from "@/components/layout/navbar"
import { Footer } from "@/components/layout/footer"
import { WhatsAppButton } from "@/components/layout/whatsapp-button"
import { SiteTracker } from "@/components/site/site-tracker"
import { getCurrentTenant } from "@/lib/tenant"
import { getPublicContact, type PublicContact } from "@/lib/public-contact"
import { resolveSiteContent, type SiteContent } from "@/lib/site-content"
import { resolveCustomSite } from "@/lib/custom-sites/server"
import { siteConfig } from "@/config/site"

/**
 * MÉTADONNÉES DE PARTAGE PAR TENANT (Open Graph / Twitter / SEO).
 *
 * Calculées CÔTÉ SERVEUR à partir du tenant de la requête (en-tête posé par le
 * middleware, jamais d'une valeur client) : chaque site public partagé
 * (Instagram, WhatsApp, Messenger…) affiche automatiquement le titre /
 * description / image de SON entreprise. Aucune donnée d'un autre tenant ne
 * peut apparaître, et cela vaut automatiquement pour tout futur tenant.
 *
 * Priorités (repli garanti — aucun champ n'est jamais vide) :
 *  - Titre       : titre du Hero personnalisé → sinon nom de l'entreprise.
 *  - Description : sous-titre Hero / texte de présentation personnalisé →
 *                  sinon texte court construit depuis le nom de l'entreprise.
 *  - Image       : logo du tenant → sinon image DetailFlow par défaut.
 *                  (Aucun champ « image Hero » n'existe en base à ce jour.)
 *
 * Hors contexte tenant (vitrine racine detailflow.fr) : renvoie {} pour
 * conserver telles quelles les métadonnées globales du root layout.
 */
export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getCurrentTenant()
  if (!tenant) return {}

  const clean = (v: string | null | undefined) => {
    const t = (v ?? "").trim()
    return t ? t : null
  }

  const name = clean(tenant.name) ?? siteConfig.brand.name
  // `heroTitle` contient déjà le titre complet ; `heroHighlight` n'est qu'un
  // fragment mis en avant DANS ce titre (pas un suffixe) → ne pas le concaténer.
  const title = clean(tenant.heroTitle) ?? name

  // Texte de présentation réellement personnalisé (jamais les défauts injectés).
  const rawContent = (tenant.siteContent ?? null) as SiteContent | null
  const description =
    clean(tenant.heroSubtitle) ??
    clean(rawContent?.about?.text) ??
    `${name} — detailing et entretien automobile. Réservez votre créneau en ligne.`

  // Base absolue publique + URL réelle du tenant (forme partagée ?tenant=slug).
  const base = siteConfig.seo.url.replace(/\/+$/, "")
  const url = `${base}/?tenant=${encodeURIComponent(tenant.slug)}`
  // Image : logo du tenant (route publique scoping slug) → repli OG DetailFlow.
  const imageUrl = tenant.logoUrl
    ? `${base}/api/company-logo?company=${encodeURIComponent(tenant.slug)}`
    : `${base}${siteConfig.seo.ogImage}`

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      locale: siteConfig.seo.locale,
      url,
      siteName: name,
      title,
      description,
      images: [{ url: imageUrl, width: 1200, height: 630, alt: name }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  }
}

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

  // Contenu personnalisable du pied de page (texte + slogan). Repli sur le
  // comportement par défaut du composant Footer si le tenant n'a rien renseigné.
  const footerContent = resolveSiteContent(tenant?.siteContent).footer

  return (
    <div style={hasBrandColors ? brandStyle : undefined}>
      {/* Tracking analytics des pages publiques tenant uniquement (jamais admin,
          jamais la vitrine racine sans tenant). companyId résolu côté serveur. */}
      {tenant && <SiteTracker />}
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
        socialLinks={(tenant?.socialLinks as Record<string, string> | null) ?? null}
        footerText={footerContent.text || undefined}
        footerTagline={footerContent.tagline || undefined}
      />
      <WhatsAppButton phone={contact.phoneRaw} />
    </div>
  )
}
