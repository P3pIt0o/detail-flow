"use client"

/**
 * Navigation du site Spirit ACS.
 *
 * - Barre supérieure turquoise : localisation réelle du tenant (masquée si
 *   aucune adresse n'est renseignée — aucune donnée inventée).
 * - Barre principale blanche, fixe, avec logo réel, liens d'ancres et CTA
 *   « Réserver » vers la vraie route /reservation.
 * - Scroll-spy accessible (IntersectionObserver, pas d'écouteur de scroll
 *   coûteux) : la section visible est mise en évidence dans le menu.
 * - Menu mobile animé et accessible.
 *
 * Le contexte tenant (`?tenant=` en aperçu) est conservé sur les liens de
 * route via `withTenant` + `useSearchParams`, comme le reste du dépôt.
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useSearchParams } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { Menu, X, MapPin, Phone } from "lucide-react"
import { withTenant } from "@/lib/tenant-link"
import { toTelHref } from "@/lib/phone"
import type { SpiritNavItem } from "./tokens"

type SpiritNavigationProps = {
  brandName: string
  logoSrc: string | null
  items: SpiritNavItem[]
  /** Ancre in-page du CTA principal (ex. « #demande-devis »). */
  ctaHref: string
  ctaLabel: string
  /** Ville seule (jamais l'adresse postale exacte). */
  city: string | null
  phone: string | null
  phoneRaw: string | null
}

export function SpiritNavigation({
  brandName,
  logoSrc,
  items,
  ctaHref,
  ctaLabel,
  city,
  phone,
  phoneRaw,
}: SpiritNavigationProps) {
  const tenant = useSearchParams().get("tenant")
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<string | null>(items[0]?.id ?? null)

  // Bloque le scroll du body quand le menu mobile est ouvert.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : ""
    return () => {
      document.body.style.overflow = ""
    }
  }, [open])

  // Scroll-spy : met en évidence la section la plus visible.
  useEffect(() => {
    const targets = items
      .map((it) => document.getElementById(it.id))
      .filter((el): el is HTMLElement => el != null)
    if (targets.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (visible?.target?.id) setActive(visible.target.id)
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: [0, 0.25, 0.5, 1] },
    )
    targets.forEach((t) => observer.observe(t))
    return () => observer.disconnect()
  }, [items])

  // Le CTA principal cible une ANCRE in-page (« Demander un devis »), pas une
  // route. On conserve tout de même le tenant si jamais une route est passée.
  const cta = ctaHref.startsWith("#") ? ctaHref : withTenant(ctaHref, tenant)

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      {/* Barre supérieure turquoise — ville + téléphone réels uniquement
          (jamais l'adresse postale exacte). */}
      {(city || phone) && (
        <div className="bg-[var(--spirit-teal)] text-[color:var(--spirit-navy)]">
          <div className="mx-auto flex h-9 max-w-7xl flex-wrap items-center justify-center gap-x-6 gap-y-1 px-4 text-xs font-medium sm:px-6 lg:justify-start lg:px-8">
            {city && (
              <span className="flex items-center gap-1.5">
                <MapPin className="size-3.5" aria-hidden="true" />
                {city}
              </span>
            )}
            {phone && (
              <a href={toTelHref(phoneRaw ?? phone) ?? "#"} className="flex items-center gap-1.5 hover:underline">
                <Phone className="size-3.5" aria-hidden="true" />
                {phone}
              </a>
            )}
          </div>
        </div>
      )}

      {/* Barre principale blanche */}
      <div className="border-b border-black/5 bg-white shadow-sm">
        <nav
          className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8"
          aria-label="Navigation principale Spirit"
        >
          <Link href={withTenant("/", tenant)} className="flex items-center gap-2" aria-label={`${brandName} — accueil`}>
            {logoSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoSrc || "/placeholder.svg"}
                alt={brandName}
                className="h-12 w-auto max-w-[180px] object-contain sm:h-14"
              />
            ) : (
              <span className="spirit-title text-2xl text-[color:var(--spirit-ink)]">{brandName}</span>
            )}
          </Link>

          {/* Liens — bureau */}
          <ul className="hidden items-center gap-1 lg:flex">
            {items.map((it) => (
              <li key={it.id}>
                <a
                  href={`#${it.id}`}
                  aria-current={active === it.id ? "true" : undefined}
                  className={`relative rounded-md px-3 py-2 text-sm font-semibold uppercase tracking-wide transition-colors ${
                    active === it.id
                      ? "text-[color:var(--spirit-teal-strong)]"
                      : "text-[color:var(--spirit-ink)]/70 hover:text-[color:var(--spirit-ink)]"
                  }`}
                >
                  {it.label}
                  {active === it.id && (
                    <span className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-[var(--spirit-pink)]" />
                  )}
                </a>
              </li>
            ))}
          </ul>

          {/* CTA — bureau */}
          <div className="hidden lg:block">
            <a
              href={cta}
              className="inline-flex h-10 items-center justify-center rounded-sm bg-[var(--spirit-pink)] px-6 text-sm font-semibold uppercase tracking-wide text-white transition-colors hover:bg-[var(--spirit-pink-strong)]"
            >
              {ctaLabel}
            </a>
          </div>

          {/* Bouton menu — mobile */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex size-10 items-center justify-center rounded-md text-[color:var(--spirit-ink)] lg:hidden"
            aria-expanded={open}
            aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
          >
            {open ? <X className="size-6" /> : <Menu className="size-6" />}
          </button>
        </nav>

        {/* Menu mobile */}
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden border-t border-black/5 bg-white lg:hidden"
            >
              <ul className="flex flex-col gap-1 px-4 py-4">
                {items.map((it) => (
                  <li key={it.id}>
                    <a
                      href={`#${it.id}`}
                      onClick={() => setOpen(false)}
                      className="block rounded-lg px-4 py-3 text-base font-semibold uppercase tracking-wide text-[color:var(--spirit-ink)]/80 hover:bg-black/5 hover:text-[color:var(--spirit-ink)]"
                    >
                      {it.label}
                    </a>
                  </li>
                ))}
                <li className="mt-3">
                  <a
                    href={cta}
                    onClick={() => setOpen(false)}
                    className="inline-flex w-full items-center justify-center rounded-sm bg-[var(--spirit-pink)] px-6 py-3 text-sm font-semibold uppercase tracking-wide text-white"
                  >
                    {ctaLabel}
                  </a>
                </li>
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  )
}
