"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Check, Code2, ExternalLink, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { WidgetPrimaryAction } from "@/lib/admin/primary-action"

/**
 * Action principale « Intégrer la réservation » (tenants en mode widget).
 * Réutilise le code d'intégration existant, résolu côté serveur : aucune
 * donnée tenant n'est reconstruite ici.
 */
export function WidgetActionButton({ action, className }: { action: WidgetPrimaryAction; className?: string }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  const copyCode = useCallback(async () => {
    setError(false)
    try {
      await navigator.clipboard.writeText(action.scriptSnippet)
      setCopied(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1800)
    } catch {
      setError(true)
    }
  }, [action.scriptSnippet])

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
            className="relative flex w-full max-w-md flex-col gap-4 rounded-t-2xl border border-border bg-card p-5 sm:rounded-2xl"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h2 id="widget-action-title" className="text-base font-semibold text-foreground">
                  Intégrer la réservation
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
                  Collez ce code sur votre site pour que vos clients réservent directement chez vous.
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

            {!action.active && (
              <p className="rounded-lg bg-muted px-3 py-2 text-sm leading-relaxed text-muted-foreground text-pretty">
                La réservation en ligne n&apos;est pas encore activée : le module restera invisible pour vos clients
                tant que DetailFlow ne l&apos;a pas activé.
              </p>
            )}

            <button
              type="button"
              onClick={copyCode}
              aria-live="polite"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {copied ? <Check className="size-4" aria-hidden="true" /> : <Code2 className="size-4" aria-hidden="true" />}
              {copied ? "Code copié" : error ? "Réessayer" : "Copier le code du widget"}
            </button>

            {action.moduleUrl ? (
              <a
                href={action.moduleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                <ExternalLink className="size-4" aria-hidden="true" />
                Voir mon module
              </a>
            ) : (
              <p className="text-center text-xs text-muted-foreground">
                « Voir mon module » sera disponible une fois la réservation activée.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </>
  )
}
