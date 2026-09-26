import type { Metadata } from "next"
import { Questionnaire } from "./questionnaire"

// Tunnel de qualification : pas d'intérêt SEO propre (contenu dynamique très
// court), on évite l'indexation d'une page « formulaire ».
export const metadata: Metadata = {
  title: "Diagnostic gratuit — votre site sur mesure",
  description:
    "Répondez à quelques questions et recevez un diagnostic gratuit pour votre site internet de detailing sur mesure : réservation, SEO local, demandes de devis.",
  robots: { index: false, follow: true },
  alternates: { canonical: "/diagnostic" },
}

export default function DiagnosticPage() {
  return <Questionnaire />
}
