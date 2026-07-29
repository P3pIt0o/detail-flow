"use client"

/**
 * Comparateur d'images Avant / Après interactif.
 * L'utilisateur glisse le curseur (souris, tactile ou clavier) pour révéler
 * l'image « après » par-dessus l'image « avant ».
 *
 * Accessibilité : le curseur est un <input type="range"> masqué visuellement
 * mais pilotable au clavier (flèches gauche/droite).
 */

import { useRef, useState, useCallback } from "react"
import Image from "next/image"
import { MoveHorizontal } from "lucide-react"

export function BeforeAfterSlider({
  before,
  after,
  alt,
}: {
  before: string
  after: string
  alt: string
}) {
  const [position, setPosition] = useState(50)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const updateFromClientX = useCallback((clientX: number) => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const pct = ((clientX - rect.left) / rect.width) * 100
    setPosition(Math.min(100, Math.max(0, pct)))
  }, [])

  return (
    <div
      ref={containerRef}
      className="group relative aspect-[4/3] w-full touch-none select-none overflow-hidden rounded-2xl border border-border"
      onPointerDown={(e) => {
        dragging.current = true
        updateFromClientX(e.clientX)
      }}
      onPointerMove={(e) => {
        if (dragging.current) updateFromClientX(e.clientX)
      }}
      onPointerUp={() => (dragging.current = false)}
      onPointerLeave={() => (dragging.current = false)}
    >
      {/* Image APRÈS (fond) */}
      <Image src={after || "/placeholder.svg"} alt={`${alt} — après`} fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" />
      <span className="absolute right-3 top-3 rounded-full bg-primary/90 px-3 py-1 text-xs font-semibold text-primary-foreground">
        Après
      </span>

      {/* Image AVANT : le wrapper externe rogne (clip), le wrapper interne
          garde la largeur pleine du conteneur pour éviter toute déformation. */}
      <div className="absolute inset-0 overflow-hidden" style={{ width: `${position}%` }}>
        <div className="absolute inset-y-0 left-0 h-full w-screen max-w-none" style={{ width: containerRef.current?.offsetWidth ?? "100%" }}>
          <Image
            src={before || "/placeholder.svg"}
            alt={`${alt} — avant`}
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover"
          />
        </div>
        <span className="absolute left-3 top-3 rounded-full bg-background/80 px-3 py-1 text-xs font-semibold text-foreground backdrop-blur">
          Avant
        </span>
      </div>

      {/* Poignée */}
      <div className="pointer-events-none absolute inset-y-0" style={{ left: `${position}%` }}>
        <div className="absolute inset-y-0 -ml-px w-0.5 bg-white/90" />
        <div className="absolute top-1/2 flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-primary text-primary-foreground shadow-lg">
          <MoveHorizontal className="size-5" />
        </div>
      </div>

      {/* Contrôle accessible (clavier) */}
      <input
        type="range"
        min={0}
        max={100}
        value={position}
        onChange={(e) => setPosition(Number(e.target.value))}
        aria-label={`Comparateur avant/après : ${alt}`}
        className="absolute inset-0 size-full cursor-ew-resize opacity-0"
      />
    </div>
  )
}
