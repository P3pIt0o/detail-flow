"use client"

/**
 * CTA sticky discret « Obtenir mon devis » (mobile uniquement).
 *
 * Apparaît après un léger défilement pour ne pas gêner le hero, se masque à
 * l'approche du pied de page. Grande zone tactile, contraste fort, respecte les
 * marges de sécurité iOS (safe-area). Masqué sur bureau (le CTA vit dans l'en-tête).
 */

import { useEffect, useState } from "react"
import { ArrowRight } from "lucide-react"

export function RozanStickyCta({ href, label }: { href: string; label: string }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      const nearBottom = window.innerHeight + y >= document.body.scrollHeight - 320
      setVisible(y > 480 && !nearBottom)
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 transition-all duration-300 lg:hidden ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0"
      }`}
    >
      <a
        href={href}
        className="flex h-13 w-full items-center justify-center gap-2 rounded-full bg-[var(--rozan-accent)] text-sm font-semibold text-white shadow-[0_10px_30px_-8px_rgba(13,95,209,0.7)] transition-colors hover:bg-[var(--rozan-accent-strong)]"
      >
        {label}
        <ArrowRight className="size-4" aria-hidden="true" />
      </a>
    </div>
  )
}
