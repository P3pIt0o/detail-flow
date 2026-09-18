"use client"

/**
 * Coquille du site CLEANYZER (maquettes Phase 1) : en-tête premium, menu mobile,
 * pied de page et CTA sticky mobile. Isolée sous `.cleanyzer` — aucun impact sur
 * les autres tenants. Deux univers explicitement séparés dans la nav (cahier §3) :
 * AUTOMOBILE → réservation guidée · TEXTILE → demande personnalisée.
 */

import { useState, type ReactNode } from "react"
import Link from "next/link"
import Image from "next/image"
import { Menu, X, ArrowRight } from "lucide-react"
import { BRAND } from "./content"
import { CLZ_PREVIEW_BASE, type ClzNavItem } from "./tokens"

const LOGO = "/custom-sites/cleanyzer/logo.png"

export function CleanyzerShell({
  children,
  navItems,
  active,
}: {
  children: ReactNode
  navItems: ClzNavItem[]
  /** libellé de la page courante (pour surbrillance éventuelle) */
  active?: string
}) {
  const [open, setOpen] = useState(false)
  const reserverHref = `${CLZ_PREVIEW_BASE}/reservation`
  const devisHref = `${CLZ_PREVIEW_BASE}/demande`

  return (
    <div className="cleanyzer min-h-dvh">
      {/* En-tête */}
      <header className="sticky top-0 z-50 border-b border-[var(--clz-line)] bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 md:h-20 md:px-6">
          <Link
            href={CLZ_PREVIEW_BASE}
            className="clz-display text-xl font-semibold tracking-tight text-[var(--clz-fg)] md:text-2xl"
            aria-label={`${BRAND.name} — accueil`}
          >
            CLEAN<span className="text-[var(--clz-blue)]">Y</span>ZER
          </Link>

          <nav className="hidden items-center gap-7 lg:flex" aria-label="Navigation principale">
            {navItems.map((item) => {
              const href = item.href ?? `${CLZ_PREVIEW_BASE}#${item.id}`
              const isActive = active === item.label
              return (
                <Link
                  key={item.id}
                  href={href}
                  className={`text-sm font-medium transition-colors hover:text-[var(--clz-blue)] ${
                    isActive ? "text-[var(--clz-blue)]" : "text-[var(--clz-fg)]"
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>

          <div className="hidden items-center gap-2 lg:flex">
            <Link href={devisHref} className="clz-btn clz-btn-ghost !px-4 !py-2 !text-sm">
              Demande personnalisée
            </Link>
            <Link href={reserverHref} className="clz-btn clz-btn-primary !px-4 !py-2 !text-sm">
              Réserver un nettoyage auto
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--clz-line)] text-[var(--clz-fg)] lg:hidden"
            aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Menu mobile */}
        {open && (
          <div className="border-t border-[var(--clz-line)] bg-white lg:hidden">
            <nav className="mx-auto flex max-w-6xl flex-col px-4 py-3" aria-label="Navigation mobile">
              {navItems.map((item) => {
                const href = item.href ?? `${CLZ_PREVIEW_BASE}#${item.id}`
                return (
                  <Link
                    key={item.id}
                    href={href}
                    onClick={() => setOpen(false)}
                    className="border-b border-[var(--clz-line)] py-3 text-base font-medium text-[var(--clz-fg)] last:border-0"
                  >
                    {item.label}
                  </Link>
                )
              })}
              <div className="mt-3 flex flex-col gap-2">
                <Link href={devisHref} onClick={() => setOpen(false)} className="clz-btn clz-btn-ghost">
                  Demande personnalisée
                </Link>
                <Link href={reserverHref} onClick={() => setOpen(false)} className="clz-btn clz-btn-primary">
                  Réserver un nettoyage auto
                </Link>
              </div>
            </nav>
          </div>
        )}
      </header>

      <main>{children}</main>

      <CleanyzerFooter navItems={navItems} />

      {/* CTA sticky mobile — grande zone tactile, toujours accessible (cahier §3). */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--clz-line)] bg-white/95 px-4 py-3 backdrop-blur-md lg:hidden">
        <div className="flex gap-2">
          <Link href={devisHref} className="clz-btn clz-btn-ghost flex-1 !py-3">
            Devis textile
          </Link>
          <Link href={reserverHref} className="clz-btn clz-btn-primary flex-[1.4] !py-3">
            Réserver
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
      {/* Espaceur pour ne pas masquer le contenu derrière le CTA sticky mobile. */}
      <div className="h-20 lg:hidden" aria-hidden />
    </div>
  )
}

function CleanyzerFooter({ navItems }: { navItems: ClzNavItem[] }) {
  return (
    <footer className="clz-dark relative overflow-hidden">
      <Image
        src={LOGO || "/placeholder.svg"}
        alt=""
        aria-hidden
        width={900}
        height={200}
        className="clz-watermark -right-20 bottom-0 w-[min(70%,720px)]"
      />
      <div className="relative mx-auto max-w-6xl px-4 py-14 md:px-6 md:py-20">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Image src={LOGO || "/placeholder.svg"} alt={BRAND.name} width={170} height={38} className="h-8 w-auto" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-[var(--clz-on-dark-muted)]">
              {BRAND.subtitle} {BRAND.area}. {BRAND.tagline}
            </p>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--clz-on-dark-muted)]">
              Navigation
            </h3>
            <ul className="mt-4 space-y-2 text-sm">
              {navItems.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href ?? `${CLZ_PREVIEW_BASE}#${item.id}`}
                    className="text-[var(--clz-on-dark)]/90 transition-colors hover:text-white"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--clz-on-dark-muted)]">
              Disponibilités
            </h3>
            <ul className="mt-4 space-y-2 text-sm text-[var(--clz-on-dark)]/90">
              <li>Lundi au dimanche</li>
              <li>7 h 30 à 20 h 30</li>
              <li>Service à domicile — {BRAND.area}</li>
              <li className="text-[var(--clz-on-dark-muted)]">Téléphone & e-mail : à confirmer</li>
            </ul>
          </div>
        </div>
        <div className="mt-12 flex flex-col gap-2 border-t border-[var(--clz-line-dark)] pt-6 text-xs text-[var(--clz-on-dark-muted)] md:flex-row md:items-center md:justify-between">
          <span>© {new Date().getFullYear()} {BRAND.name}. Tous droits réservés.</span>
          <span>Maquette de validation — Phase 1 (non indexée).</span>
        </div>
      </div>
    </footer>
  )
}
