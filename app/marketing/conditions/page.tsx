import type { Metadata } from "next"
import { ConditionsContent } from "@/components/legal/conditions-content"

export const metadata: Metadata = {
  title: "Conditions générales",
  description:
    "Conditions générales d'utilisation et de vente de la plateforme DetailFlow pour les professionnels du detailing.",
  alternates: { canonical: "/conditions" },
  robots: { index: false, follow: true },
}

export default function ConditionsPage() {
  return <ConditionsContent />
}
