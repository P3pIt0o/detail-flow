"use client"

import Script from "next/script"

/**
 * Widget TrustBox OFFICIEL Trustpilot — emplacement préparé (Lot 3 / Lot 8).
 *
 * Aucune donnée inventée : ni note, ni nombre d'avis, ni TrustScore. Le widget
 * n'affiche QUE ce que Trustpilot renvoie via son propre script officiel.
 *
 * Il ne s'active que si les identifiants publics sont fournis :
 *   - NEXT_PUBLIC_TRUSTPILOT_BUSINESS_UNIT_ID
 *   - NEXT_PUBLIC_TRUSTPILOT_TEMPLATE_ID
 *   - NEXT_PUBLIC_TRUSTPILOT_DOMAIN (optionnel, pour le lien « voir les avis »)
 *
 * Tant qu'ils sont absents : rien en production ; un cadre balisé en dev pour
 * matérialiser l'emplacement sans jamais simuler d'avis.
 */
const BUSINESS_UNIT_ID = process.env.NEXT_PUBLIC_TRUSTPILOT_BUSINESS_UNIT_ID
const TEMPLATE_ID = process.env.NEXT_PUBLIC_TRUSTPILOT_TEMPLATE_ID
const DOMAIN = process.env.NEXT_PUBLIC_TRUSTPILOT_DOMAIN

export function TrustpilotTrustBox() {
  const configured = Boolean(BUSINESS_UNIT_ID && TEMPLATE_ID)

  if (!configured) {
    // En production, on n'affiche rien tant que l'intégration n'est pas configurée.
    if (process.env.NODE_ENV === "production") return null
    // En développement/preview : emplacement clairement balisé (aucun faux avis).
    return (
      <div
        role="note"
        className="mx-auto max-w-xl rounded-2xl border-2 border-dashed border-border bg-card/40 p-6 text-center"
      >
        <p className="text-sm font-semibold text-foreground">Emplacement widget Trustpilot officiel</p>
        <p className="mt-2 text-pretty text-xs leading-relaxed text-muted-foreground">
          Intégration prête. Identifiants publics à fournir : NEXT_PUBLIC_TRUSTPILOT_BUSINESS_UNIT_ID et
          NEXT_PUBLIC_TRUSTPILOT_TEMPLATE_ID.
        </p>
      </div>
    )
  }

  return (
    <>
      <Script
        src="//widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js"
        strategy="lazyOnload"
      />
      <div
        className="trustpilot-widget"
        data-locale="fr-FR"
        data-template-id={TEMPLATE_ID}
        data-businessunit-id={BUSINESS_UNIT_ID}
        data-style-height="52px"
        data-style-width="100%"
      >
        <a href={`https://fr.trustpilot.com/review/${DOMAIN ?? ""}`} target="_blank" rel="noopener noreferrer">
          Trustpilot
        </a>
      </div>
    </>
  )
}
