"use client"

/**
 * VISITE CLEANYZER EN IMAGES (L55, remplace la 3D) — même interface : une zone à la fois,
 * panneau de la zone, rail des zones, choix de formule final, liens profonds `#zone=`.
 *
 * Images : `visite-video/{pc,tel}/f_0001…f_0331.webp` (12 i/s) dessinées sur un canvas, comme le
 * film des prestations. Ordinateur : le défilement choisit l'arrêt ; téléphone : glissement.
 * Entre deux arrêts, le trajet est joué en accéléré (~0,6 s) puis l'image s'arrête sur la zone.
 * Mouvement réduit / économie de données : image fixe de l'arrêt + boutons précédent/suivant.
 * Aucune image au rendu serveur : chargement quand la section approche (arrêts d'abord).
 */

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react"
import { VEHICLES, type VehicleKey } from "./content"
import {
  CLZ_VISIT_ANCHOR,
  JOURNEY_FORMULAS,
  JOURNEY_ZONES,
  ZONE_KEYS,
  zoneAction,
  zoneFormulas,
  type FormulaRef,
  type ZoneKey,
} from "./journey"
import { goFilm, goVisit, noteZone, registerVisit, useJourney } from "./journey-nav"
import { dragPosition, releaseStop, stepTo, swipeStops } from "./visit-3d-swipe"
import "./visit-video.css"

const BASE = "/custom-sites/cleanyzer/visite-video"
export const VISIT_FRAME_COUNT = 331
/** Durée du trajet entre deux arrêts (ms). */
export const VISIT_TRAVEL_MS = 600

/** Arrêts (numéro d'image, base 1) : ouverture, 9 zones, choix de formule final. */
export const VISIT_STOPS: readonly { zone: ZoneKey | null; frame: number }[] = [
  { zone: null, frame: 7 },
  { zone: "body", frame: 31 },
  { zone: "optics", frame: 61 },
  { zone: "rims", frame: 91 },
  { zone: "engine", frame: 133 },
  { zone: "entry", frame: 168 },
  { zone: "seats", frame: 217 },
  { zone: "mats", frame: 257 },
  { zone: "vents", frame: 279 },
  { zone: "leather", frame: 313 },
  { zone: null, frame: VISIT_FRAME_COUNT },
]
export const KEY_ORDER = VISIT_STOPS.map((s) => s.zone)
const STEPS = KEY_ORDER.filter((z): z is ZoneKey => z !== null)
const STOPS = swipeStops(KEY_ORDER)
const LAST = STOPS.length - 1

export type VisitSet = "pc" | "tel"
export const visitFrameSrc = (set: VisitSet, n: number) => `${BASE}/${set}/f_${String(n).padStart(4, "0")}.webp`

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

/** Image (fractionnaire) pour une position d'arrêt fractionnaire (pendant le glissement). */
export function frameAtStop(pos: number): number {
  const p = clamp(pos, 0, LAST)
  const i = Math.min(LAST - 1, Math.floor(p))
  const a = VISIT_STOPS[STOPS[i]].frame
  const b = VISIT_STOPS[STOPS[i + 1]].frame
  return a + (b - a) * (p - i)
}

/** Ordre de chargement : première image, autres arrêts, puis toutes les images dans l'ordre (repli : arrêts seuls). */
export function visitLoadOrder(still = false): number[] {
  const stops = VISIT_STOPS.map((s) => s.frame)
  if (still) return stops
  return [...stops, ...Array.from({ length: VISIT_FRAME_COUNT }, (_, i) => i + 1).filter((n) => !stops.includes(n))]
}

/** Pas d'animation (image fixe + précédent/suivant) si mouvement réduit ou économie de données. */
export const visitIsStill = (reducedMotion: boolean, saveData: boolean) => reducedMotion || saveData

const stopLabel = (i: number) => {
  const z = KEY_ORDER[STOPS[i]]
  return z ? JOURNEY_ZONES[z].name : i === 0 ? "Introduction" : "Choix de la formule"
}
const stopOf = (zone: ZoneKey | "final") => (zone === "final" ? LAST : Math.max(0, STOPS.indexOf(KEY_ORDER.indexOf(zone))))
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

