import type { Metadata } from "next"
import { CookiesContent } from "@/components/legal/cookies-content"

export const metadata: Metadata = {
  title: "Cookies",
  description:
    "Politique relative aux cookies et autres traceurs de DetailFlow : cookies strictement nécessaires, mesure d'audience sans cookie et stockage local.",
  alternates: { canonical: "/cookies" },
  robots: { index: false, follow: true },
}

export default function CookiesPage() {
  return <CookiesContent />
}
