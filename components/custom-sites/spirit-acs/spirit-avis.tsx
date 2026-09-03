/**
 * Section « Avis » de Spirit ACS.
 *
 * Affiche EXCLUSIVEMENT les avis DetailFlow réels et visibles du tenant
 * (getReviews). Aucune simulation d'avis Google, aucun avis inventé. La section
 * est masquée proprement s'il n'existe aucun avis visible (aucun espace vide).
 * Réutilise la carte d'avis existante (`ReviewCard`) — pas de nouvelle source.
 */

import { ReviewCard } from "@/components/review-card"
import { Reveal } from "@/components/ui/reveal"
import { SpiritSentences } from "./spirit-sentences"
import { SPIRIT_SECTIONS } from "./tokens"
import type { Review } from "@/config/content"

type SpiritAvisProps = {
  title: string
  intro: string | null
  reviews: Review[]
}

export function SpiritAvis({ title, intro, reviews }: SpiritAvisProps) {
  if (reviews.length === 0) return null

  return (
    <section
      id={SPIRIT_SECTIONS.avis}
      data-spirit-anchor
      className="bg-[var(--spirit-navy-2)]"
    >
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <Reveal>
          <span className="spirit-rule" />
          <h2 className="spirit-title mt-4 text-balance text-3xl text-white sm:text-4xl">{title}</h2>
          {/* Une phrase par ligne (présentation) : `reviews.intro` n'est jamais réécrit. */}
          {intro && <SpiritSentences text={intro} className="mt-4 max-w-2xl text-pretty text-[color:var(--spirit-muted)]" />}
        </Reveal>

        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {reviews.slice(0, 6).map((review, i) => (
            <Reveal key={review.id} delay={Math.min(i, 2) * 0.08}>
              <ReviewCard review={review} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
