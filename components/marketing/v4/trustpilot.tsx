"use client"

import Script from "next/script"
import { Star } from "lucide-react"

/**
 * Preuve Trustpilot pour la landing V4.
 *
 * Réutilise le widget OFFICIEL Trustpilot (aucune note, aucun nombre d'avis, ni
 * TrustScore codés en dur). Le widget n'affiche QUE ce que le script officiel
 * Trustpilot renvoie, donc la note et le nombre d'avis évoluent d'eux-mêmes.
 *
 * Activation via identifiants publics :
 *   - NEXT_PUBLIC_TRUSTPILOT_BUSINESS_UNIT_ID
 *   - NEXT_PUBLIC_TRUSTPILOT_TEMPLATE_ID          (widget complet — social proof)
 *   - NEXT_PUBLIC_TRUSTPILOT_TEMPLATE_ID_MICRO    (widget compact — hero, optionnel)
 *   - NEXT_PUBLIC_TRUSTPILOT_DOMAIN               (optionnel, défaut detailflow.fr)
 *
 * Tant que l'intégration n'est pas configurée : jamais de fausse note. On
 * affiche seulement un lien discret vers la vraie page Trustpilot DetailFlow.
 */
const BUSINESS_UNIT_ID = process.env.NEXT_PUBLIC_TRUSTPILOT_BUSINESS_UNIT_ID
const TEMPLATE_ID = process.env.NEXT_PUBLIC_TRUSTPILOT_TEMPLATE_ID
const MICRO_TEMPLATE_ID = process.env.NEXT_PUBLIC_TRUSTPILOT_TEMPLATE_ID_MICRO
const DOMAIN = process.env.NEXT_PUBLIC_TRUSTPILOT_DOMAIN ?? "detailflow.fr"

const REVIEW_URL = `https://fr.trustpilot.com/review/${DOMAIN}`
const TRUSTPILOT_GREEN = "#00b67a"

/** Script officiel chargé une seule fois, en lazy (aucun impact LCP). */
function TrustpilotScript() {
  return (
    <Script
      id="trustpilot-widget-bootstrap"
      src="//widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js"
      strategy="lazyOnload"
    />
  )
}

/** Lien de repli — aucune note dynamique fictive, uniquement un accès aux avis. */
function TrustpilotFallbackLink({ compact }: { compact: boolean }) {
  return (
    <a
      href={REVIEW_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={
        compact
          ? "inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:border-foreground/25 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          : "inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground shadow-sm transition-colors hover:border-foreground/25 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      }
    >
      <Star
        className={compact ? "size-3.5" : "size-4"}
        style={{ fill: TRUSTPILOT_GREEN, color: TRUSTPILOT_GREEN }}
        aria-hidden="true"
      />
      <span>Voir nos avis sur Trustpilot</span>
    </a>
  )
}

/**
 * @param variant "compact" (hero) ou "full" (section preuve sociale)
 */
export function TrustpilotProof({ variant = "compact" }: { variant?: "compact" | "full" }) {
  const compact = variant === "compact"
  const templateId = compact ? MICRO_TEMPLATE_ID ?? TEMPLATE_ID : TEMPLATE_ID
  const configured = Boolean(BUSINESS_UNIT_ID && templateId)

  if (!configured) {
    return <TrustpilotFallbackLink compact={compact} />
  }

  return (
    <>
      <TrustpilotScript />
      <div
        className="trustpilot-widget"
        data-locale="fr-FR"
        data-template-id={templateId}
        data-businessunit-id={BUSINESS_UNIT_ID}
        data-style-height={compact ? "24px" : "52px"}
        data-style-width="100%"
        data-theme="light"
      >
        <a href={REVIEW_URL} target="_blank" rel="noopener noreferrer">
          Trustpilot
        </a>
      </div>
    </>
  )
}
