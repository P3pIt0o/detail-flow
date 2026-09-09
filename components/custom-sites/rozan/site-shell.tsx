/**
 * Coquille (shell) du site personnalisé Rozan Cleaning Services.
 *
 * `ownShell = true` (Phase 4) : ce composant fournit la navigation, le pied de
 * page et le CTA sticky PROPRES à Rozan. Il applique le SCOPE de marque `.rozan`
 * (palette claire + sections sombres + accent, typographie Sora) et charge la
 * police d'affichage sans jamais toucher au thème global ni aux autres tenants.
 */

import type { ReactNode } from "react"
import { Sora } from "next/font/google"
import { RozanNavigation } from "./rozan-navigation"
import { RozanFooter } from "./rozan-footer"
import { RozanStickyCta } from "./rozan-sticky-cta"
import type { RozanNavItem } from "./tokens"
import "./rozan.css"

// Police d'affichage premium (géométrique moderne), exposée via une variable
// CSS scopée au conteneur Rozan uniquement.
const rozanDisplay = Sora({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-rozan-display",
  display: "swap",
})

type RozanSiteShellProps = {
  children: ReactNode
  brandName: string
  navItems: RozanNavItem[]
  ctaHref: string
  ctaLabel: string
  phoneRaw: string | null
  /** Affichage humain du numéro (ex. « 07 87 95 77 52 »). */
  phoneLabel?: string | null
  /** Sticky CTA mobile (cible + libellé). */
  stickyCtaHref: string
  stickyCtaLabel: string
  /**
   * `true` : l'en-tête se superpose au hero sombre (transparent → clair au
   * scroll), sans réserver de bande. `false` (défaut) : en-tête clair constant
   * + décalage sous l'en-tête pour les pages sans hero immersif.
   */
  immersive?: boolean
}

export function RozanSiteShell({
  children,
  brandName,
  navItems,
  ctaHref,
  ctaLabel,
  phoneRaw,
  phoneLabel,
  stickyCtaHref,
  stickyCtaLabel,
  immersive = false,
}: RozanSiteShellProps) {
  return (
    <div className={`rozan ${rozanDisplay.variable} min-h-screen overflow-x-clip font-sans`}>
      <RozanNavigation
        brandName={brandName}
        navItems={navItems}
        ctaHref={ctaHref}
        ctaLabel={ctaLabel}
        phoneRaw={phoneRaw}
        phoneLabel={phoneLabel}
        immersive={immersive}
      />

      <div className={immersive ? "" : "pt-[72px] lg:pt-20"}>{children}</div>

      <RozanFooter />

      <RozanStickyCta href={stickyCtaHref} label={stickyCtaLabel} />
    </div>
  )
}
