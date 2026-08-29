/**
 * Aperçu des avis clients sur la page d'accueil.
 *
 * Source décidée par le tenant (centralisée dans `resolveTenantReviews`) :
 *   - "manual" (défaut, rétrocompatible) : rendu manuel actuel, INCHANGÉ ;
 *   - "google" : section avis Google (masquée proprement en cas de panne).
 * Les deux sources ne sont jamais affichées simultanément.
 */

import { getPublicSiteContent } from "@/lib/site-content"
import { resolveRequestTenant } from "@/lib/tenant"
import { resolveTenantReviews } from "@/lib/reviews/public"
import { SectionHeading } from "@/components/ui/section-heading"
import { ReviewCard } from "@/components/review-card"
import { GoogleReviewsSection } from "@/components/reviews/google-reviews-section"
import { CtaButton } from "@/components/ui/cta-button"
import { Reveal } from "@/components/ui/reveal"

export async function ReviewsPreview() {
  const tenant = await resolveRequestTenant()
  if (!tenant) return null

  const [resolved, content] = await Promise.all([resolveTenantReviews(tenant.id), getPublicSiteContent()])

  // Section masquée si désactivée depuis Paramètres > Site public.
  if (!content.reviews.enabled) return null

  // --- Source Google : avis en direct, jamais mélangés aux avis manuels. ---
  if (resolved.source === "google") {
    if (!resolved.data) return null // panne/non configuré → masquage propre
    return (
      <GoogleReviewsSection
        details={resolved.data}
        appearance={{ title: content.reviews.title, subtitle: content.reviews.intro, maxItems: 3 }}
      />
    )
  }

  // --- Source manuelle (défaut) : rendu historique strictement identique. ---
  const list = resolved.reviews.slice(0, 3)
  if (list.length === 0) return null

  return (
    <section className="border-y border-border bg-card/30">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <SectionHeading eyebrow="Avis clients" title={content.reviews.title} subtitle={content.reviews.intro} />

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {list.map((review, i) => (
            <Reveal key={review.id} delay={i * 0.1}>
              <ReviewCard review={review} />
            </Reveal>
          ))}
        </div>

        <div className="mt-12 flex justify-center">
          <CtaButton href="/avis" variant="outline" size="lg" showArrow>
            Lire tous les avis
          </CtaButton>
        </div>
      </div>
    </section>
  )
}
