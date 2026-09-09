"use client"

/**
 * Comparateur Avant/Après Rozan — extrêmement fluide (iPhone, Android, desktop).
 *
 * Même technique de performance que le comparateur DetailFlow partagé : le
 * glissement n'entraîne AUCUN setState (position écrite dans une variable CSS
 * `--pos`, throttlée à une frame via requestAnimationFrame), Pointer Events +
 * setPointerCapture (compatible Safari iOS), `touch-action: pan-y` pour laisser
 * le scroll vertical naturel. Accessible au clavier via un <input range>.
 *
 * Il accepte des NŒUDS (before/after) plutôt que des URLs : en Phase 2 on y
 * place les emplacements photo Rozan (`RozanShot`) ; en Phase 4, on passe les
 * vraies images (`next/image`) sans changer le composant.
 */

import { useRef, useState, useCallback, useEffect, type ReactNode } from "react"
import { MoveHorizontal } from "lucide-react"

const INITIAL = 50

export function RozanCompare({
  before,
  after,
  alt,
}: {
  before: ReactNode
  after: ReactNode
  alt: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rangeRef = useRef<HTMLInputElement>(null)
  const dragging = useRef(false)
  const rafId = useRef<number | null>(null)
  const pending = useRef(INITIAL)
  const [ariaValue, setAriaValue] = useState(INITIAL)

  const applyPosition = useCallback((pct: number) => {
    pending.current = Math.min(100, Math.max(0, pct))
    if (rafId.current !== null) return
    rafId.current = requestAnimationFrame(() => {
      rafId.current = null
      const el = containerRef.current
      if (el) el.style.setProperty("--pos", `${pending.current}%`)
    })
  }, [])

  const pctFromClientX = useCallback((clientX: number) => {
    const el = containerRef.current
    if (!el) return pending.current
    const rect = el.getBoundingClientRect()
    return ((clientX - rect.left) / rect.width) * 100
  }, [])

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      dragging.current = true
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        /* noop */
      }
      applyPosition(pctFromClientX(e.clientX))
    },
    [applyPosition, pctFromClientX],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return
      applyPosition(pctFromClientX(e.clientX))
    },
    [applyPosition, pctFromClientX],
  )

  const endDrag = useCallback(() => {
    if (!dragging.current) return
    dragging.current = false
    const final = Math.min(100, Math.max(0, pending.current))
    if (rangeRef.current) rangeRef.current.value = String(final)
    setAriaValue(final)
  }, [])

  useEffect(() => {
    return () => {
      if (rafId.current !== null) cancelAnimationFrame(rafId.current)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="group relative aspect-[4/3] w-full select-none overflow-hidden rounded-2xl border border-[color:var(--rozan-line)] [--pos:50%] [touch-action:pan-y]"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
    >
      {/* APRÈS (fond) */}
      <div className="absolute inset-0">{after}</div>
      <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-[var(--rozan-accent)] px-3 py-1 text-xs font-semibold text-white">
        Après
      </span>

      {/* AVANT (révélé par clip-path piloté par --pos) */}
      <div className="absolute inset-0" style={{ clipPath: "inset(0 calc(100% - var(--pos)) 0 0)" }}>
        {before}
        <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-[var(--rozan-fg)]">
          Avant
        </span>
      </div>

      {/* Ligne + poignée */}
      <div
        className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white/90"
        style={{ left: "var(--pos)", willChange: "left" }}
      >
        <div className="absolute left-1/2 top-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-[var(--rozan-accent)] text-white shadow-lg">
          <MoveHorizontal className="size-5" aria-hidden="true" />
        </div>
      </div>

      <input
        ref={rangeRef}
        type="range"
        min={0}
        max={100}
        defaultValue={INITIAL}
        onInput={(e) => applyPosition(Number((e.target as HTMLInputElement).value))}
        onChange={(e) => setAriaValue(Number(e.target.value))}
        aria-label={`Comparateur avant/après : ${alt}`}
        aria-valuetext={`Image avant révélée à ${Math.round(ariaValue)} %`}
        className="absolute inset-0 size-full cursor-ew-resize opacity-0 [touch-action:pan-y]"
      />
    </div>
  )
}
