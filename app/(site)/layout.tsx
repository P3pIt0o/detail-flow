import type React from "react"
import type { Metadata } from "next"
import { Navbar } from "@/components/layout/navbar"
import { Footer } from "@/components/layout/footer"
import { WhatsAppButton } from "@/components/layout/whatsapp-button"
import { SiteTracker } from "@/components/site/site-tracker"
import { getCurrentTenant } from "@/lib/tenant"
import { getPublicContact } from "@/lib/public-contact"
import { resolveSiteContent, type SiteContent } from "@/lib/site-content"
import { resolveCustomSite } from "@/lib/custom-sites/server"
import { buildTenantMetadata, resolveTenantSeo, buildTenantLocalBusiness } from "@/lib/seo/tenant-seo.server"
import { SPIRIT_PAGE_META } from "@/components/custom-sites/spirit-acs/seo-content"

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
  const seo = await resolveTenantSeo()
  // Hors contexte tenant (vitrine racine detailflow.fr) : conserver les
  // métadonnées globales du root layout.
  if (!seo.tenant) return {}
  const tenant = seo.tenant

  const clean = (v: string | null | undefined) => {
    const t = (v ?? "").trim()
    return t ? t : null
  }

  const city = clean(tenant.city)
  const name = seo.siteName

  // Titre : le titre éditable du tenant reste PRIORITAIRE. À défaut, pour Spirit
  // ACS on utilise le titre éditorial local dédié ; sinon un repli générique
  // localisé. (`heroHighlight` n'est qu'un fragment mis en avant DANS le titre :
  // jamais concaténé.)
  const genericTitle = city ? `Detailing automobile à ${city} | ${name}` : name
  const title =
    clean(tenant.heroTitle) ?? (seo.isSpirit ? SPIRIT_PAGE_META.home.title : genericTitle)

  // Description : sous-titre / présentation réellement personnalisés d'abord ;
  // repli éditorial Spirit sinon générique. Aucune prestation inventée.
  const rawContent = (tenant.siteContent ?? null) as SiteContent | null
  const genericDesc = `${name} — detailing et entretien automobile${
    city ? ` à ${city}` : ""
  }. Demandez votre devis personnalisé en ligne.`
  const description =
    clean(tenant.heroSubtitle) ??
    clean(rawContent?.about?.text) ??
    (seo.isSpirit ? SPIRIT_PAGE_META.home.description : genericDesc)

  // Métadonnées centralisées : canonique tenant-aware (conserve ?tenant=),
  // Open Graph + Twitter, image OG et favicon Spirit le cas échéant.
  return buildTenantMetadata({ path: "/", title, description })
}

// Données structurées Schema.org (LocalBusiness/AutoWash) pour un SEO local
// optimal. Le JSON-LD est construit côté serveur via `buildTenantLocalBusiness`
// à partir des coordonnées RÉELLES du tenant (adresse structurée, horaires,
// réseaux) : aucune donnée statique, aucune propriété vide.
function StructuredData({ jsonLd }: { jsonLd: Record<string, unknown> }) {
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

  // DISPATCH DE SHELL : un site personnalisé enregistré avec `ownShell` fournit
  // sa PROPRE navigation/pied de page. On n'applique alors pas la Navbar/Footer
  // standard, mais on CONSERVE le tracking et les gardes communes. Clé null ou
  // inconnue => `null` => shell standard exact ci-dessous (aucune régression).
  const customSite = await resolveCustomSite()
  const useOwnShell = Boolean(customSite?.ownShell)

  // JSON-LD LocalBusiness/AutoWash construit à partir des données RÉELLES du
  // tenant (adresse structurée, horaires, réseaux). Les sites à shell propre
  // (Spirit ACS) limitent volontairement l'adresse à la localité. Lien Google
  // Maps réel dérivé de l'adresse affichée si disponible. Renvoie null hors
  // contexte tenant → aucun script émis.
  const mapsHref = contact.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(contact.address)}`
    : null
  const localBusinessJsonLd = tenant
    ? await buildTenantLocalBusiness({ localityOnly: useOwnShell, hasMap: mapsHref })
    : null

  if (useOwnShell) {
    return (
      <div style={hasBrandColors ? brandStyle : undefined}>
        {tenant && <SiteTracker />}
        {localBusinessJsonLd && <StructuredData jsonLd={localBusinessJsonLd} />}
        {/* Le bouton WhatsApp des sites à shell propre est monté PAR leur shell
            (ex. SpiritSiteShell), afin de porter un message pré-rempli adapté à
            l'univers du site. Il n'est donc pas rendu ici pour éviter un doublon. */}
        <main id="contenu">{children}</main>
      </div>
    )
  }

  return (
    <div style={hasBrandColors ? brandStyle : undefined}>
      {/* Tracking analytics des pages publiques tenant uniquement (jamais admin,
          jamais la vitrine racine sans tenant). companyId résolu côté serveur. */}
      {tenant && <SiteTracker />}
      {localBusinessJsonLd && <StructuredData jsonLd={localBusinessJsonLd} />}
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
