import type { Metadata } from "next"
import { ConditionsContent } from "@/components/legal/conditions-content"

export const metadata: Metadata = {
  title: "Conditions générales DetailFlow",
  description:
    "Conditions générales d'utilisation et de vente de la plateforme DetailFlow pour les professionnels du detailing.",
  alternates: { canonical: "/conditions" },
  robots: { index: false, follow: true },
}

/**
 * ============================================================================
 *  CONDITIONS GÉNÉRALES — Plateforme DetailFlow (SaaS)
 * ============================================================================
 *  Page distincte des CGV par tenant (/cgv), qui sont le texte libre rédigé
 *  par chaque entreprise pour SES propres clients. Cette page-ci décrit les
 *  conditions de DetailFlow envers les professionnels utilisateurs.
 *
 *  Contenu CANONIQUE mutualisé (`components/legal/conditions-content.tsx`),
 *  partagé avec la vitrine marketing pour garantir des conditions identiques
 *  quel que soit le domaine.
 * ============================================================================
 */
export default function ConditionsDetailFlowPage() {
  return <ConditionsContent />
}
