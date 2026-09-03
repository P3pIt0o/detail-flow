"use client"

/**
 * Navigation du site Spirit ACS — en-tête IMMERSIF superposé à la photo.
 *
 * - Mode `immersive` (accueil, hero photographique) : fond TRANSPARENT en haut
 *   avec un voile sombre discret pour la lisibilité, puis fond bleu nuit opaque
 *   (#06131c) au défilement (~70 px). Seuls le fond et l'ombre changent — aucun
 *   saut de mise en page, hauteur stable.
 * - Mode non immersif (pages sans hero photo) : fond bleu nuit constant.
 * - En-tête TOUJOURS visible (plus d'escamotage au scroll).
 * - Texte, logo et icônes en blanc dans les deux états (fond sombre / photo).
 * - Scroll-spy accessible (IntersectionObserver, pas d'écouteur coûteux).
 * - Menu mobile bleu nuit : verrouillage du scroll, fermeture au clic/Échap,
 *   focus géré, navigation clavier.
 * - `prefers-reduced-motion` respecté (transitions neutralisées via la CSS).
 *
 * Le contexte tenant (`?tenant=` en aperçu) est conservé sur les liens de
 * route via `withTenant` + `useSearchParams`, comme le reste du dépôt.
 */

import { useEffect, useRef, useState, type MouseEvent } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { Menu, X, Phone } from "lucide-react"
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
  phone: string | null
  phoneRaw: string | null
  /**
   * Superposition à un hero photographique : transparent en haut → bleu nuit
   * au scroll. `false` (défaut) = bleu nuit constant (pages sans hero photo).
   */
  immersive?: boolean
}

