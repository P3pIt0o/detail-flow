/**
 * Layout des MAQUETTES CLEANYZER (Phase 1).
 *
 * ISOLÉ et TEMPORAIRE : ces routes servent uniquement à valider la direction
 * artistique et l'UX du futur site CLEANYZER. Elles n'utilisent PAS la
 * résolution de tenant, ne touchent NI la base de données, NI le dispatch
 * public (`app/(site)`), NI Spirit ACS / Rozan / JustClean, NI aucun autre
 * tenant. En Phase 2, le site sera branché via la clé « cleanyzer » (meta +
 * registry) ; ce dossier de preview pourra alors être retiré.
 *
 * Typographie (cahier §1) : serif éditoriale pour les grands titres + sans-serif
 * lisible pour l'UI. Chargées via next/font et exposées en variables CSS lues
 * par `.cleanyzer` (voir cleanyzer.css). robots: noindex (maquette).
 */

import type { ReactNode } from "react"
import type { Metadata } from "next"
import { Fraunces, Inter } from "next/font/google"
import { CleanyzerPreviewNav } from "@/components/custom-sites/cleanyzer/preview-nav"
import "@/components/custom-sites/cleanyzer/cleanyzer.css"

const display = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-clz-display",
  display: "swap",
})

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-clz-sans",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Maquette — CLEANYZER · Nettoyage auto & textile à domicile (Annecy)",
  description: "Aperçu de la nouvelle identité, de l'UX et du module de réservation du site CLEANYZER.",
  robots: { index: false, follow: false },
}

export default function CleanyzerPreviewLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${display.variable} ${sans.variable}`}>
      {children}
      <CleanyzerPreviewNav />
    </div>
  )
}
