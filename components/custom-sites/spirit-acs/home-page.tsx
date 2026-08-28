/**
 * Page d'accueil du site personnalisé Spirit ACS (composant SERVEUR).
 *
 * Consomme UNIQUEMENT le contrat public `CustomSitePublicData` (lot 1) : le
 * tenant est déjà résolu côté serveur, les données lourdes sont chargées via
 * les loaders paresseux, et AUCUNE logique métier n'est dupliquée (pas de `db`,
 * pas de Drizzle, pas de `companyId` client, pas de calcul de prix/dispo, pas
 * de création de réservation, pas de Stripe).
 *
 * Chaque section se masque proprement si sa donnée est absente. Les libellés de
 * navigation ne s'affichent que lorsque la section correspondante existe.
 */

import type { CustomSitePublicData } from "@/lib/custom-sites/types"
import type { CustomRequestsConfig } from "@/lib/custom-requests"
import { activeTypes, resolveCustomRequestTexts } from "@/lib/custom-requests"
import { SITE_CONTENT_DEFAULTS } from "@/lib/site-content"
import { SpiritSiteShell } from "./site-shell"
import { SpiritHero } from "./spirit-hero"
import { SpiritReassurance } from "./spirit-reassurance"
import { SpiritPrestations } from "./spirit-prestations"
import { SpiritRealisations } from "./spirit-realisations"
import { SpiritApropos } from "./spirit-apropos"
import { SpiritReservation } from "./spirit-reservation"
import { SpiritDemandeDevis } from "./spirit-demande-devis"
import { SpiritAvis } from "./spirit-avis"
import { SpiritFinalCta } from "./spirit-final-cta"
import {
  SPIRIT_SECTIONS,
  SPIRIT_LOGO_FALLBACK,
  type SpiritNavItem,
  type SpiritService,
  type SpiritResolvedContent,
} from "./tokens"

/** Renvoie la valeur seulement si le tenant l'a personnalisée (≠ défaut neutre du socle). */
function nonDefault(value: string | null | undefined, fallback: string): string | null {
  const v = (value ?? "").trim()
  if (!v || v === fallback.trim()) return null
  return v
}

export async function SpiritAcsHome({ data }: { data: CustomSitePublicData }) {
  // Chargement en parallèle — uniquement les données réellement affichées.
  const [contact, contentRaw, servicesRaw, gallery, reviews, customRequestsRaw] = await Promise.all([
    data.getContact(),
    data.getContent(),
    data.getServices(),
    data.getGallery(),
    data.getReviews(),
    data.getCustomRequestsConfig(),
  ])

  const content = contentRaw as SpiritResolvedContent
  const customRequests = customRequestsRaw as CustomRequestsConfig
  const quoteTypes = customRequests.enabled ? activeTypes(customRequests) : []
  const quoteEnabled = quoteTypes.length > 0
  // Titre / intro réels du module « Demande personnalisée » (mêmes que /demande).
  const quoteTexts = quoteEnabled ? resolveCustomRequestTexts(customRequests) : null

  const brandName = contact.name?.trim() || data.tenant.name

  // Logo RÉEL du tenant servi via la route sécurisée existante (le contrat
  // expose un PATHNAME Blob, jamais une URL directe). Repli : logo Spirit
  // officiel embarqué (jamais un faux logo typographique).
  const logoSrc = data.tenant.logoUrl
    ? `/api/company-logo?company=${encodeURIComponent(data.tenant.slug)}`
    : SPIRIT_LOGO_FALLBACK

  // Textes d'introduction : on n'affiche QUE le contenu réellement personnalisé
  // par le tenant (on masque les phrases marketing par défaut du socle).
  const servicesIntro = nonDefault(content.services.intro, SITE_CONTENT_DEFAULTS.services.intro)
  const galleryIntro = nonDefault(content.gallery.intro, SITE_CONTENT_DEFAULTS.gallery.intro)
  const reviewsIntro = nonDefault(content.reviews.intro, SITE_CONTENT_DEFAULTS.reviews.intro)

  // Prestations aminçies (sérialisables) pour le composant client.
  const services: SpiritService[] = servicesRaw.map((s) => ({
    id: Number(s.id),
    name: String(s.name),
    description: (s.description as string | null) ?? null,
    image: s.image,
    basePriceCents: Number(s.basePriceCents ?? 0),
  }))

  const hasServices = services.length > 0
  const hasGallery = gallery.length > 0
  const hasReviews = reviews.length > 0 && content.reviews.enabled

  // Navigation par ancres : un lien n'apparaît que si sa section est rendue.
  const navItems: SpiritNavItem[] = [
    hasServices ? { id: SPIRIT_SECTIONS.prestations, label: "Prestations" } : null,
    hasGallery ? { id: SPIRIT_SECTIONS.realisations, label: "Réalisations" } : null,
    { id: SPIRIT_SECTIONS.apropos, label: "À propos" },
    hasReviews ? { id: SPIRIT_SECTIONS.avis, label: "Avis" } : null,
    quoteEnabled ? { id: SPIRIT_SECTIONS.demandeDevis, label: "Devis" } : null,
    { id: SPIRIT_SECTIONS.contact, label: "Contact" },
  ].filter((i): i is SpiritNavItem => i !== null)

  // CTA d'en-tête : « Demander un devis » (ancre in-page) si le module est
  // actif, sinon repli sur la découverte des prestations / réalisations.
  const headerCta = quoteEnabled
    ? { href: `#${SPIRIT_SECTIONS.demandeDevis}`, label: "Demander un devis" }
    : hasServices
      ? { href: `#${SPIRIT_SECTIONS.prestations}`, label: "Nos prestations" }
      : { href: `#${SPIRIT_SECTIONS.contact}`, label: "Nous contacter" }

  const footerTagline = content.footer.tagline?.trim() || null

  return (
    <SpiritSiteShell
      brandName={brandName}
      logoSrc={logoSrc}
      navItems={navItems}
      ctaHref={headerCta.href}
      ctaLabel={headerCta.label}
      phone={contact.phone}
      phoneRaw={contact.phoneRaw}
      email={contact.email}
      address={contact.address}
      footerTagline={footerTagline}
    >
      <SpiritHero
        title={contact.hero.title}
        highlight={contact.hero.highlight}
        subtitle={contact.hero.subtitle}
        ctaPrimary={contact.hero.ctaPrimary}
        ctaSecondary={contact.hero.ctaSecondary}
        hasServices={hasServices}
      />

      <SpiritReassurance />

      {hasServices && (
        <SpiritPrestations
          eyebrow={content.services.eyebrowEnabled ? content.services.eyebrow : null}
          title={content.services.titleEnabled ? content.services.title : null}
          intro={servicesIntro}
          services={services}
        />
      )}

      {hasGallery && content.gallery.enabled && (
        <SpiritRealisations title={content.gallery.title} intro={galleryIntro} items={gallery} />
      )}

      <SpiritApropos
        title={content.about.title}
        text={content.about.text}
        buttonLabel={content.about.buttonLabel?.trim() || null}
        buttonHref={content.about.buttonHref?.trim() || null}
      />

      <SpiritReservation />

      {quoteEnabled && (
        <SpiritDemandeDevis title={quoteTexts?.title ?? null} intro={quoteTexts?.description ?? null} types={quoteTypes} />
      )}

      {hasReviews && <SpiritAvis title={content.reviews.title} intro={reviewsIntro} reviews={reviews} />}

      <SpiritFinalCta title={content.contact.title} address={contact.address} quoteEnabled={quoteEnabled} />
    </SpiritSiteShell>
  )
}
