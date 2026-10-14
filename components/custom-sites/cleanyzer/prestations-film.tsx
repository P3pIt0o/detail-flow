"use client"

/**
 * PRESTATIONS AU DÉFILEMENT — CLEANYZER (scopé `.cleanyzer`, aucun autre tenant).
 *
 * Six étapes ; chacune fait défiler au scroll une vraie vidéo de Tom (découpée
 * en bandes de 8 images 720×1280 dans /public/custom-sites/cleanyzer/film) et
 * affiche la formule réelle qui la comprend.
 *
 * DONNÉES : tous les tarifs viennent de `content.ts` (cahier Tom), par clé de
 * formule. Aucun prix n'est écrit dans ce fichier. Prix `null` => « Sur devis ».
 * Nettoyage moteur : absent du cahier => « Sur demande » (à confirmer par Tom).
 *
 * PERF : les images ne se chargent que lorsque la section approche de l'écran
 * (aucun impact sur le chargement initial de l'accueil). Sans JS, la première
 * étape reste lisible ; avec prefers-reduced-motion, plus aucune transition.
 */

import { useEffect, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { EXTERIEUR_FORMULAS, INTERIEUR_FORMULAS, INTERIEUR_OPTIONS, VEHICLES, type Formula, type VehicleKey } from "./content"
import { CLZ_BOOKING_HREF, CLZ_DEMANDE_HREF } from "./tokens"
import "./prestations-film.css"

const FILM_BASE = "/custom-sites/cleanyzer/film"
const FRAME_W = 720
const FRAME_H = 1280
const PER_STRIP = 8
/** Hauteur de défilement par étape (en vh). */
const STEP_VH = 160

type Row = { label: string; detail: string; formula?: Formula; fixed?: string }
type Step = { clip: string; strips: number; tag: string; title: ReactNode; text: string; rows: Row[] }

const byKey = (list: Formula[], key: string) => list.find((f) => f.key === key)
const EXT = (key: string) => byKey(EXTERIEUR_FORMULAS, key)
const INT = (key: string) => byKey(INTERIEUR_FORMULAS, key)

const STEPS: Step[] = [
  {
    clip: "mousse",
    strips: 8,
    tag: "Extérieur",
    title: <>Lavage <span className="clz-accent">extérieur</span></>,
    text: "Lavage complet de la carrosserie et des roues, séchage à la main, brillant pneus.",
    rows: [
      { label: "Éco extérieur", detail: "Carrosserie, roues, séchage à la main, brillant pneus", formula: EXT("eco") },
      { label: "Excellence extérieur", detail: "+ jantes approfondies, détails au pinceau, double séchage", formula: EXT("excellence") },
    ],
  },
  {
    clip: "tapis",
    strips: 6,
    tag: "Intérieur",
    title: <>Tapis &amp; <span className="clz-accent">moquettes</span></>,
    text: "Chaque tapis est brossé à la main, puis traité selon la formule choisie.",
    rows: [
      { label: "Premium", detail: "Tapis compris", formula: INT("premium") },
      { label: "Excellence", detail: "Shampoing et traitement des tapis", formula: INT("excellence") },
      { label: "Shampoing des moquettes", detail: "Option", fixed: `${INTERIEUR_OPTIONS.find((o) => o.key === "shampoing-moquettes")?.price} €` },
    ],
  },
  {
    clip: "audi",
    strips: 6,
    tag: "Intérieur",
    title: <>L&apos;habitacle, <span className="clz-accent">en entier</span></>,
    text: "Aspiration complète de l'habitacle et du coffre, plastiques, tableau de bord, portières, seuils, volant, commandes et vitres intérieures.",
    rows: [
      { label: "Premium", detail: "Habitacle complet + coffre", formula: INT("premium") },
      { label: "Éco intérieur", detail: "Aspiration, dépoussiérage, plastiques · après une 1re intervention", formula: INT("eco") },
    ],
  },
  {
    clip: "volant",
    strips: 4,
    tag: "Intérieur",
    title: <>Sièges, désinfection, <span className="clz-accent">anti-UV</span></>,
    text: "Tout le Premium, plus shampoing des sièges et des tapis, désinfection complète, traitement anti-UV des plastiques et des odeurs tenaces.",
    rows: [{ label: "Excellence", detail: "Le nettoyage intérieur le plus complet", formula: INT("excellence") }],
  },
  {
    clip: "moteur",
    strips: 5,
    tag: "Option",
    title: <>Compartiment <span className="clz-accent">moteur</span></>,
    text: "Nettoyage du compartiment moteur, en complément d'une formule extérieure.",
    rows: [{ label: "Nettoyage du compartiment moteur", detail: "Option extérieure", fixed: "Sur demande" }],
  },
  {
    clip: "macan",
    strips: 6,
    tag: "Sur mesure",
    title: <>Diamond, <span className="clz-accent">sur mesure</span></>,
    text: "Une prestation entièrement personnalisée selon le véhicule, son état et vos besoins, à l'intérieur, à l'extérieur ou les deux.",
    rows: [{ label: "Diamond", detail: "Tarif établi après votre demande", formula: INT("diamond") }],
  },
]

function priceOf(row: Row, veh: VehicleKey): string {
  if (row.fixed) return row.fixed
  const p = row.formula?.prices[veh]
  return p == null ? "Sur devis" : `${p} €`
}

export function PrestationsFilm() {
  const [veh, setVeh] = useState<VehicleKey>("citadine")
  const [active, setActive] = useState(0)
  const sectionRef = useRef<HTMLElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const barsRef = useRef<(HTMLSpanElement | null)[]>([])

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("clz-veh")
      if (saved === "citadine" || saved === "berline" || saved === "suv") setVeh(saved)
    } catch {
      /* stockage indisponible : valeur par défaut */
    }
  }, [])

  useEffect(() => {
    const section = sectionRef.current
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!section || !canvas || !ctx) return

    const strips: Record<string, (HTMLImageElement | undefined)[]> = {}
    for (const s of STEPS) strips[s.clip] = new Array(s.strips)
    let cur = 0
    let prog = 0
    let raf = 0
    let started = false
    let disposed = false

    const frameAt = (clip: string, i: number) => {
      const list = strips[clip]
      const k = Math.floor(i / PER_STRIP)
      if (list[k]) return { img: list[k]!, y: (i % PER_STRIP) * FRAME_H }
      for (let j = k - 1; j >= 0; j--) if (list[j]) return { img: list[j]!, y: (PER_STRIP - 1) * FRAME_H }
      return null
    }
    const paint = (f: { img: HTMLImageElement; y: number } | null, alpha: number) => {
      if (!f) return
      const W = canvas.width
      const H = canvas.height
      const sc = Math.max(W / FRAME_W, H / FRAME_H)
      const dw = FRAME_W * sc
      const dh = FRAME_H * sc
      ctx.globalAlpha = alpha
      ctx.drawImage(f.img, 0, f.y, FRAME_W, FRAME_H, (W - dw) / 2, (H - dh) / 2, dw, dh)
      ctx.globalAlpha = 1
    }
    const draw = () => {
      const s = STEPS[cur]
      const n = s.strips * PER_STRIP
      ctx.fillStyle = "#05070d"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      paint(frameAt(s.clip, Math.min(n - 1, Math.round(prog * (n - 1)))), 1)
      // Fondu vers l'étape suivante sur les derniers 12 %.
      if (prog > 0.88 && cur < STEPS.length - 1) paint(frameAt(STEPS[cur + 1].clip, 0), (prog - 0.88) / 0.12)
    }

    // Chargement progressif, dans l'ordre de lecture, 3 requêtes en parallèle.
    const queue: [string, number][] = STEPS.flatMap((s) => Array.from({ length: s.strips }, (_, k) => [s.clip, k] as [string, number]))
    const loadNext = () => {
      const q = queue.shift()
      if (!q || disposed) return
      const img = new Image()
      img.decoding = "async"
      img.onload = () => {
        if (disposed) return
        strips[q[0]][q[1]] = img
        if (q[0] === STEPS[cur].clip) draw()
        loadNext()
      }
      img.onerror = () => loadNext()
      img.src = `${FILM_BASE}/${q[0]}_${q[1] + 1}.webp`
    }
    const start = () => {
      if (started) return
      started = true
      loadNext()
      loadNext()
      loadNext()
    }

    const fit = () => {
      const r = canvas.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.max(1, Math.round(r.width * dpr))
      canvas.height = Math.max(1, Math.round(r.height * dpr))
      draw()
    }
    const update = () => {
      raf = 0
      const r = section.getBoundingClientRect()
      const span = section.offsetHeight - window.innerHeight
      const p = (Math.min(1, Math.max(0, -r.top / Math.max(1, span)))) * STEPS.length
      const c = Math.min(STEPS.length - 1, Math.floor(p))
      prog = Math.min(1, p - c)
      if (c !== cur) {
        cur = c
        setActive(c)
      }
      barsRef.current.forEach((b, j) => {
        if (b) b.style.transform = `scaleX(${j < cur ? 1 : j === cur ? prog : 0})`
      })
      draw()
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    const onResize = () => {
      fit()
      onScroll()
    }

    const io =
      "IntersectionObserver" in window
        ? new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && start(), { rootMargin: "800px 0px" })
        : null
    if (io) io.observe(section)
    else start()

    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onResize)
    fit()
    update()
    return () => {
      disposed = true
      io?.disconnect()
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onResize)
    }
  }, [])

  const chooseVeh = (v: VehicleKey) => {
    setVeh(v)
    try {
      window.localStorage.setItem("clz-veh", v)
    } catch {
      /* ignoré */
    }
  }

  return (
    <div className="clz-film-root clz-dark-strong">
      <div className="mx-auto max-w-6xl px-4 pt-20 md:px-6 md:pt-28">
        <span className="clz-eyebrow">Prestations en images</span>
        <h2 className="clz-display clz-h2 mt-3 max-w-2xl text-balance text-white">
          Chaque étape, <span className="clz-accent">filmée chez nos clients</span>
        </h2>
        <p className="mt-4 max-w-2xl text-pretty leading-relaxed text-[var(--clz-on-dark-muted)]">
          Faites défiler : chaque étape montre une vraie intervention CLEANYZER et la formule qui la comprend.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <span id="clz-film-veh" className="text-sm text-[var(--clz-on-dark-muted)]">
            Tarifs affichés pour :
          </span>
          <div className="clz-film-seg" role="group" aria-labelledby="clz-film-veh">
            {VEHICLES.map((v) => (
              <button key={v.key} type="button" aria-pressed={veh === v.key} onClick={() => chooseVeh(v.key)}>
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <section
        ref={sectionRef}
        className="clz-film"
        style={{ height: `${STEPS.length * STEP_VH + 100}vh` }}
        aria-label="Les prestations CLEANYZER en images"
      >
        <div className="clz-film-stage">
          <div className="clz-film-cards">
            {STEPS.map((s, i) => (
              <article key={s.clip} className={`clz-film-card${i === active ? " is-on" : ""}`} aria-hidden={i !== active}>
                <span className="clz-film-num">
                  {String(i + 1).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")}
                </span>
                <span className="clz-film-tag">{s.tag}</span>
                <h3 className="clz-display clz-film-title">{s.title}</h3>
                <p className="clz-film-text">{s.text}</p>
                <div className="clz-film-rows">
                  {s.rows.map((r) => {
                    const price = priceOf(r, veh)
                    return (
                      <div key={r.label} className="clz-film-row">
                        <div>
                          <b>{r.label}</b>
                          <small>{r.detail}</small>
                        </div>
                        <span className={/€/.test(price) ? "clz-film-price" : "clz-film-price is-text"}>{price}</span>
                      </div>
                    )
                  })}
                </div>
                <Link
                  href={s.clip === "macan" || s.clip === "moteur" ? CLZ_DEMANDE_HREF : CLZ_BOOKING_HREF}
                  className="clz-btn clz-btn-primary clz-film-cta"
                  tabIndex={i === active ? 0 : -1}
                >
                  {s.clip === "macan" || s.clip === "moteur" ? "Faire une demande" : "Réserver"}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </article>
            ))}
          </div>
          <div className="clz-film-frame">
            <canvas ref={canvasRef} aria-hidden="true" />
          </div>
          <div className="clz-film-rail" aria-hidden="true">
            {STEPS.map((s, i) => (
              <b key={s.clip}>
                <span ref={(el) => { barsRef.current[i] = el }} />
              </b>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
