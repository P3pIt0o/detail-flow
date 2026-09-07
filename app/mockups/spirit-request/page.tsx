import type { Metadata } from "next"
import SpiritRequestFlow from "./spirit-request-flow"

/**
 * MAQUETTE INTERACTIVE ISOLÉE — Parcours de demande Spirit ACS.
 *
 * Prototype cliquable destiné à la validation par Corentin AVANT toute
 * intégration en production. Route isolée + noindex. N'importe aucun composant
 * du site de production, n'écrit rien en base, ne touche ni au multi-tenant ni
 * aux autres tenants. Toutes les données sont réelles (cf. ./data.ts, dérivé de
 * seo-content.ts). À supprimer une fois le parcours validé.
 */

export const metadata: Metadata = {
  title: "Maquette — Parcours de demande Spirit ACS",
  robots: { index: false, follow: false },
}

export default function SpiritRequestMockupPage() {
  return <SpiritRequestFlow />
}
