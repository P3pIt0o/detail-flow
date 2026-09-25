"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Menu, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { DetailFlowMark } from "./primitives"

export const MARKETING_NAV = [
  { href: "#produit", label: "Produit" },
  { href: "#reservation", label: "Réservation" },
  { href: "#fonctionnalites", label: "Fonctionnalités" },
  { href: "#tarifs", label: "Tarifs" },
  { href: "#faq", label: "FAQ" },
]

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [open])

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 px-3 pt-3">
      <div
        className={cn(
          "pointer-events-auto mx-auto flex h-14 max-w-6xl items-center justify-between rounded-full border px-3 pl-4 transition-[background-color,border-color,box-shadow] duration-300",
          scrolled || open
            ? "border-border bg-background/80 shadow-[0_8px_30px_-12px_oklch(0.2_0.03_262/0.18)] backdrop-blur-xl"
            : "border-transparent bg-transparent",
        )}
      >
        <Link
          href="/"
          className="flex items-center gap-2 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="DetailFlow — accueil"
        >
          <DetailFlowMark className="size-7" />
          <span className="text-[15px] font-semibold tracking-tight text-foreground">DetailFlow</span>
        </Link>

        <nav aria-label="Navigation principale" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {MARKETING_NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="rounded-full px-3.5 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-1.5">
          <Link
            href="/admin/login"
            className="hidden rounded-full px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex"
          >
            Connexion
          </Link>
          <Link
            href="/demarrer"
            className="hidden h-9 items-center rounded-full bg-foreground px-4 text-sm font-semibold text-background transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:inline-flex"
          >
            Créer mon espace
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
            className="inline-flex size-10 items-center justify-center rounded-full text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
          >
            {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {open && (
        <div
          id="mobile-menu"
          className="pointer-events-auto mx-auto mt-2 max-w-6xl rounded-3xl border border-border bg-background/95 p-3 shadow-xl backdrop-blur-xl md:hidden"
        >
          <nav aria-label="Navigation mobile">
            <ul className="flex flex-col">
              {MARKETING_NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="flex h-12 items-center rounded-2xl px-4 text-base font-medium text-foreground hover:bg-muted"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border pt-3">
            <Link
              href="/admin/login"
              className="flex h-12 items-center justify-center rounded-full border border-border text-sm font-semibold text-foreground"
            >
              Connexion
            </Link>
            <Link
              href="/demarrer"
              className="flex h-12 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background"
            >
              Créer mon espace
            </Link>
          </div>
        </div>
      )}
    </header>
  )
}
