import Link from "next/link"
import { Container, DetailFlowMark } from "./primitives"

const COLUMNS = [
  {
    title: "Produit",
    links: [
      { href: "#produit", label: "Vue d'ensemble" },
      { href: "#reservation", label: "Réservation" },
      { href: "#fonctionnalites", label: "Fonctionnalités" },
      { href: "#site", label: "Site internet" },
    ],
  },
  {
    title: "DetailFlow",
    links: [
      { href: "#tarifs", label: "Tarifs" },
      { href: "#faq", label: "FAQ" },
      { href: "mailto:contact@detailflow.fr", label: "Contact" },
    ],
  },
  {
    title: "Espace pro",
    links: [
      { href: "/admin/login", label: "Connexion" },
      { href: "/demarrer", label: "Créer mon espace" },
    ],
  },
]

/** Liens légaux publics (routes résolues via la réécriture marketing). */
const LEGAL_LINKS = [
  { href: "/mentions-legales", label: "Mentions légales" },
  { href: "/conditions", label: "Conditions générales" },
  { href: "/confidentialite", label: "Politique de confidentialité" },
  { href: "/cookies", label: "Cookies" },
]

export function SiteFooter() {
  return (
    <footer className="df-ink border-t border-border bg-background text-foreground">
      <Container className="grid gap-12 py-16 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
        <div className="flex flex-col gap-4">
          <Link href="/" className="flex w-fit items-center gap-2" aria-label="DetailFlow — accueil">
            <DetailFlowMark className="size-7" />
            <span className="text-[15px] font-semibold tracking-tight">DetailFlow</span>
          </Link>
          <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
            Le logiciel de gestion des professionnels du detailing automobile.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <p className="text-sm font-semibold">{col.title}</p>
            <ul className="mt-4 flex flex-col gap-2.5">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </Container>
      <Container className="flex flex-col gap-4 border-t border-border py-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} DetailFlow. Tous droits réservés.</p>
        <nav aria-label="Liens légaux">
          <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
            {LEGAL_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="transition-colors hover:text-foreground">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
    </footer>
  )
}
