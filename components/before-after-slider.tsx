"use client"

/**
 * Comparateur d'images Avant / Après interactif.
 * L'utilisateur glisse le curseur (souris, tactile ou clavier) pour révéler
 * l'image « après » par-dessus l'image « avant ».
 *
 * Performance (Safari iOS notamment) :
 * - Le glissement NE déclenche AUCUN setState React : la position est écrite
 *   dans une variable CSS (`--compare-position`, en %) sur la racine du
 *   comparateur, lue à l'identique par la découpe (`clip-path`, image avant),
 *   la ligne verticale et la poignée (`left`). Aucun re-render, aucun
 *   redécodage d'image pendant le geste.
 * - L'écriture DOM est throttlée à une fois par frame via requestAnimationFrame,
 *   correctement annulée au démontage.
 * - Pointer Events + setPointerCapture (compatible Safari iOS) ; pointerup,
 *   pointercancel et lostpointercapture sont tous gérés.
 * - `touch-action: pan-y` : le défilement vertical de la page reste naturel,
 *   seul le geste horizontal pilote le comparateur (aucun blocage global du
 *   comportement tactile natif du navigateur).
 *
 * Accessibilité : un <input type="range"> superposé (transparent) pilote la
 * même variable CSS ; il reste focusable au clavier (flèches) et lisible par
 * VoiceOver via aria-label. Sa valeur React (état) n'est mise à jour qu'à la
 * fin du geste, pour conserver l'accessibilité sans nuire à la fluidité.
 */

import { useRef, useState, useCallback, useEffect } from "react"
import Image from "next/image"
import { MoveHorizontal } from "lucide-react"

const INITIAL = 50

export function BeforeAfterSlider({
  before,
  after,
  alt,
}: {
  before: string
  after: string
  alt: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rangeRef = useRef<HTMLInputElement>(null)
  const dragging = useRef(false)
  const rafId = useRef<number | null>(null)
  const pending = useRef(INITIAL)
  // Valeur exposée à l'input range pour l'accessibilité (clavier / VoiceOver).
  // Non utilisée pour l'affichage visuel : celui-ci est piloté par --pos.
  const [ariaValue, setAriaValue] = useState(INITIAL)

  // Applique la position (0–100) au DOM via une variable CSS, throttlée à une
  // frame. clip-path et translateX consomment --pos sans recalcul de layout.
  const applyPosition = useCallback((pct: number) => {
    pending.current = Math.min(100, Math.max(0, pct))
    if (rafId.current !== null) return
    rafId.current = requestAnimationFrame(() => {
      rafId.current = null
      const el = containerRef.current
      // La variable porte une unité en pourcentage et est posée sur la RACINE
      // du comparateur ; la découpe, la ligne et la poignée la lisent à l'identique.
      if (el) el.style.setProperty("--compare-position", `${pending.current}%`)
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
      // Capture Safari iOS : le conteneur continue de recevoir les pointermove
      // même si le doigt sort de ses limites → position toujours bornée 0–100.
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        /* setPointerCapture peut lever si le pointeur n'est plus actif */
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

  // Fin de geste : on borne, on synchronise l'input range (accessibilité)
  // et l'état ARIA une seule fois — aucun re-render pendant le déplacement.
  const endDrag = useCallback(() => {
    if (!dragging.current) return
    dragging.current = false
    const final = Math.min(100, Math.max(0, pending.current))
    if (rangeRef.current) rangeRef.current.value = String(final)
    setAriaValue(final)
  }, [])

  // Nettoyage : annule toute frame en attente au démontage.
  useEffect(() => {
    return () => {
      if (rafId.current !== null) cancelAnimationFrame(rafId.current)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="group relative aspect-[4/3] w-full select-none overflow-hidden rounded-2xl border border-border [--compare-position:50%] [touch-action:pan-y]"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
    >
      {/* Image APRÈS (fond) */}
      <Image
        src={after || "/placeholder.svg"}
        alt={`${alt} — après`}
        fill
        sizes="(max-width: 768px) 100vw, 50vw"
        decoding="async"
        className="object-cover"
      />
      <span className="absolute right-3 top-3 rounded-full bg-primary/90 px-3 py-1 text-xs font-semibold text-primary-foreground">
        Après
      </span>

      {/* Image AVANT : révélée par clip-path piloté par --pos. L'image reste à
          la taille pleine du conteneur (aucune déformation) ; seul le masque
          bouge → pas de recalcul de layout ni de redécodage pendant le geste. */}
      <div
        className="absolute inset-0"
        style={{ clipPath: "inset(0 calc(100% - var(--compare-position)) 0 0)" }}
      >
        <Image
          src={before || "/placeholder.svg"}
          alt={`${alt} — avant`}
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          decoding="async"
          className="object-cover"
        />
        {/* Fond semi-opaque (remplace l'ancien flou d'arrière-plan, trop
            coûteux pendant le drag) — lisibilité du badge, rendu similaire. */}
        <span className="absolute left-3 top-3 rounded-full bg-background/85 px-3 py-1 text-xs font-semibold text-foreground">
          Avant
        </span>
      </div>

      {/* Ligne + poignée : `left` lit la MÊME variable (relative au conteneur,
          donc alignée avec la découpe), centrée par translateX(-50%). Le
          pourcentage de translate ici est relatif au petit élément (la ligne /
          la poignée), ce qui le recentre exactement sur la séparation. */}
      <div
        className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white/90"
        style={{ left: "var(--compare-position)", willChange: "left" }}
      >
        <div className="absolute left-1/2 top-1/2 flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-primary text-primary-foreground shadow-lg">
          <MoveHorizontal className="size-5" />
        </div>
      </div>

      {/* Contrôle accessible (clavier / VoiceOver). Il pilote directement --pos
          pendant la saisie clavier, sans re-render, et synchronise l'état ARIA. */}
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
