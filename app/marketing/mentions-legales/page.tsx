import type { Metadata } from "next"
import { MentionsLegalesContent } from "@/components/legal/mentions-legales-content"

export const metadata: Metadata = {
  title: "Mentions légales",
  description: "Mentions légales de DetailFlow : éditeur, hébergeur, gestion technique et informations légales.",
  alternates: { canonical: "/mentions-legales" },
  robots: { index: false, follow: true },
}

export default function MentionsLegalesPage() {
  return <MentionsLegalesContent />
}
