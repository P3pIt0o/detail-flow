"use client"

/**
 * Animations discrètes CLEANYZER (scopées `.cleanyzer`, aucun autre tenant).
 * - ClzReveal : révélation unique des cartes `[data-clz-reveal]` au scroll.
 * - ClzCompareHint : démonstration ponctuelle du comparateur avant/après.
 * Le contenu n'est masqué QUE par JS, juste avant observation : sans JS, en
 * cas d'erreur ou avec prefers-reduced-motion, tout reste visible.
 */

import { useEffect, useRef } from "react"

const prefersReducedMotion = () =>
  typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches

export function ClzReveal() {
  useEffect(() => {
    if (prefersReducedMotion() || !("IntersectionObserver" in window)) return
    const vh = window.innerHeight
    const targets = Array.from(document.querySelectorAll<HTMLElement>(".cleanyzer [data-clz-reveal]")).filter(
      (el) => el.getBoundingClientRect().top > vh * 0.92,
    )
    if (targets.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        let batch = 0
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const el = entry.target as HTMLElement
          observer.unobserve(el)
          el.style.transitionDelay = `${Math.min(batch, 3) * 70}ms`
          batch += 1
          el.classList.add("clz-reveal-in")
          el.addEventListener(
            "transitionend",
            () => {
              el.style.transitionDelay = ""
            },
            { once: true },
          )
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.01 },
    )

    for (const el of targets) {
      el.classList.add("clz-reveal-pending")
      observer.observe(el)
    }

    return () => {
      observer.disconnect()
      for (const el of targets) el.classList.remove("clz-reveal-pending", "clz-reveal-in")
    }
  }, [])

  return null
}

const HINT_DURATION = 1100
const HINT_AMPLITUDE = 8

export function ClzCompareHint({ children }: { children: React.ReactNode }) {
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const wrapper = wrapperRef.current
    const root = wrapper?.firstElementChild as HTMLElement | null
    if (!wrapper || !root || prefersReducedMotion() || !("IntersectionObserver" in window)) return

    let rafId: number | null = null
    let cancelled = false

    const stop = () => {
      cancelled = true
      if (rafId !== null) cancelAnimationFrame(rafId)
      rafId = null
    }
    // Toute interaction (capture, avant le comparateur) annule la démo sans
    // toucher à la position : l'utilisateur garde le contrôle.
    const interactionEvents = ["pointerdown", "keydown", "focusin", "touchstart"] as const
    for (const type of interactionEvents) wrapper.addEventListener(type, stop, { capture: true, passive: true })

    const play = () => {
      if (cancelled || root.style.getPropertyValue("--compare-position")) return
      const start = performance.now()
      const tick = (now: number) => {
        if (cancelled) return
        const t = Math.min(1, (now - start) / HINT_DURATION)
        const pos = 50 + HINT_AMPLITUDE * Math.sin(Math.PI * t)
        if (t < 1) {
          root.style.setProperty("--compare-position", `${pos}%`)
          rafId = requestAnimationFrame(tick)
        } else {
          root.style.removeProperty("--compare-position")
          rafId = null
        }
      }
      rafId = requestAnimationFrame(tick)
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect()
          window.setTimeout(play, 250)
        }
      },
      { threshold: 0.6 },
    )
    observer.observe(wrapper)

    return () => {
      observer.disconnect()
      stop()
      for (const type of interactionEvents) wrapper.removeEventListener(type, stop, { capture: true })
    }
  }, [])

  return (
    <div ref={wrapperRef} className="clz-compare">
      {children}
    </div>
  )
}
