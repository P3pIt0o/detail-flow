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
import { WhatsAppButton } from "@/components/layout/whatsapp-button"
import type { SpiritNavItem } from "./tokens"
import "./spirit.css"

/** Message WhatsApp pré-rempli propre à Spirit (univers detailing / prestations). */
const SPIRIT_WHATSAPP_MESSAGE = "Bonjour, je souhaite obtenir des renseignements sur vos prestations."

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
  /** Ville seule (Spirit n'expose jamais l'adresse postale exacte). */
  city: string | null
  footerTagline: string | null
  /**
   * L'accueil possède un hero photographique : l'en-tête s'y superpose
   * (transparent en haut → bleu nuit au scroll) sans réserver de bande au-dessus.
   * `false` (défaut) : en-tête bleu nuit constant + décalage sous l'en-tête,
   * pour les pages Spirit sans hero photo.
   */
  immersive?: boolean
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
  city,
  footerTagline,
  immersive = false,
}: SpiritSiteShellProps) {
  return (
    <div className={`spirit-acs ${spiritDisplay.variable} min-h-screen overflow-x-clip font-sans`}>
      <SpiritNavigation
        brandName={brandName}
        logoSrc={logoSrc}
        items={navItems}
        ctaHref={ctaHref}
        ctaLabel={ctaLabel}
        phone={phone}
        phoneRaw={phoneRaw}
        immersive={immersive}
      />

      {/* Mode immersif : la photo du hero démarre EN HAUT, derrière l'en-tête
          fixe (aucune bande réservée). Le hero gère lui-même son espacement
          interne pour ne jamais passer sous l'en-tête.
          Mode non immersif : décalage égal à la hauteur de l'en-tête bleu nuit
          (72 px mobile / 80 px bureau) pour ne pas masquer le contenu. */}
      <div className={immersive ? "" : "pt-[72px] lg:pt-20"}>{children}</div>

      <SpiritFooter
        brandName={brandName}
        logoSrc={logoSrc}
        phone={phone}
        phoneRaw={phoneRaw}
        email={email}
        city={city}
        tagline={footerTagline}
      />

      {/* Bouton WhatsApp partagé : numéro RÉEL du tenant (phoneRaw), normalisé
          par le helper commun, masqué automatiquement si aucun numéro valide.
          Message pré-rempli propre à l'univers Spirit. Rendu bas-droite,
          au-dessus du contenu (z-40), sans chevaucher les futurs widgets. */}
      <WhatsAppButton phone={phoneRaw} message={SPIRIT_WHATSAPP_MESSAGE} />
    </div>
  )
}
