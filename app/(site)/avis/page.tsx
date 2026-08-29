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

export const metadata: Metadata = {
  title: "Avis clients",
  description:
    "Lisez les avis de nos clients satisfaits. Découvrez pourquoi ils nous confient l'entretien et la protection de leur véhicule.",
  alternates: { canonical: "/avis" },
}

export default async function AvisPage() {
  // Garde du site vitrine (feature website). LEGACY / domaine racine => autorisé.
  await requireWebsiteFeature()

  const tenant = await resolveRequestTenant()
  if (!tenant) notFound()

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
        <CtaSection />
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

      <CtaSection />
    </>
  )
}
