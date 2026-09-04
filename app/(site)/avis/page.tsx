import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { resolveRequestTenant } from "@/lib/tenant"
import { resolveTenantReviews } from "@/lib/reviews/public"
import { PageHeader } from "@/components/layout/page-header"
import { ReviewCard } from "@/components/review-card"
import { StarRating } from "@/components/ui/star-rating"
import { GoogleReviewsSection } from "@/components/reviews/google-reviews-section"
import { CtaSection } from "@/components/sections/cta-section"
import { Reveal } from "@/components/ui/reveal"
import { requireWebsiteFeature } from "@/lib/licensing/website-guard"
import { resolveCustomSite } from "@/lib/custom-sites/server"
import { buildTenantMetadata, resolveTenantSeo } from "@/lib/seo/tenant-seo.server"
import { SPIRIT_PAGE_META } from "@/components/custom-sites/spirit-acs/seo-content"

/**
 * Métadonnées tenant-aware : la canonique pointe désormais vers l'URL PUBLIQUE
 * réelle du tenant (`.../avis?tenant={slug}`), et non plus vers un chemin relatif
 * « /avis » erroné. Pour Spirit ACS, titre/description éditoriaux localisés ;
 * sinon repli générique construit à partir du nom du tenant.
 */
export async function generateMetadata(): Promise<Metadata> {
  const seo = await resolveTenantSeo()
  const title = seo.isSpirit ? SPIRIT_PAGE_META.avis.title : `Avis clients | ${seo.siteName}`
  const description = seo.isSpirit
    ? SPIRIT_PAGE_META.avis.description
    : `Découvrez les avis des clients de ${seo.siteName} sur ses prestations de detailing et d'entretien automobile.`
  return buildTenantMetadata({ path: "/avis", title, description })
}

export default async function AvisPage() {
  // Garde du site vitrine (feature website). LEGACY / domaine racine => autorisé.
  await requireWebsiteFeature()

  const tenant = await resolveRequestTenant()
  if (!tenant) notFound()

  // A3 — CTA de la page Avis. Pour Spirit ACS UNIQUEMENT, le bouton mène au
  // formulaire de demande de devis de l'accueil (« /#demande-devis ») au lieu
  // du module de réservation. `CtaButton`/`withTenant` conserve le tenant
  // courant, donc le lien fonctionne aussi sur un futur domaine personnalisé.
  // Les autres tenants gardent la destination par défaut (« /reservation »).
  const customSite = await resolveCustomSite()
  const isSpirit = customSite?.key === "spirit-acs"
  const ctaButtonHref = isSpirit ? "/#demande-devis" : undefined
  // Textes du CTA final propres à Spirit ACS (cahier des charges §11). Pour les
  // autres tenants, on laisse les valeurs par défaut/personnalisées de CtaSection.
  const spiritCta = isSpirit
    ? {
        title: "Vous souhaitez confier votre véhicule à Spirit ACS ?",
        description: "Décrivez votre véhicule et la prestation souhaitée.",
        buttonLabel: "Demander un devis",
      }
    : {}

  // Source décidée par le tenant (centralisée). Jamais les deux à la fois.
  const resolved = await resolveTenantReviews(tenant.id)

  // --- Source Google : section dédiée (masquée proprement en cas de panne). ---
  if (resolved.source === "google") {
    return (
      <>
        <PageHeader
          eyebrow="Avis clients"
          title="Ce que disent nos clients"
          description="La confiance de nos clients est notre plus belle récompense. Voici leurs retours d'expérience."
        />
        {resolved.data && <GoogleReviewsSection details={resolved.data} />}
        <CtaSection buttonHref={ctaButtonHref} {...spiritCta} />
      </>
    )
  }

  // --- Source manuelle (défaut) : rendu historique strictement identique. ---
  const reviews = resolved.reviews
  // Moyenne calculée à partir des avis (arrondie à une décimale).
  const average =
    reviews.length > 0 ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 10) / 10 : 0

  return (
    <>
      <PageHeader
        eyebrow="Avis clients"
        title="Ce que disent nos clients"
        description="La confiance de nos clients est notre plus belle récompense. Voici leurs retours d'expérience."
      />

      {/* Résumé de la note moyenne */}
      <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-6 lg:px-8">
        <Reveal>
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card/40 px-6 py-10 text-center">
            <div className="text-5xl font-bold text-foreground">{average.toFixed(1)}</div>
            <StarRating rating={Math.round(average)} />
            <p className="text-muted-foreground">
              Basé sur <strong className="text-foreground">{reviews.length}</strong> avis clients vérifiés
            </p>
          </div>
        </Reveal>
      </section>

      {/* Liste des avis */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {reviews.map((review, i) => (
            <Reveal key={review.id} delay={i * 0.06}>
              <ReviewCard review={review} />
            </Reveal>
          ))}
        </div>
      </section>

      <CtaSection buttonHref={ctaButtonHref} {...spiritCta} />
    </>
  )
}
