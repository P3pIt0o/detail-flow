"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Check, Code2, Copy, ExternalLink, Link2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { WidgetPrimaryAction } from "@/lib/admin/primary-action"

type CopyTarget = "link" | "code"

/**
 * Action principale « Intégrer la réservation » (tenants en mode widget).
 * Lien direct + code d'intégration, tous deux résolus côté serveur pour le
 * tenant authentifié : aucune donnée tenant n'est reconstruite ici.
 */
export function WidgetActionButton({ action, className }: { action: WidgetPrimaryAction; className?: string }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState<CopyTarget | null>(null)
  const [error, setError] = useState<CopyTarget | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

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

  const bookingUrl = action.bookingUrl

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={cn(
          "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
          className,
        )}
      >
        <Code2 className="size-4 shrink-0" aria-hidden="true" />
        Intégrer la réservation
      </button>

      {open ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="widget-action-title">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            className="relative flex max-h-[90svh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-2xl border border-border bg-card p-5 sm:rounded-2xl"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h2 id="widget-action-title" className="text-base font-semibold text-foreground">
                  Intégrer la réservation
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
                  Utilisez votre lien de réservation partout où vos clients peuvent vous trouver.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>

            <section className="flex flex-col gap-2" aria-labelledby="widget-share-title">
              <h3 id="widget-share-title" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Partager votre réservation
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
                Utilisez votre lien pour permettre à vos clients de réserver depuis votre site, vos réseaux sociaux ou
                Google.
              </p>
              <p className="truncate rounded-lg bg-muted px-3 py-2 font-mono text-xs text-foreground" title={bookingUrl}>
                {bookingUrl}
              </p>
              <button
                type="button"
                onClick={() => copy("link", bookingUrl)}
                aria-live="polite"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {copied === "link" ? <Check className="size-4" aria-hidden="true" /> : <Link2 className="size-4" aria-hidden="true" />}
                {copied === "link" ? "Lien copié" : error === "link" ? "Réessayer" : "Copier mon lien de réservation"}
              </button>
              <a
                href={bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                <ExternalLink className="size-4" aria-hidden="true" />
                Voir mon module
              </a>
              {!action.active ? (
                <p className="rounded-lg bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground text-pretty">
                  La réservation en ligne n&apos;est pas encore activée : vos clients pourront réserver via ce lien dès
                  son activation.
                </p>
              ) : null}
            </section>

            <section className="flex flex-col gap-2 border-t border-border pt-4" aria-labelledby="widget-embed-title">
              <h3 id="widget-embed-title" className="text-sm font-semibold text-foreground">
                Intégrer le module directement sur mon site
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
                Affichez directement votre module de réservation dans une page de votre site.
              </p>
              <button
                type="button"
                onClick={() => copy("code", action.scriptSnippet)}
                aria-live="polite"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                {copied === "code" ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
                {copied === "code" ? "Code copié" : error === "code" ? "Réessayer" : "Copier le code d'intégration"}
              </button>
            </section>
          </div>
        </div>
      ) : null}
    </>
  )
}
