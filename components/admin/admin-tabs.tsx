"use client"

import { useCallback, useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react"

import { TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

/**
 * L113 — barres d'onglets de l'admin : une seule ligne, jamais de retour à la ligne.
 * Si les onglets ne tiennent pas, on glisse au doigt ; un fondu sur le bord signale ce qui
 * dépasse, et l'onglet actif est ramené en vue (ouverture, recherche, changement d'onglet).
 */

const FADE_PX = 28
/** Onglet actif reconnu quel que soit le type de barre (Base UI, boutons role=tab, liens). */
const ACTIVE_SELECTOR = '[aria-selected="true"], [aria-current="page"]'

export type Fade = { left: boolean; right: boolean }

/** Bords à estomper selon la position de défilement (tolérance d'1 px pour les arrondis). */
export function fadeEdges(v: { scrollLeft: number; scrollWidth: number; clientWidth: number }): Fade {
  return {
    left: v.scrollLeft > 1,
    right: v.scrollLeft + v.clientWidth < v.scrollWidth - 1,
  }
}

/** Masque CSS du fondu ; `undefined` quand tout est visible. */
export function fadeMask(f: Fade): string | undefined {
  if (f.left && f.right)
    return `linear-gradient(90deg, transparent, #000 ${FADE_PX}px, #000 calc(100% - ${FADE_PX}px), transparent)`
  if (f.right) return `linear-gradient(90deg, #000 calc(100% - ${FADE_PX}px), transparent)`
  if (f.left) return `linear-gradient(90deg, transparent, #000 ${FADE_PX}px)`
  return undefined
}

/**
 * Position de défilement qui montre l'onglet actif (avec une marge égale au fondu),
 * ou `null` s'il est déjà entièrement visible. `item.left` est relatif au contenu défilant.
 */
export function scrollTargetFor(
  view: { scrollLeft: number; clientWidth: number },
  item: { left: number; width: number },
  margin = FADE_PX,
): number | null {
  if (item.left - margin < view.scrollLeft) return Math.max(0, item.left - margin)
  if (item.left + item.width + margin > view.scrollLeft + view.clientWidth)
    return item.left + item.width + margin - view.clientWidth
  return null
}

export function TabScroller({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [fade, setFade] = useState<Fade>({ left: false, right: false })

  const update = useCallback(() => {
    const el = ref.current
    if (!el) return
    const next = fadeEdges(el)
    setFade((prev) => (prev.left === next.left && prev.right === next.right ? prev : next))
  }, [])

  const lastActive = useRef<HTMLElement | null>(null)

  const revealActive = useCallback((smooth: boolean) => {
    const el = ref.current
    const active = el?.querySelector<HTMLElement>(ACTIVE_SELECTOR) ?? null
    // Ne défile que si l'onglet actif a vraiment changé (un simple re-rendu ne doit pas
    // contrarier un glissement du doigt en cours).
    if (smooth && active === lastActive.current) return
    lastActive.current = active
    if (!el || !active) return
    const box = el.getBoundingClientRect()
    const r = active.getBoundingClientRect()
    const target = scrollTargetFor(el, { left: r.left - box.left + el.scrollLeft, width: r.width })
    if (target !== null) el.scrollTo({ left: target, behavior: smooth ? "smooth" : "auto" })
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    revealActive(false)
    update()
    el.addEventListener("scroll", update, { passive: true })
    const resize = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null
    resize?.observe(el)
    if (el.firstElementChild) resize?.observe(el.firstElementChild)
    const mutations = new MutationObserver(() => revealActive(true))
    mutations.observe(el, { subtree: true, attributes: true, attributeFilter: ["aria-selected", "aria-current"] })
    return () => {
      el.removeEventListener("scroll", update)
      resize?.disconnect()
      mutations.disconnect()
    }
  }, [update, revealActive])

  const mask = fadeMask(fade)
  return (
    <div
      ref={ref}
      data-slot="tab-scroller"
      className={cn(
        // -my-1 py-1 : laisse la place à l'anneau de focus et à l'ombre sans changer la mise en page.
        "-my-1 max-w-full overflow-x-auto overflow-y-hidden py-1 overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
    >
      {children}
    </div>
  )
}

export function AdminTabsList({ className, ...props }: ComponentProps<typeof TabsList>) {
  return (
    <TabScroller>
      <TabsList
        className={cn(
          "flex w-max min-w-full flex-nowrap justify-start gap-0.5 group-data-horizontal/tabs:h-auto sm:min-w-0",
          className,
        )}
        {...props}
      />
    </TabScroller>
  )
}

export function AdminTabsTrigger({ className, ...props }: ComponentProps<typeof TabsTrigger>) {
  return (
    <TabsTrigger
      className={cn(
        "h-auto min-h-11 flex-auto shrink-0 px-2 whitespace-nowrap sm:px-3 sm:flex-none",
        "data-active:border-transparent data-active:bg-primary data-active:text-primary-foreground data-active:shadow-sm",
        "dark:data-active:border-transparent dark:data-active:bg-primary dark:data-active:text-primary-foreground",
        className,
      )}
      {...props}
    />
  )
}
