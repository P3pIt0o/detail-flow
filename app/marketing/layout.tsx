import type { Metadata } from "next"
import Link from "next/link"
import { marketing } from "@/config/marketing"

export const metadata: Metadata = {
  title: "DetailFlow — Le logiciel des professionnels du detailing",
  description:
    "DetailFlow réunit réservation en ligne, devis, facturation et gestion clients pour les entreprises de detailing automobile. Rejoignez le programme Beta.",
  alternates: { canonical: "/" },
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
          <nav className="flex items-center gap-6">
            <Link href="/cgv" className="transition-colors hover:text-foreground">
              CGV
            </Link>
            <Link href="/mentions-legales" className="transition-colors hover:text-foreground">
              Mentions légales
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
