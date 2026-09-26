import type { Metadata } from "next"
import { ConfidentialiteContent } from "@/components/legal/confidentialite-content"

export const metadata: Metadata = {
  title: "Politique de confidentialité",
  description:
    "Politique de confidentialité de DetailFlow : données traitées, finalités, prestataires, durées de conservation et vos droits (LPD / RGPD).",
  alternates: { canonical: "/confidentialite" },
  robots: { index: false, follow: true },
}

export default function ConfidentialitePage() {
  return <ConfidentialiteContent />
}
