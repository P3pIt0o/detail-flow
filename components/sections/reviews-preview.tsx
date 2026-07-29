/**
 * Aperçu des avis clients sur la page d'accueil.
 */

import { reviews } from "@/config/content"
import { SectionHeading } from "@/components/ui/section-heading"
import { ReviewCard } from "@/components/review-card"
import { CtaButton } from "@/components/ui/cta-button"
import { Reveal } from "@/components/ui/reveal"

export function ReviewsPreview() {
  const list = reviews.slice(0, 3)

  return (
    <section className="border-y border-border bg-card/30">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <SectionHeading
          eyebrow="Avis clients"
          title="Ils nous font confiance"
          description="La satisfaction de nos clients est notre meilleure publicité."
        />

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
