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
import { SpiritDemandeDevis } from "./spirit-demande-devis"
import { SpiritAvis } from "./spirit-avis"
import { SpiritAvisGoogle } from "./spirit-avis-google"
import { resolveTenantReviews, getTenantGoogleRating } from "@/lib/reviews/public"
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

  // Avis : on passe désormais par le résolveur CENTRAL `resolveTenantReviews`
  // (le même que le site standard `/avis`), au lieu de n'afficher que les avis
  // manuels. Il respecte la SOURCE choisie par le tenant dans l'admin :
  //   - « manuel » → avis DetailFlow saisis (déjà chargés, réutilisés) ;
  //   - « google » → avis Google réels de la fiche (jamais un simple lien
  //     supposé contenir des avis ; aucune donnée inventée).
  // Isolation : `data.tenant.id` est le companyId résolu côté serveur.
  const reviewsResolved = await resolveTenantReviews(data.tenant.id, { manualReviews: reviews })
  const hasManualReviews = reviewsResolved.source === "manual" && reviewsResolved.reviews.length > 0
  const hasGoogleReviews =
    reviewsResolved.source === "google" &&
    reviewsResolved.data != null &&
    (typeof reviewsResolved.data.rating === "number" || reviewsResolved.data.reviews.length > 0)
  // La section avis n'apparaît que si elle est activée ET qu'il y a réellement
  // quelque chose à montrer (aucun espace vide, aucun placeholder).
  const hasReviews = content.reviews.enabled && (hasManualReviews || hasGoogleReviews)

  // Note GLOBALE Google réelle pour la présentation compacte du hero,
  // INDÉPENDANTE de la source d'avis affichée. Si les avis viennent déjà de
  // Google, on réutilise la fiche déjà chargée (zéro appel supplémentaire) ;
  // sinon on résout la note via le Place ID configuré (fiche en cache). Null si
  // aucun établissement Google n'est configuré / note indisponible → masquée.
  const googleRating =
    reviewsResolved.source === "google" &&
    reviewsResolved.data &&
    typeof reviewsResolved.data.rating === "number"
      ? { rating: reviewsResolved.data.rating, url: reviewsResolved.data.googleMapsUri }
      : await getTenantGoogleRating(data.tenant.id)

  // Navigation par ancres : un lien n'apparaît que si sa section est rendue.
  // La section « Prestations » (familles de services) est toujours rendue.
  const navItemsRaw: (SpiritNavItem | null)[] = [
    { id: SPIRIT_SECTIONS.prestations, label: "Prestations" },
    hasGallery ? { id: SPIRIT_SECTIONS.realisations, label: "Réalisations" } : null,
    { id: SPIRIT_SECTIONS.apropos, label: "À propos" },
    hasReviews ? { id: SPIRIT_SECTIONS.avis, label: "Avis" } : null,
    quoteEnabled ? { id: SPIRIT_SECTIONS.demandeDevis, label: "Devis" } : null,
    { id: SPIRIT_SECTIONS.contact, label: "Contact" },
  ]
  const navItems: SpiritNavItem[] = navItemsRaw.filter((i): i is SpiritNavItem => i !== null)

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
        googleRating={googleRating?.rating ?? null}
        googleUrl={googleRating?.url ?? null}
      />

      {/* Transitions ÉDITORIALES : alternance franche navy / blanc cassé, sans
          séparateur décoratif. Le rythme vertical et le trait rose au-dessus des
          titres suffisent à distinguer les sections. */}
      <SpiritReassurance />

      {/* Familles de prestations — immédiatement APRÈS le bandeau de réassurance
          et AVANT les réalisations (position imposée par la maquette). Chaque
          carte mène au formulaire de devis existant (via headerCta). */}
      <SpiritPrestations ctaHref={headerCta.href} />

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

      {hasReviews && reviewsResolved.source === "manual" && (
        <SpiritAvis title={content.reviews.title} intro={reviewsIntro} reviews={reviewsResolved.reviews} />
      )}
      {hasReviews && reviewsResolved.source === "google" && reviewsResolved.data && (
        <SpiritAvisGoogle title={content.reviews.title} intro={reviewsIntro} details={reviewsResolved.data} />
      )}
    </SpiritSiteShell>
  )
}
