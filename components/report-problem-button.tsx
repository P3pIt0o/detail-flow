"use client"

import { AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

/** Adresse de support de la plateforme. */
const SUPPORT_EMAIL = "support@detailflow.fr"

type Props = {
  className?: string
  label?: string
}

/**
 * Bouton « Signaler un problème » pour les pages publiques et les pages
 * d'erreur (404). Ne dépend d'aucun contexte serveur/tenant : le contexte
 * technique (URL, navigateur, appareil, date/heure) est collecté au CLIC côté
 * navigateur puis pré-rempli dans un email vers le support. Sûr à prérendre
 * (aucune lecture de window/navigator au rendu, pas de useSearchParams).
 */
export function ReportProblemButton({ className, label = "Signaler un problème" }: Props) {
  function handleClick() {
    if (typeof window === "undefined") return
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
    const url = window.location.href
    const userAgent = navigator.userAgent || "(non fourni)"
    const platform = nav.userAgentData?.platform || navigator.platform || "(non fourni)"
    const date = new Date().toLocaleString("fr-FR", { dateStyle: "full", timeStyle: "medium" })

    const subject = "Signalement d'un problème"
    const body = [
      "Décrivez le problème rencontré :",
      "",
      "",
      "------------------------------",
      "Informations techniques (ne pas modifier) :",
      `URL : ${url}`,
      `Navigateur : ${userAgent}`,
      `Appareil / plateforme : ${platform}`,
      `Date et heure : ${date}`,
    ].join("\n")

    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted",
        className,
      )}
    >
      <AlertTriangle className="size-4 text-primary" aria-hidden="true" />
      {label}
    </button>
  )
}
