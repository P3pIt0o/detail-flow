"use client"

import { useEffect } from "react"
import { ArrowRight, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDuration } from "@/lib/format"
import { formatPriceCompact } from "@/lib/booking/v2"

type Props = {
  priceCents: number
  durationMin: number
  priceLabel: string
  ctaLabel: string
  disabled: boolean
  loading?: boolean
  hint?: string | null
  onCta: () => void
  /** En iframe (auto-hauteur), la barre suit le flux au lieu d'être fixée à l'écran. */
  embed?: boolean
}

export function StickyBar({ priceCents, durationMin, priceLabel, ctaLabel, disabled, loading, hint, onCta, embed }: Props) {
  // Remonte le bouton WhatsApp flottant du site tant que la barre est affichée.
  useEffect(() => {
    if (embed) return
    const root = document.documentElement
    root.classList.add("df-bv2-bar")
    return () => root.classList.remove("df-bv2-bar")
  }, [embed])

  return (
    <div
      className={cn(
        "z-40 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85",
        embed ? "sticky bottom-0 mt-6" : "fixed inset-x-0 bottom-0",
      )}
    >
      <div className="mx-auto flex w-full max-w-lg items-center justify-between gap-4 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3">
        <div className="min-w-0" aria-live="polite">
          <p className="text-[11px] font-medium text-muted-foreground">{priceLabel}</p>
          <p className="text-xl font-bold leading-tight text-foreground">{formatPriceCompact(priceCents)}</p>
          <p className="text-xs text-muted-foreground">{durationMin > 0 ? formatDuration(durationMin) : "—"}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={onCta}
            disabled={disabled || loading}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <ArrowRight className="size-4" aria-hidden="true" />
            )}
            {ctaLabel}
          </button>
          {hint && disabled && <p className="max-w-48 text-right text-[11px] leading-snug text-muted-foreground">{hint}</p>}
        </div>
      </div>
    </div>
  )
}
