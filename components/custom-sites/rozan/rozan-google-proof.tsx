/**
 * Preuve sociale Google compacte et réutilisable (note + nombre d'avis).
 *
 * En Phase 4, `rating` et `count` proviendront dynamiquement du Place ID du
 * tenant (module `lib/reviews`) pour ne jamais devenir obsolètes. Ici, valeurs
 * d'audit réelles du site Rozan.
 */

import { Star } from "lucide-react"

export function RozanStars({ rating, className = "" }: { rating: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <Star
          key={i}
          className="size-4"
          style={{ color: "var(--rozan-gold)" }}
          fill={i < Math.round(rating) ? "currentColor" : "none"}
          strokeWidth={1.5}
        />
      ))}
    </span>
  )
}

export function RozanGoogleProof({
  rating,
  count,
  href,
  tone = "light",
}: {
  rating: number
  count: number
  href?: string
  tone?: "light" | "dark"
}) {
  const wrap =
    tone === "dark"
      ? "border-white/15 bg-white/[0.04] text-white"
      : "border-[color:var(--rozan-line)] bg-[var(--rozan-surface)] text-[var(--rozan-fg)]"
  const muted = tone === "dark" ? "text-white/60" : "text-[var(--rozan-muted)]"

  const inner = (
    <div className={`inline-flex items-center gap-3 rounded-full border px-4 py-2 ${wrap}`}>
      <span className="rozan-title text-lg leading-none">{rating.toFixed(1).replace(".", ",")}</span>
      <span className="flex flex-col">
        <RozanStars rating={rating} />
        <span className={`mt-0.5 text-[11px] leading-none ${muted}`}>
          {count} avis Google
        </span>
      </span>
    </div>
  )

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`${rating} sur 5 — ${count} avis Google`}>
        {inner}
      </a>
    )
  }
  return inner
}
