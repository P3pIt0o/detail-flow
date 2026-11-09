"use client"

import { useEffect, useRef, useState, type CSSProperties } from "react"
import { cardFaceBackground, contrastText, shadeHex, type DigitalCardStyle } from "@/lib/digital-card"
import {
  applyDeadZone,
  floatOffset,
  holoTransform,
  layersFor,
  orientationTarget,
  pointerTarget,
  shadowTransform,
  specularOffset,
  stepSpring,
  type Orientation,
  type SpringState,
  type Tilt,
} from "@/lib/digital-card-motion"

/**
 * Carte de visite 3D (L45) : CSS 3D + boucle rAF qui n'écrit que `transform` / `opacity`
 * directement sur les nœuds (aucun re-rendu React par image). Téléphone : orientation
 * (calibrée au 1er évènement) ; ordinateur : souris ; mouvement réduit / refus : carte fixe.
 */

type Props = {
  name: string
  line?: string | null
  logoSrc?: string | null
  background: string
  accent: string
  cardStyle: DigitalCardStyle
}

const ZERO: Tilt = { x: 0, y: 0 }
const EDGE_LAYERS = [5, 4, 3, 2, 1]
const STATIC_SPEC = specularOffset(ZERO, true)
const layer: CSSProperties = { position: "absolute", inset: 0, borderRadius: "4.5cqw" }

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?"
  )
}

type PermissionApi = { requestPermission?: () => Promise<string> }

