"use client"

import { useCallback, useRef, useState } from "react"
import { Code2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { WidgetPrimaryAction } from "@/lib/admin/primary-action"

/**
 * Action principale « Intégrer la réservation » (tenants en mode widget).
 * Copie UNIQUEMENT le lien public de réservation (résolu côté serveur pour le
 * tenant authentifié). Le code d'intégration est proposé dans
 * Paramètres > Réservation en ligne.
 */
export function WidgetActionButton({ action, className }: { action: WidgetPrimaryAction; className?: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle")
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const copy = useCallback(async (_target: "link", text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setStatus("copied")
    } catch {
      setStatus("error")
    }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setStatus("idle"), 1800)
  }, [])

  const bookingUrl = action.bookingUrl

  return (
    <button
      type="button"
      onClick={() => copy("link", bookingUrl)}
      title={bookingUrl}
      className={cn(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        className,
      )}
    >
      <Code2 className="size-4 shrink-0" aria-hidden="true" />
      Intégrer la réservation
      <span className="sr-only" aria-live="polite">
        {status === "copied" ? "Lien de réservation copié" : status === "error" ? "Copie impossible" : ""}
      </span>
    </button>
  )
}
