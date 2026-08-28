/**
 * Coquille (shell) du site personnalisé Spirit ACS.
 *
 * `ownShell = true` dans le registre : ce composant fournit la navigation et le
 * pied de page PROPRES à Spirit (le dispatch public n'ajoute donc pas la Navbar
 * / le Footer standard). Il applique aussi le SCOPE de marque `.spirit-acs`
 * (palette + typographie isolées) et charge la police d'affichage Oswald,
 * sans jamais toucher au thème global ni aux autres tenants.
 */

import type { ReactNode } from "react"
import { Oswald } from "next/font/google"
import { SpiritNavigation } from "./spirit-navigation"
import { SpiritFooter } from "./spirit-footer"
import type { SpiritNavItem } from "./tokens"
import "./spirit.css"

// Police d'affichage condensée (univers automobile premium), exposée via une
// variable CSS scopée au conteneur Spirit uniquement.
const spiritDisplay = Oswald({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-spirit-display",
  display: "swap",
})

type SpiritSiteShellProps = {
  children: ReactNode
  brandName: string
  logoSrc: string | null
  navItems: SpiritNavItem[]
  ctaHref: string
  ctaLabel: string
  phone: string | null
  phoneRaw: string | null
  email: string | null
  address: string | null
  footerTagline: string | null
}

export function SpiritSiteShell({
  children,
  brandName,
  logoSrc,
  navItems,
  ctaHref,
  ctaLabel,
  phone,
  phoneRaw,
  email,
  address,
  footerTagline,
}: SpiritSiteShellProps) {
  return (
    <div className={`spirit-acs ${spiritDisplay.variable} min-h-screen font-sans`}>
      <SpiritNavigation
        brandName={brandName}
        logoSrc={logoSrc}
        items={navItems}
        ctaHref={ctaHref}
        ctaLabel={ctaLabel}
        address={address}
        phone={phone}
        phoneRaw={phoneRaw}
      />

      {/* Décalage sous l'en-tête fixe (barre turquoise + barre principale). */}
      <div className="pt-16">{children}</div>

      <SpiritFooter
        brandName={brandName}
        logoSrc={logoSrc}
        phone={phone}
        phoneRaw={phoneRaw}
        email={email}
        address={address}
        tagline={footerTagline}
      />
    </div>
  )
}
