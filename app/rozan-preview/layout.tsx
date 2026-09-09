/**
 * Layout des MAQUETTES Rozan (Phase 2).
 *
 * ISOLÉ et TEMPORAIRE : ces routes servent uniquement à valider la direction
 * artistique et l'UX du futur site Rozan. Elles n'utilisent PAS la résolution
 * de tenant, ne touchent NI la base de données, NI le dispatch public existant
 * (`app/(site)`), NI Spirit ACS, NI aucun autre tenant. En Phase 4, le site
 * Rozan sera branché proprement via la clé « rozan » (meta + registry) et le
 * contrat public par tenant ; ce dossier de preview pourra alors être retiré.
 */

import type { ReactNode } from "react"
import type { Metadata } from "next"
import { PreviewNav } from "@/components/custom-sites/rozan/preview-nav"

export const metadata: Metadata = {
  title: "Maquette — Rozan Cleaning Services",
  description: "Aperçu de la nouvelle identité et de l'UX du site Rozan Cleaning Services.",
  robots: { index: false, follow: false },
}

export default function RozanPreviewLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <PreviewNav />
    </>
  )
}
