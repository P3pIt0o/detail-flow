import type { Metadata, Viewport } from "next"
import { MARKETING_MAINTENANCE_ENABLED } from "@/lib/marketing/maintenance"
import { SiteNav } from "@/components/marketing/v4/site-nav"
import { SiteFooter } from "@/components/marketing/v4/site-footer"

// `title.absolute` évite le gabarit "%s | DetailFlow" du root layout : la marque
// n'apparaît donc qu'UNE fois dans le <title> de la home marketing.
const marketingTitle = "DetailFlow — Logiciel de gestion et de réservation pour le detailing automobile"
const marketingDescription =
  "Site internet, réservation en ligne, planning, clients et véhicules, acomptes, facturation : DetailFlow réunit la gestion de votre centre de detailing dans une seule plateforme."

export const metadata: Metadata = {
  title: { absolute: marketingTitle },
  description: marketingDescription,
  keywords: [
    "logiciel detailing automobile",
    "logiciel detailing",
    "logiciel réservation detailing",
    "logiciel gestion detailing",
    "prise de rendez-vous detailing",
    "site internet detailing",
    "logiciel centre esthétique automobile",
    "logiciel lavage automobile",
    "logiciel gestion centre detailing",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "DetailFlow",
    locale: "fr_FR",
    title: marketingTitle,
    description: marketingDescription,
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "DetailFlow — logiciel de gestion pour detailing automobile" }],
  },
  twitter: {
    card: "summary_large_image",
    title: marketingTitle,
    description: marketingDescription,
    images: ["/og-image.png"],
  },
}

export function generateViewport(): Viewport {
  return MARKETING_MAINTENANCE_ENABLED ? {} : { themeColor: "#fbfcfe", colorScheme: "light" }
}

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  // MODE MAINTENANCE : on retire l'en-tête/pied de page marketing (dont la
  // navigation par ancres qui n'existent plus sur l'écran de maintenance).
  // L'écran de maintenance fournit sa propre mise en page complète.
  if (MARKETING_MAINTENANCE_ENABLED) {
    return <div className="min-h-screen bg-background text-foreground">{children}</div>
  }

  // `.df-mkt` : thème clair SCOPÉ à la vitrine (voir globals.css). Aucun tenant
  // ni espace admin ne porte cette classe.
  return (
    <div className="df-mkt min-h-screen bg-background font-sans text-foreground antialiased">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-foreground focus:px-4 focus:py-2 focus:text-sm focus:text-background"
      >
        Aller au contenu
      </a>
      <SiteNav />
      <main id="contenu">{children}</main>
      <SiteFooter />
    </div>
  )
}
