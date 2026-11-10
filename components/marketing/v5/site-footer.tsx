import Link from "next/link"
import { UI } from "./data"

const CONTACT = "mailto:contact@detailflow.fr"

const LEGAL_LINKS = [
  { href: "/mentions-legales", label: "Mentions légales" },
  { href: "/conditions", label: "CGV" },
  { href: "/confidentialite", label: "Confidentialité" },
  { href: "/cookies", label: "Cookies" },
]

/** Pied v5. Site vitrine : SANS prix dans ce lot (L43). */
export function SiteFooter() {
  return (
    <footer className="border-t border-[#e2ddd2] py-7">
      <div className={`${UI.wrap} flex flex-wrap justify-between gap-3 text-sm ${UI.muted}`}>
        <span>
          © DetailFlow · Besoin d&apos;un site vitrine ?{" "}
          <a href={CONTACT} className={UI.link}>
            Nous le créons pour vous
          </a>
        </span>
        <span className="flex flex-wrap gap-[18px]">
          {LEGAL_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={UI.link}>
              {l.label}
            </Link>
          ))}
          <a href={CONTACT} className={UI.link}>
            Contact
          </a>
        </span>
      </div>
    </footer>
  )
}
