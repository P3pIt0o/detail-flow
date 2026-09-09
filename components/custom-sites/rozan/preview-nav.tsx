"use client"

/**
 * Navigateur de MAQUETTES (Phase 2 uniquement) — permet de sauter entre les
 * différentes pages du mockup Rozan. Ce n'est PAS un élément du site final :
 * il vit uniquement sous /rozan-preview pour faciliter la validation.
 */

import Link from "next/link"
import { usePathname } from "next/navigation"

const LINKS = [
  { href: "/rozan-preview", label: "Accueil" },
  { href: "/rozan-preview/prestation", label: "Prestation" },
  { href: "/rozan-preview/zone", label: "Page locale" },
  { href: "/rozan-preview/devis", label: "Réservation" },
]

export function PreviewNav() {
  const pathname = usePathname()
  return (
    <div className="fixed bottom-4 left-4 z-[70] hidden lg:block">
      <div className="flex items-center gap-1 rounded-full border border-black/10 bg-white/90 p-1 shadow-lg backdrop-blur">
        <span className="px-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Maquette</span>
        {LINKS.map((l) => {
          const active = pathname === l.href
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                active ? "bg-[#0d5fd1] text-white" : "text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              {l.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
