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
import { SpiritRealisations } from "./spirit-realisations"
import { SpiritApropos } from "./spirit-apropos"
import { SpiritDemandeDevis } from "./spirit-demande-devis"
import { SpiritAvis } from "./spirit-avis"
import { SpiritFinalCta } from "./spirit-final-cta"
import {
  SPIRIT_SECTIONS,
  SPIRIT_LOGO_FALLBACK,
  type SpiritNavItem,
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
  // (Spirit n'affiche PAS de section « prestations » : on ne charge donc pas
  // le catalogue de services ici.)
  const [contact, contentRaw, gallery, reviews, customRequestsRaw] = await Promise.all([
    data.getContact(),
    data.getContent(),
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
  const galleryIntro = nonDefault(content.gallery.intro, SITE_CONTENT_DEFAULTS.gallery.intro)
  const reviewsIntro = nonDefault(content.reviews.intro, SITE_CONTENT_DEFAULTS.reviews.intro)

  const hasGallery = gallery.length > 0
  const hasReviews = reviews.length > 0 && content.reviews.enabled

  // Navigation par ancres : un lien n'apparaît que si sa section est rendue.
  // Spirit n'expose PAS de lien « Prestations » (section retirée).
  const navItems: SpiritNavItem[] = [
    hasGallery ? { id: SPIRIT_SECTIONS.realisations, label: "Réalisations" } : null,
    { id: SPIRIT_SECTIONS.apropos, label: "À propos" },
    hasReviews ? { id: SPIRIT_SECTIONS.avis, label: "Avis" } : null,
    quoteEnabled ? { id: SPIRIT_SECTIONS.demandeDevis, label: "Devis" } : null,
    { id: SPIRIT_SECTIONS.contact, label: "Contact" },
  ].filter((i): i is SpiritNavItem => i !== null)

  // CTA d'en-tête : « Demander un devis » (ancre in-page) vers le vrai
  // formulaire. Repli sur les réalisations puis le contact si le module devis
  // est désactivé — jamais vers /reservation.
  const headerCta = quoteEnabled
    ? { href: `#${SPIRIT_SECTIONS.demandeDevis}`, label: "Demander un devis" }
    : hasGallery
      ? { href: `#${SPIRIT_SECTIONS.realisations}`, label: "Voir nos réalisations" }
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
      city={contact.city}
      footerTagline={footerTagline}
      immersive
    >
      <SpiritHero
        title={contact.hero.title}
        highlight={contact.hero.highlight}
        subtitle={contact.hero.subtitle}
        quoteEnabled={quoteEnabled}
        hasGallery={hasGallery}
        city={contact.city}
      />

      {/* Transitions ÉDITORIALES : alternance franche navy / blanc cassé, sans
          séparateur décoratif. Le rythme vertical et le trait rose au-dessus des
          titres suffisent à distinguer les sections. */}
      <SpiritReassurance />

      {hasGallery && content.gallery.enabled && (
        <SpiritRealisations title={content.gallery.title} intro={galleryIntro} items={gallery} />
      )}

      <SpiritApropos
        title={content.about.title}
        text={content.about.text}
        buttonLabel={content.about.buttonLabel?.trim() || null}
        buttonHref={content.about.buttonHref?.trim() || null}
      />

      {quoteEnabled && (
        <SpiritDemandeDevis title={quoteTexts?.title ?? null} intro={quoteTexts?.description ?? null} types={quoteTypes} />
      )}

      {hasReviews && <SpiritAvis title={content.reviews.title} intro={reviewsIntro} reviews={reviews} />}

      <SpiritFinalCta title={content.contact.title} city={contact.city} quoteEnabled={quoteEnabled} />
    </SpiritSiteShell>
  )
}
