"use client"

/**
 * Navigateur de MAQUETTES CLEANYZER (Phase 1 uniquement) — saute entre les
 * écrans du mockup pour faciliter la validation. Ce n'est PAS un élément du
 * site final : il vit uniquement sous /cleanyzer-preview.
 */

import Link from "next/link"
import { usePathname } from "next/navigation"

const LINKS = [
  { href: "/cleanyzer-preview", label: "Accueil" },
  { href: "/cleanyzer-preview/prestations/interieur", label: "Intérieur" },
  { href: "/cleanyzer-preview/prestations/exterieur", label: "Extérieur" },
  { href: "/cleanyzer-preview/prestations/textile", label: "Textile" },
  { href: "/cleanyzer-preview/tarifs", label: "Tarifs" },
  { href: "/cleanyzer-preview/reservation", label: "Réservation" },
  { href: "/cleanyzer-preview/demande", label: "Devis textile" },
  { href: "/cleanyzer-preview/realisations", label: "Réalisations" },
  { href: "/cleanyzer-preview/a-propos", label: "À propos" },
  { href: "/cleanyzer-preview/faq", label: "FAQ" },
  { href: "/cleanyzer-preview/zones/annecy", label: "SEO local" },
]

export function CleanyzerPreviewNav() {
  const pathname = usePathname()
  return (
    <div className="fixed bottom-4 left-1/2 z-[70] hidden -translate-x-1/2 lg:block">
      <div className="flex max-w-[92vw] flex-wrap items-center gap-1 rounded-full border border-black/10 bg-white/90 p-1 shadow-lg backdrop-blur">
        <span className="px-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Maquette</span>
        {LINKS.map((l) => {
          const active = pathname === l.href
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                active ? "bg-[#0a84ff] text-white" : "text-neutral-600 hover:bg-neutral-100"
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
