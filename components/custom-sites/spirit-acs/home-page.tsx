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
import { activeTypes } from "@/lib/custom-requests"
import { SpiritSiteShell } from "./site-shell"
import { SpiritHero } from "./spirit-hero"
import { SpiritReassurance } from "./spirit-reassurance"
import { SpiritPrestations } from "./spirit-prestations"
import { SpiritRealisations } from "./spirit-realisations"
import { SpiritApropos } from "./spirit-apropos"
import { SpiritReservation } from "./spirit-reservation"
import { SpiritAvis } from "./spirit-avis"
import { SpiritFinalCta } from "./spirit-final-cta"
import { SPIRIT_SECTIONS, type SpiritNavItem, type SpiritService, type SpiritResolvedContent } from "./tokens"

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
  const quoteEnabled = customRequests.enabled && activeTypes(customRequests).length > 0

  const brandName = contact.name?.trim() || data.tenant.name

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
    { id: SPIRIT_SECTIONS.contact, label: "Contact" },
  ].filter((i): i is SpiritNavItem => i !== null)

  const footerTagline = content.footer.tagline?.trim() || null

  return (
    <SpiritSiteShell
      brandName={brandName}
      logoSrc={data.tenant.logoUrl}
      navItems={navItems}
      reserveHref="/reservation"
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
          intro={content.services.intro}
          services={services}
        />
      )}

      {hasGallery && content.gallery.enabled && (
        <SpiritRealisations title={content.gallery.title} intro={content.gallery.intro} items={gallery} />
      )}

      <SpiritApropos
        title={content.about.title}
        text={content.about.text}
        buttonLabel={content.about.buttonLabel?.trim() || null}
        buttonHref={content.about.buttonHref?.trim() || null}
      />

      <SpiritReservation />

      {hasReviews && <SpiritAvis title={content.reviews.title} intro={content.reviews.intro} reviews={reviews} />}

      <SpiritFinalCta title={content.contact.title} address={contact.address} quoteEnabled={quoteEnabled} />
    </SpiritSiteShell>
  )
}
