"use client"

import { useCallback, useRef, useState } from "react"
import { Check, Copy, Link2 } from "lucide-react"

type CopyTarget = "link" | "code"

/**
 * Paramètres > Réservation en ligne (tenants widget).
 * 1. Lien public (URL seule) — 2. Code d'intégration du widget (séparé).
 * Les deux valeurs sont résolues côté serveur pour le tenant authentifié.
 */
export function OnlineBookingSettings({ bookingUrl, scriptSnippet }: { bookingUrl: string; scriptSnippet: string }) {
  const [copied, setCopied] = useState<CopyTarget | null>(null)
  const [error, setError] = useState<CopyTarget | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const copy = useCallback(async (target: CopyTarget, text: string) => {
    setError(null)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(target)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(null), 1800)
    } catch {
      setError(target)
    }
  }, [])

  return (
    <section
      aria-labelledby="online-booking-title"
      className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5"
    >
      <h2 id="online-booking-title" className="text-base font-semibold text-foreground">
        Réservation en ligne
      </h2>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-foreground">Votre lien de réservation</h3>
        <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
          Partagez ce lien sur vos réseaux sociaux, votre bio, WhatsApp, Google, SMS ou email.
        </p>
        <p className="truncate rounded-lg bg-muted px-3 py-2 font-mono text-xs text-foreground" title={bookingUrl}>
          {bookingUrl}
        </p>
        <button
          type="button"
          onClick={() => copy("link", bookingUrl)}
          aria-live="polite"
          className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {copied === "link" ? <Check className="size-4" aria-hidden="true" /> : <Link2 className="size-4" aria-hidden="true" />}
          {copied === "link" ? "Lien copié" : error === "link" ? "Réessayer" : "Copier le lien"}
        </button>
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-5">
        <h3 className="text-sm font-semibold text-foreground">Intégrer la réservation sur votre site</h3>
        <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
          Collez ce code dans une page de votre site pour y afficher directement votre module de réservation.
        </p>
        <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-muted px-3 py-2 font-mono text-xs text-foreground">
          {scriptSnippet}
        </pre>
        <button
          type="button"
          onClick={() => copy("code", scriptSnippet)}
          aria-live="polite"
          className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-lg border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          {copied === "code" ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
          {copied === "code" ? "Code copié" : error === "code" ? "Réessayer" : "Copier le code d'intégration"}
        </button>
      </div>
    </section>
  )
}
