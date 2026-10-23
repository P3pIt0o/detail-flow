"use client"

/**
 * Comparateur avant / après CLEANYZER (scopé `.cleanyzer`).
 *
 * Distinct de `components/before-after-slider.tsx` (partagé avec d'autres
 * tenants, laissé intact) : textes alternatifs propres à chaque photo,
 * étiquettes AVANT / APRÈS, poignée fléchée, cadre au ratio réel des photos.
 *
 * Fluidité : aucune mise à jour d'état React pendant le geste — la position est
 * écrite dans `--clz-cmp` (une fois par frame). `touch-action: pan-y` laisse le
 * défilement vertical de la page au navigateur. Clavier / lecteur d'écran :
 * `<input type="range">` natif superposé (flèches, Début / Fin).
 */

import { useCallback, useEffect, useRef, useState } from "react"
import Image from "next/image"
import { ChevronLeft, ChevronRight } from "lucide-react"

const INITIAL = 50

export const clampPct = (pct: number) => Math.min(100, Math.max(0, pct))

export type ClzCompareProps = {
  before: string
  after: string
  altBefore: string
  altAfter: string
  /** Libellé du contrôle accessible (ex. « Rénovation des optiques de phares »). */
  label: string
  sizes?: string
  /** Ratio du cadre (largeur / hauteur), identique à celui des photos. */
  ratio?: string
  /** Au-dessus de la ligne de flottaison (héros) : images chargées en priorité. */
  priority?: boolean
}

export function ClzCompareSlider({ before, after, altBefore, altAfter, label, sizes = "(max-width:768px) 100vw, 33vw", ratio = "3 / 4", priority = false }: ClzCompareProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const rangeRef = useRef<HTMLInputElement>(null)
  const dragging = useRef(false)
  const raf = useRef<number | null>(null)
  const pending = useRef(INITIAL)
  const [value, setValue] = useState(INITIAL)

  const apply = useCallback((pct: number) => {
    pending.current = clampPct(pct)
    if (raf.current !== null) return
    raf.current = requestAnimationFrame(() => {
      raf.current = null
      rootRef.current?.style.setProperty("--clz-cmp", `${pending.current}%`)
    })
  }, [])

  const fromX = (clientX: number) => {
    const r = rootRef.current?.getBoundingClientRect()
    return r ? ((clientX - r.left) / r.width) * 100 : pending.current
  }

  const end = useCallback(() => {
    if (!dragging.current) return
    dragging.current = false
    const v = Math.round(pending.current)
    if (rangeRef.current) rangeRef.current.value = String(v)
    setValue(v)
  }, [])

  useEffect(() => () => {
    if (raf.current !== null) cancelAnimationFrame(raf.current)
  }, [])

  return (
    <div
      ref={rootRef}
      className="clz-cmp"
      style={{ aspectRatio: ratio }}
      onPointerDown={(e) => {
        dragging.current = true
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          /* pointeur déjà relâché */
        }
        apply(fromX(e.clientX))
      }}
      onPointerMove={(e) => dragging.current && apply(fromX(e.clientX))}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
    >
      <Image src={after} alt={altAfter} fill priority={priority} loading={priority ? undefined : "lazy"} sizes={sizes} className="clz-cmp-img" draggable={false} />
      <div className="clz-cmp-before">
        <Image src={before} alt={altBefore} fill priority={priority} loading={priority ? undefined : "lazy"} sizes={sizes} className="clz-cmp-img" draggable={false} />
      </div>
      <span className="clz-pair-label" aria-hidden="true">Avant</span>
      <span className="clz-pair-label is-after clz-cmp-after-label" aria-hidden="true">Après</span>
      <div className="clz-cmp-line" aria-hidden="true">
        <span className="clz-cmp-handle">
          <ChevronLeft className="h-4 w-4" />
          <ChevronRight className="h-4 w-4" />
        </span>
      </div>
      <input
        ref={rangeRef}
        type="range"
        min={0}
        max={100}
        step={1}
        defaultValue={INITIAL}
        className="clz-cmp-range"
        aria-label={`Comparer avant et après : ${label}`}
        aria-valuenow={value}
        aria-valuetext={`${Math.round(value)} % de la photo avant visible`}
        onInput={(e) => apply(Number((e.target as HTMLInputElement).value))}
        onChange={(e) => setValue(Number(e.target.value))}
      />
    </div>
  )
}
