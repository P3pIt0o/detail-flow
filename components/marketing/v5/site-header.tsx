import Link from "next/link"
import { UI } from "./data"

const navLink = "text-[15px] font-medium text-[#33302b] no-underline hover:text-[#16181d]"

/** En-tête collant v5. Blog masqué tant que le blog n'existe pas. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-[#e2ddd2] bg-[rgba(247,245,240,.94)]">
      <div className={`${UI.wrap} flex h-16 items-center justify-between gap-4`}>
        <Link href="/" className="text-xl font-extrabold tracking-[-0.02em] text-[#16181d] no-underline">
          DetailFlow
        </Link>
        <nav className="flex gap-7 max-[720px]:hidden" aria-label="Navigation principale">
          <Link className={navLink} href="/#fonctions">
            Fonctionnalités
          </Link>
          <Link className={navLink} href="/#tarifs">
            Tarifs
          </Link>
          <Link className={navLink} href="/#faq">
            Questions
          </Link>
        </nav>
        <div className="flex items-center gap-4">
          <Link className={navLink} href="/admin/login">
            Connexion
          </Link>
          <Link className={`${UI.btn} ${UI.primary} min-h-10 px-4 text-[15px]`} href="/demarrer">
            Essayer gratuitement
          </Link>
        </div>
      </div>
    </header>
  )
}
