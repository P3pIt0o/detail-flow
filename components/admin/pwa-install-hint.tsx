"use client"

import { useEffect, useState } from "react"
import { Download, X, Share } from "lucide-react"

/**
 * Aide légère à l'installation de la PWA, affichée UNIQUEMENT dans l'admin.
 * - Android/Chrome : capture `beforeinstallprompt` et déclenche le prompt natif.
 * - iOS/Safari : courte instruction "Partager → Ajouter à l'écran d'accueil".
 * Masquée si l'app est déjà installée (mode standalone) ou déjà rejetée.
 * Aucun état sensible, aucune donnée privée.
 */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

const DISMISS_KEY = "df_pwa_hint_dismissed"

export function PwaInstallHint() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [isIOS, setIsIOS] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    // Déjà installée (lancée depuis l'écran d'accueil) : ne rien afficher.
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    if (standalone) return
    if (localStorage.getItem(DISMISS_KEY) === "1") return

    const ua = window.navigator.userAgent
    const iOS = /iphone|ipad|ipod/i.test(ua) && !/crios|fxios/i.test(ua)
    if (iOS) {
      setIsIOS(true)
      setVisible(true)
      return
    }

    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      setVisible(true)
    }
    window.addEventListener("beforeinstallprompt", onPrompt)
    return () => window.removeEventListener("beforeinstallprompt", onPrompt)
  }, [])

  function dismiss() {
    setVisible(false)
    try {
      localStorage.setItem(DISMISS_KEY, "1")
    } catch {
      /* ignore */
    }
  }

  async function install() {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    setDeferred(null)
    dismiss()
  }

  if (!visible) return null

  return (
    <div className="mb-4 flex items-start gap-3 rounded-lg border border-border bg-card p-3 text-sm text-card-foreground">
      <div className="mt-0.5 shrink-0 rounded-md bg-primary/10 p-1.5 text-primary">
        <Download className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium">Installer DetailFlow sur mon téléphone</p>
        {isIOS ? (
          <p className="mt-0.5 text-muted-foreground">
            Appuyez sur{" "}
            <Share className="inline h-3.5 w-3.5 align-text-bottom" aria-label="Partager" /> Partager,
            puis « Ajouter à l&apos;écran d&apos;accueil ».
          </p>
        ) : (
          <button
            type="button"
            onClick={install}
            className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Installer l&apos;application
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Masquer"
        className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}
