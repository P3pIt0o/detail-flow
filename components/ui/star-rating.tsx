import { Star } from "lucide-react"
import { cn } from "@/lib/utils"

/** Affichage d'une note sur 5 sous forme d'étoiles. */
export function StarRating({ rating, className }: { rating: number; className?: string }) {
  return (
    <div className={cn("flex items-center gap-0.5", className)} aria-label={`Note : ${rating} sur 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn("size-4", i < rating ? "fill-primary text-primary" : "fill-muted text-muted")}
          aria-hidden="true"
        />
      ))}
    </div>
  )
}
