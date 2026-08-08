import type { Metadata } from "next"
import { getPublicReviews } from "@/lib/catalog-queries"
import { PageHeader } from "@/components/layout/page-header"
import { ReviewCard } from "@/components/review-card"
import { StarRating } from "@/components/ui/star-rating"
import { CtaSection } from "@/components/sections/cta-section"
import { Reveal } from "@/components/ui/reveal"

export const metadata: Metadata = {
  title: "Avis clients",
  description:
    "Lisez les avis de nos clients satisfaits. Découvrez pourquoi ils nous confient l'entretien et la protection de leur véhicule.",
  alternates: { canonical: "/avis" },
}

export default async function AvisPage() {
  // Avis visibles du tenant courant (DB).
  const reviews = await getPublicReviews()
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
