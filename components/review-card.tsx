import { Quote } from "lucide-react"
import type { Review } from "@/config/content"
import { StarRating } from "./ui/star-rating"

/** Carte affichant un avis client. */
export function ReviewCard({ review }: { review: Review }) {
  const hasText = Boolean(review.text?.trim())
  return (
    <figure className="flex h-full flex-col rounded-2xl border border-border bg-card p-6">
      {hasText && (
        <>
          <Quote className="size-8 text-primary/40" aria-hidden="true" />
          <blockquote className="mt-4 flex-1 text-pretty text-sm leading-relaxed text-foreground/90">
            {review.text}
          </blockquote>
        </>
      )}
      <figcaption
        className={`flex items-center justify-between ${hasText ? "mt-6 border-t border-border pt-4" : ""}`}
      >
        <div>
          <p className="font-semibold text-foreground">{review.author}</p>
          {review.vehicle && <p className="text-xs text-muted-foreground">{review.vehicle}</p>}
        </div>
        <StarRating rating={review.rating} />
      </figcaption>
    </figure>
  )
}