const FORM_GROUPS: { label: string; side: "int" | "ext" | "both" }[] = [
  { label: "Intérieur", side: "int" },
  { label: "Extérieur", side: "ext" },
  { label: "Sur mesure", side: "both" },
]

export function VisitVideo() {
  const sectionRef = useRef<HTMLElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ringArcRef = useRef<SVGCircleElement>(null)
  const ringValRef = useRef<HTMLElement>(null)
  const barRef = useRef<HTMLElement>(null)

  const [loading, setLoading] = useState(true)
  const [stop, setStop] = useState(0)
  const [form, setForm] = useState<FormulaRef>("excellence")
  const [veh, setVeh] = useState<VehicleKey>("citadine")
  // Téléphone (pointeur tactile) ou repli sans animation : navigation par arrêts.
  const [steps, setSteps] = useState(false)
  const journey = useJourney()
  // `pos` : arrêt (fractionnaire pendant le geste), lu par la boucle de rendu sans rendu React.
  const navRef = useRef({ steps: false, pos: 0, stop: 0, dragging: false })
  const dragRef = useRef<{ id: number; x: number; y: number; active: boolean; lastX: number; lastT: number; vx: number } | null>(null)

  const goStop = (i: number) => {
    const n = navRef.current
    n.pos = i
    n.stop = i
    setStop(i)
  }

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("clz-veh")
      if (saved === "citadine" || saved === "berline" || saved === "suv") setVeh(saved)
    } catch {
      /* valeur par défaut */
    }
  }, [])

  useEffect(() => {
    const section = sectionRef.current
    if (!section) return
    return registerVisit((zone) => {
      const i = stopOf(zone)
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      if (navRef.current.steps) {
        goStop(i)
        section.scrollIntoView({ behavior: still ? "auto" : "smooth" })
        return
      }
      window.scrollTo({
        top: section.getBoundingClientRect().top + window.scrollY + (section.offsetHeight - window.innerHeight) * (i / LAST),
        behavior: still ? "auto" : "smooth",
      })
    })
  }, [])

  useEffect(() => {
    const section = sectionRef.current
    const cv = canvasRef.current
    const ctx = cv?.getContext("2d")
    if (!section || !cv || !ctx) return
    const nav = navRef.current
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
    const still = visitIsStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches, Boolean(conn?.saveData))
    // shortcut: pointeur et orientation lus au montage seulement ; suffit tant qu'un appareil n'en change pas.
    nav.steps = still || window.matchMedia("(pointer: coarse)").matches
    setSteps(nav.steps)
    const set: VisitSet = window.matchMedia("(orientation: portrait)").matches ? "tel" : "pc"

    const imgs: (HTMLImageElement | undefined)[] = new Array(VISIT_FRAME_COUNT + 1)
    let disposed = false
    let started = false
    let raf = 0
    let visible = false
    let drawn = -1
    let cur = VISIT_STOPS[0].frame
    let tween = { from: cur, to: cur, t0: 0 }

    const nearest = (n: number) => {
      for (let d = 0; d < VISIT_FRAME_COUNT; d++) {
        const img = imgs[n - d] ?? imgs[n + d]
        if (img) return img
      }
      return null
    }
    const draw = (force = false) => {
      const n = clamp(Math.round(cur), 1, VISIT_FRAME_COUNT)
      if (n === drawn && !force) return
      const img = nearest(n)
      if (!img) return
      drawn = n
      const W = cv.width
      const H = cv.height
      const sc = Math.max(W / img.naturalWidth, H / img.naturalHeight)
      const dw = img.naturalWidth * sc
      const dh = img.naturalHeight * sc
      ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh)
    }

    // Chargement progressif (4 requêtes en parallèle), arrêts d'abord.
    const queue = visitLoadOrder(still)
    const loadNext = () => {
      const n = queue.shift()
      if (n == null || disposed) return
      const img = new Image()
      img.decoding = "async"
      img.onload = () => {
        if (disposed) return
        imgs[n] = img
        setLoading(false)
        draw(true)
        loadNext()
      }
      img.onerror = () => loadNext()
      img.src = visitFrameSrc(set, n)
    }
    const start = () => {
      if (started) return
      started = true
      for (let k = 0; k < 4; k++) loadNext()
    }

    const fit = () => {
      const r = cv.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      cv.width = Math.max(1, Math.round(r.width * dpr))
      cv.height = Math.max(1, Math.round(r.height * dpr))
      draw(true)
    }
    const measure = () => {
      if (nav.steps) return
      const r = section.getBoundingClientRect()
      const i = Math.round(clamp(-r.top / Math.max(1, r.height - window.innerHeight), 0, 1) * LAST)
      if (i !== nav.stop) {
        nav.stop = i
        nav.pos = i
        setStop(i)
      }
    }

    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop)
      if (!visible) return
      if (nav.dragging) {
        cur = frameAtStop(nav.pos)
        tween = { from: cur, to: cur, t0: ts }
      } else {
        const to = VISIT_STOPS[STOPS[nav.stop]].frame
        if (to !== tween.to) tween = { from: cur, to, t0: ts }
        const t = still ? 1 : clamp((ts - tween.t0) / VISIT_TRAVEL_MS, 0, 1)
        cur = tween.from + (tween.to - tween.from) * ease(t)
      }
      draw()
      const p = (cur - 1) / (VISIT_FRAME_COUNT - 1)
      if (ringValRef.current) ringValRef.current.textContent = String(Math.round(p * 100))
      if (ringArcRef.current) ringArcRef.current.style.strokeDashoffset = String(194.8 * (1 - p))
      if (barRef.current) barRef.current.style.width = `${p * 100}%`
    }

    const io = new IntersectionObserver(
      (e) => {
        visible = e[0].isIntersecting
        if (visible) start()
      },
      { rootMargin: "100% 0px" },
    )
    io.observe(section)
    window.addEventListener("scroll", measure, { passive: true })
    window.addEventListener("resize", fit)
    fit()
    measure()
    raf = requestAnimationFrame(loop)
    return () => {
      disposed = true
      io.disconnect()
      cancelAnimationFrame(raf)
      window.removeEventListener("scroll", measure)
      window.removeEventListener("resize", fit)
    }
  }, [])

  const zone = KEY_ORDER[STOPS[stop]] ?? null
  useEffect(() => {
    if (zone) noteZone(zone)
  }, [zone])

  const chooseVeh = (v: VehicleKey) => {
    setVeh(v)
    try {
      window.localStorage.setItem("clz-veh", v)
    } catch {
      /* ignoré */
    }
  }

  // Glissement horizontal (téléphone) : pris seulement une fois clairement horizontal ; un geste
  // vertical reste au navigateur (`touch-action: pan-y`). Les clics restent aux boutons.
  const swipeHandlers = steps
    ? {
        onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
          dragRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, active: false, lastX: e.clientX, lastT: e.timeStamp, vx: 0 }
        },
        onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
          const d = dragRef.current
          if (!d || d.id !== e.pointerId) return
          const dx = e.clientX - d.x
          if (!d.active) {
            if (Math.abs(dx) < 8) return
            if (Math.abs(e.clientY - d.y) > Math.abs(dx)) {
              dragRef.current = null
              return
            }
            d.active = true
            navRef.current.dragging = true
            try {
              e.currentTarget.setPointerCapture(e.pointerId)
            } catch {
              /* pointeur déjà relâché */
            }
          }
          const dt = e.timeStamp - d.lastT
          if (dt > 0) d.vx = (e.clientX - d.lastX) / dt
          d.lastX = e.clientX
          d.lastT = e.timeStamp
          navRef.current.pos = dragPosition(navRef.current.stop, dx, e.currentTarget.clientWidth, STOPS.length)
        },
        onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
          const d = dragRef.current
          dragRef.current = null
          navRef.current.dragging = false
          if (!d?.active) return
          goStop(releaseStop(navRef.current.stop, e.clientX - d.x, e.currentTarget.clientWidth, d.vx, STOPS.length))
        },
        onPointerCancel: () => {
          dragRef.current = null
          navRef.current.dragging = false
          goStop(navRef.current.stop)
        },
        onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
          if (e.key === "ArrowRight") goStop(stepTo(navRef.current.stop, 1, STOPS.length))
          else if (e.key === "ArrowLeft") goStop(stepTo(navRef.current.stop, -1, STOPS.length))
        },
      }
    : {}

  const step = zone ? STEPS.indexOf(zone) : -1
  const z = zone ? JOURNEY_ZONES[zone] : null
  const zf = zone ? zoneFormulas(zone) : []
  const best = zf.filter((k) => k !== "diamond").slice(-1)[0] ?? null
  const fromFilm = journey.origin?.kind === "film" ? journey.origin.step : null
  const finalOn = stop === LAST
  const F = JOURNEY_FORMULAS[form]
  const price = F.formula.prices[veh]
  const formZones = ZONE_KEYS.filter((k) => zoneFormulas(k).includes(form))

  return (
    <section
      ref={sectionRef}
      id={CLZ_VISIT_ANCHOR}
      className={steps ? "v3 v3-swipe" : "v3"}
      aria-label="Visite : ce que chaque formule traite, zone par zone"
    >
      <div className="v3-stage" {...swipeHandlers}>
        <canvas ref={canvasRef} id="v3-gl" aria-hidden="true" />
        <div className="v3-vig" />
        {loading && <div className="v3-load">Chargement de la voiture…</div>}
        <div className={stop === 0 ? "v3-intro" : "v3-intro off"} aria-hidden={stop !== 0}>
          <span className="clz-eyebrow">Visite</span>
          <h2 className="clz-display clz-h2">
            Ce qu&apos;on traite, <span className="clz-accent">zone par zone.</span>
          </h2>
          <p>
            {steps ? "Glissez vers la gauche" : "Faites défiler"} : on fait le tour de la voiture, on entre dans l&apos;habitacle, et chaque
            zone renvoie à la prestation en vidéo.
          </p>
          <div className="row">
            <button className="clz-btn clz-btn-primary" type="button" tabIndex={stop === 0 ? 0 : -1} onClick={() => goVisit("body", null)}>
              Commencer la visite {steps ? "→" : "↓"}
            </button>
            <a className="skip" href="#prestations" tabIndex={stop === 0 ? 0 : -1}>
              Passer la visite
            </a>
          </div>
        </div>
        <div className="v3-ring" aria-hidden="true">
          <svg viewBox="0 0 72 72">
            <circle cx="36" cy="36" r="31" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="2.5" />
            <circle ref={ringArcRef} cx="36" cy="36" r="31" fill="none" stroke="#0a84ff" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="194.8" strokeDashoffset="194.8" />
          </svg>
          <b ref={ringValRef}>0</b>
          <small>% de la visite</small>
        </div>
        {steps && (
          <nav className="v3-steps" aria-label="Étapes de la visite">
            <button type="button" aria-label="Étape précédente" disabled={stop === 0} onClick={() => goStop(stepTo(stop, -1, STOPS.length))}>
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <ol>
              {STOPS.map((k, i) => (
                <li key={k}>
                  <button type="button" aria-label={stopLabel(i)} aria-current={i === stop ? "step" : undefined} onClick={() => goStop(i)} />
                </li>
              ))}
            </ol>
            <button type="button" aria-label="Étape suivante" disabled={stop === LAST} onClick={() => goStop(stepTo(stop, 1, STOPS.length))}>
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </nav>
        )}
        <ol className="v3-rail" aria-label="Zones de la visite">
          {STEPS.map((k, i) => (
            <li key={k} className={i === step ? "on" : undefined}>
              <button type="button" className="v3-link" style={{ color: "inherit" }} onClick={() => goVisit(k, journey.origin)}>
                {JOURNEY_ZONES[k].name}
              </button>
            </li>
          ))}
        </ol>

        <article key={zone ?? "none"} className={`v3-card clz-card ${z ? "in" : "off"}`} aria-live="polite">
          {z && zone && (
            <>
              {fromFilm && (
                <button type="button" className="v3-link v3-back" onClick={() => goFilm(fromFilm, null)}>
                  ← Retour à la vidéo
                </button>
              )}
              <span className="clz-rule" />
              <div className="v3-num">
                Zone {String(step + 1).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")}
              </div>
              <h3 className="clz-display clz-h3">{z.title}</h3>
              {z.description && <p className="v3-desc">{z.description}</p>}
              <ul className="v3-list">
                {zf.map((k) => (
                  <li key={k} className={k === "diamond" ? "dia" : undefined}>
                    <b>{JOURNEY_FORMULAS[k].name}</b>
                    <span>{z.formulas[k]}</span>
                  </li>
                ))}
                {z.options.map((o) => (
                  <li key={o.label}>
                    <b>Option</b>
                    <span>
                      {o.label} · {o.price}
                    </span>
                  </li>
                ))}
              </ul>
              {best && (
                <Link className="v3-more" href={JOURNEY_FORMULAS[best].href}>
                  Voir la formule {JOURNEY_FORMULAS[best].full} →
                </Link>
              )}
              <div className="v3-actions">
                {z.film && (
                  <button type="button" className="clz-btn" onClick={() => goFilm(z.film!, { kind: "visit", zone })}>
                    ▶ Voir la prestation en vidéo
                  </button>
                )}
                <Link className="clz-btn clz-btn-primary" href={zoneAction(zone).href}>
                  {zoneAction(zone).label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </>
          )}
        </article>

        <div className={finalOn ? "v3-final on" : "v3-final"} aria-hidden={!finalOn}>
          <h2 className="clz-display clz-h2">
            Choisissez <span className="clz-accent">votre formule.</span>
          </h2>
          {FORM_GROUPS.map((g) => (
            <div className="v3-fgroup" key={g.side}>
              <span>{g.label}</span>
              <div className="forms" role="group" aria-label={`Formules ${g.label.toLowerCase()}`}>
                {(Object.keys(JOURNEY_FORMULAS) as FormulaRef[])
                  .filter((k) => JOURNEY_FORMULAS[k].side === g.side)
                  .map((k) => (
                    <button key={k} type="button" aria-pressed={form === k} tabIndex={finalOn ? 0 : -1} onClick={() => setForm(k)}>
                      {JOURNEY_FORMULAS[k].name}
                    </button>
                  ))}
              </div>
            </div>
          ))}
          <div className="v3-veh" role="group" aria-label="Type de véhicule">
            {VEHICLES.map((v) => (
              <button key={v.key} type="button" aria-pressed={veh === v.key} tabIndex={finalOn ? 0 : -1} onClick={() => chooseVeh(v.key)}>
                {v.label}
              </button>
            ))}
          </div>
          <div className="v3-fbox">
            <div className="pr">{price == null ? "Sur devis" : `${price} €`}</div>
            <div className="tx">
              <b>{F.full}</b>
              <div className="v3-zones" aria-label="Zones traitées">
                {formZones.map((k) => (
                  <button key={k} type="button" tabIndex={finalOn ? 0 : -1} onClick={() => goVisit(k, { kind: "visit", zone: "final" })}>
                    {JOURNEY_ZONES[k].name}
                  </button>
                ))}
              </div>
              {F.note && <span className="v3-opt">{F.note}</span>}
            </div>
            <button type="button" className="clz-btn" tabIndex={finalOn ? 0 : -1} onClick={() => goFilm(F.film, { kind: "visit", zone: "final" })}>
              ▶ En vidéo
            </button>
            {F.href !== F.action.href && (
              <Link className="clz-btn" href={F.href} tabIndex={finalOn ? 0 : -1}>
                Voir la formule
              </Link>
            )}
            <Link className="clz-btn clz-btn-primary" href={F.action.href} tabIndex={finalOn ? 0 : -1}>
              {F.action.label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
        <div className="v3-bar">
          <i ref={barRef} />
        </div>
      </div>
    </section>
  )
}
