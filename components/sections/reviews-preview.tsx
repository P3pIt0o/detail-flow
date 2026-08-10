/**
 * Aperçu des avis clients sur la page d'accueil.
 */

import { getPublicReviews } from "@/lib/catalog-queries"
import { getPublicSiteContent } from "@/lib/site-content"
import { SectionHeading } from "@/components/ui/section-heading"
import { ReviewCard } from "@/components/review-card"
import { CtaButton } from "@/components/ui/cta-button"
import { Reveal } from "@/components/ui/reveal"

export async function ReviewsPreview() {
  // Avis visibles du tenant courant (DB). Section masquée si aucun avis ou
  // si désactivée depuis Paramètres > Site public.
  const [reviews, content] = await Promise.all([getPublicReviews(), getPublicSiteContent()])
  const list = reviews.slice(0, 3)
  if (list.length === 0 || !content.reviews.enabled) return null

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
