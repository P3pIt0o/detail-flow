"use client"

/**
 * En-tête Rozan — sticky, premium, comportement élégant au scroll.
 *
 * - Mode immersif (accueil) : transparent au-dessus du hero sombre, puis fond
 *   clair opaque + ombre légère dès que l'utilisateur défile.
 * - Mode non immersif (pages secondaires) : fond clair constant.
 * - Menu mobile en panneau plein écran, grandes zones tactiles.
 *
 * Aucun logo inventé : tant que le logo officiel n'est pas fourni, on affiche
 * le nom de la marque en toutes lettres (wordmark) avec un point d'accent.
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { Menu, X, Phone } from "lucide-react"
import type { RozanNavItem } from "./tokens"
import { ROZAN_BTN_PRIMARY } from "./tokens"

type RozanNavigationProps = {
  brandName: string
  navItems: RozanNavItem[]
  ctaHref: string
  ctaLabel: string
  phoneRaw: string | null
  /** Affichage humain du numéro (ex. « 07 87 95 77 52 »). */
  phoneLabel?: string | null
  immersive?: boolean
}

function Wordmark({ brandName, onDark }: { brandName: string; onDark: boolean }) {
  return (
    <span
      className={`rozan-title text-lg tracking-tight sm:text-xl ${onDark ? "text-white" : "text-[var(--rozan-fg)]"}`}
    >
      {brandName.split(" ")[0]}
      <span className="text-[var(--rozan-accent)]">.</span>
    </span>
  )
}

export function RozanNavigation({
  brandName,
  navItems,
  ctaHref,
  ctaLabel,
  phoneRaw,
  phoneLabel,
  immersive = false,
}: RozanNavigationProps) {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  // Verrouille le défilement de la page quand le menu mobile est ouvert.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : ""
    return () => {
      document.body.style.overflow = ""
    }
  }, [open])

  // Fond clair dès qu'on défile OU sur les pages non immersives.
  const solid = scrolled || !immersive
  const onDark = immersive && !scrolled

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        solid
          ? "border-b border-[color:var(--rozan-line)] bg-[color:var(--rozan-bg)]/90 backdrop-blur-md"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-[72px] w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:h-20 lg:px-8">
        <Link href="/" aria-label={brandName} className="flex items-center">
          <Wordmark brandName={brandName} onDark={onDark} />
        </Link>

        {/* Navigation bureau */}
        <nav className="hidden items-center gap-7 lg:flex" aria-label="Navigation principale">
          {navItems.map((item) =>
            item.route ? (
              <Link
                key={item.id}
                href={item.route}
                className={`text-sm font-medium transition-colors ${
                  onDark ? "text-white/85 hover:text-white" : "text-[var(--rozan-muted)] hover:text-[var(--rozan-fg)]"
                }`}
              >
                {item.label}
              </Link>
            ) : (
              <a
                key={item.id}
                href={`#${item.id}`}
                className={`text-sm font-medium transition-colors ${
                  onDark ? "text-white/85 hover:text-white" : "text-[var(--rozan-muted)] hover:text-[var(--rozan-fg)]"
                }`}
              >
                {item.label}
              </a>
            ),
          )}
        </nav>

        <div className="flex items-center gap-2">
          {phoneRaw && (
            <a
              href={`tel:${phoneRaw}`}
              aria-label="Appeler Rozan"
              className={`hidden size-11 items-center justify-center rounded-full border transition-colors sm:inline-flex lg:hidden xl:inline-flex ${
                onDark
                  ? "border-white/25 text-white hover:bg-white/10"
                  : "border-[color:var(--rozan-line)] text-[var(--rozan-fg)] hover:border-[var(--rozan-accent)] hover:text-[var(--rozan-accent)]"
              }`}
            >
              <Phone className="size-4" aria-hidden="true" />
            </a>
          )}

          <a href={ctaHref} className={`${ROZAN_BTN_PRIMARY} hidden h-11 px-5 lg:inline-flex`}>
            {ctaLabel}
          </a>

          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Ouvrir le menu"
            className={`inline-flex size-11 items-center justify-center rounded-full border transition-colors lg:hidden ${
              onDark
                ? "border-white/25 text-white hover:bg-white/10"
                : "border-[color:var(--rozan-line)] text-[var(--rozan-fg)] hover:border-[var(--rozan-accent)]"
            }`}
          >
            <Menu className="size-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Panneau mobile plein écran */}
      {open && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-[var(--rozan-bg)] lg:hidden">
          <div className="flex h-[72px] items-center justify-between px-4 sm:px-6">
            <Wordmark brandName={brandName} onDark={false} />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fermer le menu"
              className="inline-flex size-11 items-center justify-center rounded-full border border-[color:var(--rozan-line)] text-[var(--rozan-fg)]"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>

          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-4 py-4 sm:px-6" aria-label="Navigation mobile">
            {navItems.map((item) =>
              item.route ? (
                <Link
                  key={item.id}
                  href={item.route}
                  onClick={() => setOpen(false)}
                  className="rozan-title border-b border-[color:var(--rozan-line)] py-4 text-2xl text-[var(--rozan-fg)]"
                >
                  {item.label}
                </Link>
              ) : (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  onClick={() => setOpen(false)}
                  className="rozan-title border-b border-[color:var(--rozan-line)] py-4 text-2xl text-[var(--rozan-fg)]"
                >
                  {item.label}
                </a>
              ),
            )}
          </nav>

          <div className="flex flex-col gap-3 border-t border-[color:var(--rozan-line)] px-4 py-4 sm:px-6">
            {phoneRaw && (
              <a href={`tel:${phoneRaw}`} className="flex items-center justify-center gap-2 text-sm font-medium text-[var(--rozan-muted)]">
                <Phone className="size-4" aria-hidden="true" />
                {phoneLabel ?? phoneRaw}
              </a>
            )}
            <a href={ctaHref} onClick={() => setOpen(false)} className={`${ROZAN_BTN_PRIMARY} w-full`}>
              {ctaLabel}
            </a>
          </div>
        </div>
      )}
    </header>
  )
}
