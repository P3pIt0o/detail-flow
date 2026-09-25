"use client"

import { useCallback, useRef, useState } from "react"
import { Link2, Check } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Action rapide « Copier mon lien ».
 *
 * UNE action = UN objectif : le clic COPIE le meilleur lien public réel de
 * l'entreprise (résolu côté serveur, jamais reconstruit ici), puis affiche une
 * confirmation très courte (« Lien copié ») avant de revenir à son état initial.
 *
 * On n'affiche JAMAIS l'URL : ni champ, ni adresse technique (`?tenant=`,
 * preview, localhost…). Si aucun lien public n'est disponible (espace non encore
 * configuré / tenant non joignable), le bouton est présenté désactivé avec une
 * explication au survol — jamais une fausse URL.
 */
export function CopyLinkButton({
  url,
  variant = "solid",
  className,
}: {
  url: string | null
  /** `solid` = header desktop/mobile ; `ghost` = à l'intérieur d'un menu. */
  variant?: "solid" | "ghost"
  className?: string
}) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const doCopy = useCallback(async () => {
    if (!url) return
    setError(false)
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
      } else {
        // Repli legacy (navigateurs sans Clipboard API).
        const ta = document.createElement("textarea")
        ta.value = url
        ta.style.position = "fixed"
        ta.style.opacity = "0"
        document.body.appendChild(ta)
        ta.select()
        document.execCommand("copy")
        document.body.removeChild(ta)
      }
      setCopied(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1800)
    } catch {
      setError(true)
    }
  }, [url])

  const disabled = !url

  const base =
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"

  const look =
    variant === "ghost"
      ? "w-full justify-start text-foreground hover:bg-muted"
      : "bg-primary text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"

  return (
    <button
      type="button"
      onClick={doCopy}
      disabled={disabled}
      aria-live="polite"
      title={
        disabled
          ? "Votre lien public sera disponible une fois votre espace configuré."
          : error
            ? "Copie impossible sur cet appareil."
            : "Copier votre lien public"
      }
      className={cn(base, look, className)}
    >
      {copied ? (
        <>
          <Check className="size-4 shrink-0" aria-hidden="true" />
          Lien copié
        </>
      ) : (
        <>
          <Link2 className="size-4 shrink-0" aria-hidden="true" />
          {error ? "Réessayer" : "Copier mon lien"}
        </>
      )}
    </button>
  )
}
