import type { Metadata } from "next"
import Link from "next/link"
import { marketing } from "@/config/marketing"

// `title.absolute` évite le gabarit "%s | DetailFlow" du root layout : la marque
// n'apparaît donc qu'UNE fois dans le <title> de la home marketing.
const marketingTitle = "Logiciel de detailing tout-en-un pour les professionnels | DetailFlow"
const marketingDescription =
  "Gérez votre activité de detailing avec DetailFlow : site professionnel, réservations, planning, clients et véhicules, devis, factures et rappels automatiques."

export const metadata: Metadata = {
  title: { absolute: marketingTitle },
  description: marketingDescription,
  keywords: [
    "logiciel detailing",
    "logiciel detailer",
    "CRM detailing",
    "gestion entreprise detailing",
    "réservation detailing",
    "devis facturation detailing",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    title: marketingTitle,
    description: marketingDescription,
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "DetailFlow — logiciel de gestion pour le detailing" }],
  },
  twitter: {
    card: "summary_large_image",
    title: marketingTitle,
    description: marketingDescription,
    images: ["/og-image.png"],
  },
}

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* En-tête léger, sticky, translucide */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="text-lg font-bold tracking-tight text-foreground">
            {marketing.brand.name}
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            <Link href="#features" className="hidden text-muted-foreground transition-colors hover:text-foreground sm:block">
              Fonctionnalités
            </Link>
            <Link href="#workflow" className="hidden text-muted-foreground transition-colors hover:text-foreground md:block">
              Comment ça marche
            </Link>
            <Link href="#faq" className="hidden text-muted-foreground transition-colors hover:text-foreground sm:block">
              FAQ
            </Link>
            <Link
              href="#beta"
              className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110"
            >
              Rejoindre la Beta
            </Link>
          </nav>
        </div>
      </header>

      <main>{children}</main>

      {/* Pied de page minimal */}
      <footer className="border-t border-border/60 py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 text-sm text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
          <p>© {new Date().getFullYear()} DetailFlow. Tous droits réservés.</p>
          {/* Liens légaux marketing volontairement retirés : les pages /conditions
              et /mentions-legales appartiennent au groupe tenant (site) et
              renvoyaient un contenu inadapté / 404 sur le domaine marketing.
              À rebrancher lorsque de vraies pages légales marketing existeront. */}
        </div>
      </footer>
    </div>
  )
}