export function SpiritNavigation({
  brandName,
  logoSrc,
  items,
  ctaHref,
  ctaLabel,
  phone,
  phoneRaw,
  immersive = false,
}: SpiritNavigationProps) {
  const tenant = useSearchParams().get("tenant")
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<string | null>(items[0]?.id ?? null)
  // `scrolled` : l'en-tête a quitté le haut de page → fond bleu nuit opaque.
  const [scrolled, setScrolled] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Fond opaque dès qu'on quitte le haut de page (seuil 70 px). Écouteur passif
  // + requestAnimationFrame : aucun coût de rendu au défilement.
  useEffect(() => {
    let ticking = false
    const update = () => {
      ticking = false
      setScrolled(window.scrollY > 70)
    }
    const onScroll = () => {
      if (!ticking) {
        ticking = true
        requestAnimationFrame(update)
      }
    }
    update()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  // Bloque le scroll du body quand le menu mobile est ouvert.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : ""
    return () => {
      document.body.style.overflow = ""
    }
  }, [open])

  // Accessibilité menu mobile : fermeture avec Échap + gestion du focus.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    // Place le focus dans le panneau ouvert (premier lien).
    const firstLink = panelRef.current?.querySelector<HTMLElement>("a")
    firstLink?.focus()
    return () => {
      document.removeEventListener("keydown", onKey)
      // Rend le focus au bouton déclencheur à la fermeture.
    toggleRef.current?.focus({ preventScroll: true })
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
  const telHref = toTelHref(phoneRaw ?? phone)

  // Défilement in-page ROBUSTE (bureau + mobile). Cause du bug : quand le menu
  // mobile est ouvert, le body porte `overflow:hidden` et le panneau s'anime en
  // sortie (AnimatePresence) — le saut d'ancre NATIF est alors annulé/clampé et
  // le lien paraît « mort ». On ferme donc le menu, on LÈVE LE VERROU de scroll
  // de façon synchrone, puis on défile nous-mêmes vers la cible (l'offset de
  // l'en-tête fixe reste géré par `scroll-margin-top` en CSS). On ne touche
  // qu'au hash : le contexte tenant (`?tenant=`) est intégralement conservé.
  const handleAnchorClick = (e: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (!href.startsWith("#")) return // lien de route : comportement standard
    const target = document.getElementById(href.slice(1))
    if (!target) return // aucune cible : on laisse le navigateur décider
    e.preventDefault()
    setOpen(false)
    document.body.style.overflow = "" // lève immédiatement le verrou du menu
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" })
    history.replaceState(null, "", href) // met à jour le hash sans saut brut
  }

  // Fond opaque si l'en-tête n'est pas immersif OU si l'on a défilé.
  const solid = !immersive || scrolled

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div
        className={`relative transition-[background-color,box-shadow] duration-200 ease-out motion-reduce:transition-none ${
          solid
            ? "bg-[var(--spirit-navy)]/95 shadow-[0_8px_30px_-16px_rgba(0,0,0,0.7)] backdrop-blur-sm"
            : "bg-transparent"
        }`}
      >
        {/* Voile sombre discret en haut de page (mode immersif, non défilé) :
            garantit la lisibilité du logo/menu sur la photo claire. */}
        {!solid && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-24 bg-gradient-to-b from-black/45 to-transparent"
          />
        )}

        <nav
          className="relative mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:h-20 lg:px-8"
          aria-label="Navigation principale Spirit"
        >
          <Link href={withTenant("/", tenant)} className="flex items-center" aria-label={`${brandName} — accueil`}>
            {logoSrc ? (
              // Logo officiel Spirit à canal alpha réel (voiture rose + texte
              // blanc) : lisible sur fond sombre sans filtre ni cartouche.
              // `object-contain`, hauteur fixe, jamais déformé.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoSrc || "/placeholder.svg"}
                alt={brandName}
                className="h-11 w-auto max-w-[160px] object-contain lg:h-14"
              />
            ) : (
              <span className="spirit-title text-2xl text-white">{brandName}</span>
            )}
          </Link>

          {/* Liens — bureau */}
          <ul className="hidden items-center gap-1 lg:flex">
            {items.map((it) => {
              const baseClass = `relative rounded-md px-3 py-2 text-sm font-semibold uppercase tracking-wide transition-colors ${
                active === it.id ? "text-[color:var(--spirit-teal)]" : "text-white/80 hover:text-white"
              }`
              // Élément de ROUTE (ex. Contact → « /contact ») : navigation Next
              // standard, page ouverte en haut, tenant conservé via withTenant.
              if (it.route) {
                return (
                  <li key={it.id}>
                    <Link href={withTenant(it.route, tenant)} className={baseClass}>
                      {it.label}
                    </Link>
                  </li>
                )
              }
              return (
                <li key={it.id}>
                  <a
                    href={`#${it.id}`}
                    onClick={(e) => handleAnchorClick(e, `#${it.id}`)}
                    aria-current={active === it.id ? "true" : undefined}
                    className={baseClass}
                  >
                    {it.label}
                    {active === it.id && (
                      <span className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-[var(--spirit-pink)]" />
                    )}
                  </a>
                </li>
              )
            })}
          </ul>

          {/* CTA — bureau */}
          <div className="hidden lg:block">
            <a
              href={cta}
              onClick={(e) => handleAnchorClick(e, cta)}
              className="inline-flex h-10 items-center justify-center rounded-sm bg-[var(--spirit-pink)] px-6 text-sm font-semibold uppercase tracking-wide text-white transition-colors hover:bg-[var(--spirit-pink-strong)]"
            >
              {ctaLabel}
            </a>
          </div>

          {/* Actions — mobile : téléphone (si dispo) + bouton menu, blancs,
              zones tactiles ≥ 44×44 px. */}
          <div className="flex items-center gap-1 lg:hidden">
            {telHref && (
              <a
                href={telHref}
                className="flex size-11 items-center justify-center rounded-md text-white"
                aria-label={`Appeler ${brandName}`}
              >
                <Phone className="size-5" aria-hidden="true" />
              </a>
            )}
            <button
              ref={toggleRef}
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="flex size-11 items-center justify-center rounded-md text-white"
              aria-expanded={open}
              aria-controls="spirit-mobile-menu"
              aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
            >
              {open ? <X className="size-6" /> : <Menu className="size-6" />}
            </button>
          </div>
        </nav>

        {/* Menu mobile — panneau bleu nuit */}
        <AnimatePresence>
          {open && (
            <motion.div
              ref={panelRef}
              id="spirit-mobile-menu"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden border-t border-white/10 bg-[var(--spirit-navy)] lg:hidden"
            >
              <ul className="flex flex-col gap-1 px-4 py-4">
                {items.map((it) => {
                  const mobileClass =
                    "block rounded-lg px-4 py-3 text-base font-semibold uppercase tracking-wide text-white/85 hover:bg-white/5 hover:text-white"
                  // Élément de ROUTE : lien Next standard, on ferme le menu au clic.
                  if (it.route) {
                    return (
                      <li key={it.id}>
                        <Link href={withTenant(it.route, tenant)} onClick={() => setOpen(false)} className={mobileClass}>
                          {it.label}
                        </Link>
                      </li>
                    )
                  }
                  return (
                    <li key={it.id}>
                      <a
                        href={`#${it.id}`}
                        onClick={(e) => handleAnchorClick(e, `#${it.id}`)}
                        className={mobileClass}
                      >
                        {it.label}
                      </a>
                    </li>
                  )
                })}
                <li className="mt-3">
                  <a
                    href={cta}
                    onClick={(e) => handleAnchorClick(e, cta)}
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