export function TiltCard({ name, line, logoSrc, background, accent, cardStyle }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const shadowRef = useRef<HTMLDivElement>(null)
  const specRef = useRef<HTMLDivElement>(null)
  const holoRef = useRef<HTMLDivElement>(null)
  const enableRef = useRef<(() => void) | null>(null)
  const [needsPermission, setNeedsPermission] = useState(false)

  useEffect(() => {
    const wrap = wrapRef.current
    const card = cardRef.current
    const shadow = shadowRef.current
    if (!wrap || !card || !shadow) return

    let frozen = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const target: Tilt = { x: 0, y: 0 }
    let sx: SpringState = { value: 0, velocity: 0 }
    let sy: SpringState = { value: 0, velocity: 0 }
    let neutral: Orientation | null = null
    let hovering = false
    let raf = 0

    const render = (tilt: Tilt, fl: number, reduced: boolean) => {
      card.style.transform = `translate3d(0, ${fl}px, 0) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`
      const sh = shadowTransform(tilt, fl)
      shadow.style.transform = `translate3d(${sh.x}px, ${sh.y}px, 0) scale(${sh.scale})`
      shadow.style.opacity = String(sh.opacity)
      const sp = specularOffset(tilt, reduced)
      if (specRef.current) specRef.current.style.transform = `translate3d(${sp.x}%, ${sp.y}%, 0)`
      const ho = holoTransform(tilt)
      if (holoRef.current) holoRef.current.style.transform = `translate3d(${ho.x}%, ${ho.y}%, 0) rotate(${ho.rotate}deg)`
    }
    const frame = (ms: number) => {
      sx = stepSpring(sx, target.x)
      sy = stepSpring(sy, target.y)
      render({ x: sx.value, y: sy.value }, floatOffset(ms / 1000, false), false)
      raf = requestAnimationFrame(frame)
    }
    const start = () => {
      if (!raf && !frozen && document.visibilityState === "visible") raf = requestAnimationFrame(frame)
    }
    const stop = () => {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
    }
    const freeze = () => {
      frozen = true
      stop()
      render(ZERO, 0, true)
    }

    const onOrientation = (e: DeviceOrientationEvent) => {
      if (hovering || e.beta == null || e.gamma == null) return
      const o = { beta: e.beta, gamma: e.gamma }
      if (!neutral) neutral = o
      const t = orientationTarget(o, neutral)
      target.x = applyDeadZone(target.x, t.x)
      target.y = applyDeadZone(target.y, t.y)
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return
      hovering = true
      const r = wrap.getBoundingClientRect()
      const t = pointerTarget(((e.clientX - r.left) / r.width - 0.5) * 2, ((e.clientY - r.top) / r.height - 0.5) * 2)
      target.x = t.x
      target.y = t.y
    }
    const onLeave = () => {
      hovering = false
      target.x = 0
      target.y = 0
    }
    const onVisibility = () => (document.visibilityState === "visible" ? start() : stop())

    if (frozen) return

    const api = (window as unknown as { DeviceOrientationEvent?: PermissionApi }).DeviceOrientationEvent
    const listenOrientation = () => window.addEventListener("deviceorientation", onOrientation)
    if (typeof api?.requestPermission === "function") {
      // iOS : l'autorisation ne peut être demandée qu'au toucher.
      enableRef.current = () => {
        setNeedsPermission(false)
        api.requestPermission!().then(
          (r) => {
            if (r === "granted") {
              neutral = null
              listenOrientation()
            } else freeze()
          },
          freeze,
        )
      }
      setNeedsPermission(true)
    } else if (api) {
      listenOrientation()
    }
    wrap.addEventListener("pointermove", onMove)
    wrap.addEventListener("pointerleave", onLeave)
    document.addEventListener("visibilitychange", onVisibility)
    start()

    return () => {
      stop()
      enableRef.current = null
      window.removeEventListener("deviceorientation", onOrientation)
      wrap.removeEventListener("pointermove", onMove)
      wrap.removeEventListener("pointerleave", onLeave)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [])

  const text = contrastText(background)
  const { holographic } = layersFor(cardStyle)

  return (
    <div className="w-full" style={{ containerType: "inline-size" }}>
      <div className="flex justify-center py-8" style={{ perspective: "900px" }}>
        <div ref={wrapRef} className="relative w-full" style={{ aspectRatio: "85.6 / 54" }}>
          <div
            ref={shadowRef}
            aria-hidden="true"
            className="pointer-events-none absolute"
            style={{
              left: "8%",
              right: "8%",
              bottom: "-26px",
              height: "34px",
              borderRadius: "50%",
              background: "rgba(0,0,0,.55)",
              filter: "blur(16px)",
              opacity: 0.85,
              willChange: "transform, opacity",
            }}
          />
          <div
            ref={cardRef}
            className="absolute inset-0"
            style={{ transformStyle: "preserve-3d", willChange: "transform", color: text }}
          >
            {EDGE_LAYERS.map((i) => (
              <div
                key={i}
                aria-hidden="true"
                style={{ ...layer, background: shadeHex(background, 0.55), transform: `translateZ(${-i * 0.6}px)` }}
              />
            ))}
            <div style={{ ...layer, background: cardFaceBackground({ background, accent, style: cardStyle }), boxShadow: "inset 0 0 0 1px rgba(255,255,255,.10)" }}>
              <div
                aria-hidden="true"
                style={{ ...layer, background: "repeating-linear-gradient(135deg, currentColor 0 1px, transparent 1px 9px)", opacity: 0.06 }}
              />
            </div>
            <div
              className="absolute flex items-center justify-center bg-white font-extrabold text-slate-900"
              style={{
                top: "9%",
                left: "7%",
                width: "17%",
                aspectRatio: "1",
                borderRadius: "3.6cqw",
                fontSize: "5.5cqw",
                transform: "translateZ(24px)",
                boxShadow: "0 6px 14px rgba(0,0,0,.35)",
              }}
            >
              {logoSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoSrc} alt="" className="size-full object-contain p-[8%]" style={{ borderRadius: "3.6cqw" }} />
              ) : (
                initials(name)
              )}
            </div>
            <div
              aria-hidden="true"
              className="absolute"
              style={{ right: "7%", top: "12%", width: "11%", height: "4px", borderRadius: "2px", background: accent, transform: "translateZ(8px)" }}
            />
            <p
              className="absolute m-0 truncate font-bold tracking-tight"
              style={{ left: "7%", right: "7%", bottom: line ? "22%" : "14%", fontSize: "6.6cqw", transform: "translateZ(16px)", textShadow: "0 2px 6px rgba(0,0,0,.25)" }}
            >
              {name}
            </p>
            {line ? (
              <p className="absolute m-0 truncate" style={{ left: "7%", right: "7%", bottom: "10%", fontSize: "4cqw", opacity: 0.85, transform: "translateZ(10px)" }}>
                {line}
              </p>
            ) : null}
            {holographic ? (
              <div
                data-layer="holo"
                aria-hidden="true"
                className="pointer-events-none"
                style={{ ...layer, overflow: "hidden", mixBlendMode: "color-dodge", opacity: 0.16, transform: "translateZ(1px)" }}
              >
                <div
                  ref={holoRef}
                  className="absolute"
                  style={{
                    inset: "-50%",
                    background: "conic-gradient(from 0deg, #ff6ec7, #ffd36e, #6effa8, #6ec8ff, #b36eff, #ff6ec7)",
                    willChange: "transform",
                  }}
                />
              </div>
            ) : null}
            <div
              data-layer="specular"
              aria-hidden="true"
              className="pointer-events-none"
              style={{ ...layer, overflow: "hidden", mixBlendMode: "screen", transform: "translateZ(2px)" }}
            >
              <div
                ref={specRef}
                className="absolute"
                style={{
                  inset: "-50%",
                  background: "radial-gradient(circle at 50% 50%, rgba(255,255,255,.42), rgba(255,255,255,.08) 14%, transparent 28%)",
                  transform: `translate3d(${STATIC_SPEC.x}%, ${STATIC_SPEC.y}%, 0)`,
                  willChange: "transform",
                }}
              />
            </div>
          </div>
        </div>
      </div>
      {/* Place réservée : l'apparition du bouton iOS ne décale pas la page. */}
      <div className="flex h-9 items-center justify-center">
        {needsPermission ? (
          <button
            type="button"
            onClick={() => enableRef.current?.()}
            className="rounded-full border border-current px-3 py-1.5 text-xs opacity-60 transition-opacity hover:opacity-100"
          >
            Toucher pour animer la carte
          </button>
        ) : null}
      </div>
    </div>
  )
}
