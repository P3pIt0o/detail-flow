"use client"

/**
 * PRESTATIONS EN IMAGES — CLEANYZER (scopé `.cleanyzer`, aucun autre tenant).
 *
 * Huit étapes (L55) ; chacune montre une vraie vidéo (découpée en bandes de 8
 * images 720×1280 dans /public/custom-sites/cleanyzer/film) et la formule réelle
 * qui la comprend. L66 : slider (flèches, points, glissement, clavier) ; la vidéo
 * de l'étape affichée se joue en boucle, la page n'est plus retenue au défilement.
 *
 * DONNÉES : tous les tarifs viennent de `content.ts` (cahier Tom), par clé de
 * formule. Aucun prix n'est écrit dans ce fichier. Prix `null` => « Sur devis ».
 * Nettoyage moteur : absent du cahier => « Sur demande » (à confirmer par Tom).
 *
 * PERF : les images ne se chargent que lorsque la section approche de l'écran
 * (aucun impact sur le chargement initial de l'accueil). Sans JS, la première
 * étape reste lisible ; mouvement réduit / économie de données : image fixe.
 */

import { useEffect, useRef, useState, type ReactNode } from "react"
import { ClzLink as Link, useClzBase } from "./clz-link"
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react"
import { EXTERIEUR_FORMULAS, EXTERIEUR_OPTIONS, INTERIEUR_FORMULAS, INTERIEUR_OPTIONS, VEHICLES, type Formula, type VehicleKey } from "./content"
import { CLZ_FILM_ANCHOR, FILM_SEQUENCES, JOURNEY_ZONES, filmIndex, type FilmStepId, type ZoneKey } from "./journey"
import { goFilm, goVisit, noteStep, registerFilm, useJourney } from "./journey-nav"
import { clzHref, clzPath } from "./tokens"
import { clzNeedsReveal, visitIsStill } from "./visit-video"
import { releaseStop, stepTo } from "./visit-3d-swipe"
import "./prestations-film.css"

const FILM_BASE = "/custom-sites/cleanyzer/film"
const FRAME_W = 720
const FRAME_H = 1280
const PER_STRIP = 8
/** Cadence de lecture en boucle de la vidéo de l'étape affichée (images / s). */
export const FILM_FPS = 12

/** Image à afficher après `elapsedMs` de lecture en boucle (0 = image fixe si mouvement réduit). */
export function filmFrameAt(elapsedMs: number, frames: number, still: boolean): number {
  if (still || frames <= 0 || elapsedMs <= 0) return 0
  return Math.floor((elapsedMs * FILM_FPS) / 1000) % frames
}

type Row = { label: string; detail: string; formula?: Formula; fixed?: string }
type Seq = (typeof FILM_SEQUENCES)[number]
type Step = Seq & { tag: string; title: ReactNode; text: string; rows: Row[] }
const seq = (id: FilmStepId): Seq => FILM_SEQUENCES[filmIndex(id)]

const byKey = (list: Formula[], key: string) => list.find((f) => f.key === key)
const EXT = (key: string) => byKey(EXTERIEUR_FORMULAS, key)
const INT = (key: string) => byKey(INTERIEUR_FORMULAS, key)

const STEPS: Step[] = [
  {
    ...seq("exterieur"),
    tag: "Extérieur",
    title: <>Lavage <span className="clz-accent">extérieur</span></>,
    text: "Lavage complet de la carrosserie et des roues, séchage à la main, brillant pneus.",
    rows: [
      { label: "Éco extérieur", detail: "Carrosserie, roues, séchage à la main, brillant pneus", formula: EXT("eco") },
      { label: "Excellence extérieur", detail: "+ jantes approfondies, détails au pinceau, double séchage", formula: EXT("excellence") },
    ],
  },
  // L55 : textes repris de la zone « Jantes » et de la ligne Excellence extérieur ci-dessus.
  {
    ...seq("jantes"),
    tag: "Extérieur",
    title: <span className="clz-accent">{JOURNEY_ZONES.rims.title}</span>,
    text: `${JOURNEY_ZONES.rims.formulas.exc_ext}.`,
    rows: [{ label: "Excellence extérieur", detail: "+ jantes approfondies, détails au pinceau, double séchage", formula: EXT("excellence") }],
  },
  // L55 : textes repris de la zone « Optiques » (option extérieure, page dédiée).
  {
    ...seq("optiques"),
    tag: "Option",
    title: <>Rénovation des <span className="clz-accent">optiques</span></>,
    text: JOURNEY_ZONES.optics.description ?? "",
    rows: [{ label: "Rénovation optiques de phares", detail: "Option extérieure", fixed: `${EXTERIEUR_OPTIONS.find((o) => o.key === "renovation-optiques")?.price} €` }],
  },
  {
    ...seq("habitacle"),
    tag: "Intérieur",
    title: <>L&apos;habitacle, <span className="clz-accent">en entier</span></>,
    text: "Aspiration complète de l'habitacle et du coffre, plastiques, tableau de bord, portières, seuils, volant, commandes et vitres intérieures.",
    rows: [
      { label: "Premium", detail: "Habitacle complet + coffre", formula: INT("premium") },
      { label: "Éco intérieur", detail: "Aspiration, dépoussiérage, plastiques · après une 1re intervention", formula: INT("eco") },
    ],
  },
  {
    ...seq("sieges"),
    tag: "Intérieur",
    title: <>Sièges, désinfection, <span className="clz-accent">anti-UV</span></>,
    text: "Tout le Premium, plus shampoing des sièges et des tapis, désinfection complète, traitement anti-UV des plastiques et des odeurs tenaces.",
    rows: [{ label: "Excellence", detail: "Le nettoyage intérieur le plus complet", formula: INT("excellence") }],
  },
  {
    ...seq("tapis"),
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
    ...seq("moteur"),
    tag: "Option",
    title: <>Compartiment <span className="clz-accent">moteur</span></>,
    text: "Nettoyage du compartiment moteur, en complément d'une formule extérieure.",
    rows: [{ label: "Nettoyage du compartiment moteur", detail: "Option extérieure", fixed: "Sur demande" }],
  },
  {
    ...seq("diamond"),
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
  // Étape affichée, lue par la boucle de lecture sans rendu React.
  const curRef = useRef(0)
  const dragRef = useRef<{ id: number; x: number; y: number; active: boolean; lastX: number; lastT: number; vx: number } | null>(null)

  const goStep = (i: number) => {
    const n = stepTo(i, 0, STEPS.length)
    curRef.current = n
    setActive(n)
    noteStep(STEPS[n].id)
  }

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
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
    const still = visitIsStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches, Boolean(conn?.saveData))
    let raf = 0
    let started = false
    let disposed = false
    let visible = false
    let shown = -1
    let lastFrame = -1
    let t0 = 0

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
    const draw = (frame: number) => {
      ctx.fillStyle = "#05070d"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      paint(frameAt(STEPS[curRef.current].clip, frame), 1)
    }

    // Chargement progressif, 3 requêtes en parallèle : l'étape affichée d'abord, puis l'ordre des étapes.
    // Image fixe : seule la première bande de chaque étape.
    const queue: [string, number][] = STEPS.flatMap((s) =>
      Array.from({ length: still ? 1 : s.strips }, (_, k) => [s.clip, k] as [string, number]),
    )
    const loadNext = () => {
      if (disposed || !queue.length) return
      const k = queue.findIndex((x) => x[0] === STEPS[curRef.current].clip)
      const q = queue.splice(Math.max(0, k), 1)[0]
      const img = new Image()
      img.decoding = "async"
      img.onload = () => {
        if (disposed) return
        strips[q[0]][q[1]] = img
        lastFrame = -1 // redessine avec la nouvelle bande
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
      lastFrame = -1
    }

    // Lecture en boucle de l'étape affichée, seulement quand la section est proche de l'écran.
    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop)
      if (!visible) return
      const c = curRef.current
      if (c !== shown) {
        shown = c
        t0 = ts
        lastFrame = -1
      }
      const f = filmFrameAt(ts - t0, STEPS[c].strips * PER_STRIP, still)
      if (f === lastFrame) return
      lastFrame = f
      draw(f)
    }

    const io =
      "IntersectionObserver" in window
        ? new IntersectionObserver(
            (entries) => {
              visible = entries.some((e) => e.isIntersecting)
              if (visible) start()
            },
            { rootMargin: "800px 0px" },
          )
        : null
    if (io) io.observe(section)
    else {
      visible = true
      start()
    }

    window.addEventListener("resize", fit)
    fit()
    raf = requestAnimationFrame(loop)

    // Ouvre la séquence exacte ; la page ne défile que si la section n'est pas déjà à l'écran.
    const unregister = registerFilm((id) => {
      start()
      goStep(Math.max(0, filmIndex(id)))
      const r = section.getBoundingClientRect()
      if (!clzNeedsReveal(r.top, r.bottom, window.innerHeight)) return
      section.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })
    })

    // Lien profond depuis une page de prestation : #video=<étape>&from=<slug> ou #zone=<zone>&from=<slug>.
    const params = new URLSearchParams(window.location.hash.slice(1))
    const from = params.get("from")
    const origin = from ? ({ kind: "page", slug: from } as const) : null
    const video = params.get("video") as FilmStepId | null
    const zoneParam = params.get("zone") as ZoneKey | null
    const deepLink = window.setTimeout(() => {
      if (video && filmIndex(video) >= 0) goFilm(video, origin)
      else if (zoneParam && zoneParam in JOURNEY_ZONES) goVisit(zoneParam, origin)
    }, 150)

    return () => {
      disposed = true
      unregister()
      window.clearTimeout(deepLink)
      io?.disconnect()
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", fit)
    }
  }, [])

  // Glissement horizontal (doigt ou souris) : pris seulement une fois clairement horizontal ; un geste
  // vertical reste au navigateur (`touch-action: pan-y`). Clavier : flèches gauche / droite.
  const stageHandlers = {
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
    },
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
      const d = dragRef.current
      dragRef.current = null
      if (!d?.active) return
      const next = releaseStop(curRef.current, e.clientX - d.x, e.currentTarget.clientWidth, d.vx, STEPS.length)
      if (next !== curRef.current) goStep(next)
    },
    onPointerCancel: () => {
      dragRef.current = null
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "ArrowRight") goStep(curRef.current + 1)
      else if (e.key === "ArrowLeft") goStep(curRef.current - 1)
    },
  }

  const journey = useJourney()
  const base = useClzBase()
  const o = journey.origin
  const back =
    o?.kind === "visit"
      ? {
          label: o.zone === "final" ? "Retour au choix de formule" : `Retour à la zone ${JOURNEY_ZONES[o.zone].name.toLowerCase()}`,
          go: () => goVisit(o.zone, { kind: "film", step: STEPS[active].id }),
        }
      : o?.kind === "page"
        ? { label: "Retour à la prestation", go: () => window.location.assign(clzHref(clzPath(`/prestations/${o.slug}`), base)) }
        : null

  const chooseVeh = (v: VehicleKey) => {
    setVeh(v)
    try {
      window.localStorage.setItem("clz-veh", v)
    } catch {
      /* ignoré */
    }
  }

  return (
    <div className="clz-film-root clz-dark-strong" id={CLZ_FILM_ANCHOR}>
      <div className="mx-auto max-w-6xl px-4 pt-20 md:px-6 md:pt-28">
        <span className="clz-eyebrow">Prestations en images</span>
        <h2 className="clz-display clz-h2 mt-3 max-w-2xl text-balance text-white">
          Chaque étape, <span className="clz-accent">filmée chez nos clients</span>
        </h2>
        <p className="mt-4 max-w-2xl text-pretty leading-relaxed text-[var(--clz-on-dark-muted)]">
          Glissez ou utilisez les flèches : chaque étape montre une vraie intervention CLEANYZER et la formule qui la comprend.
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

      <section ref={sectionRef} className="clz-film" aria-label="Les prestations CLEANYZER en images">
        <div
          className="clz-film-stage"
          tabIndex={0}
          aria-roledescription="carrousel"
          aria-label="Étapes filmées : flèches gauche et droite pour changer d'étape"
          {...stageHandlers}
        >
          <div className="clz-film-cards">
            {STEPS.map((s, i) => (
              <article key={s.clip} className={`clz-film-card${i === active ? " is-on" : ""}`} aria-hidden={i !== active} inert={i !== active}>
                {/* Numéro et rubrique : empilés sur ordinateur, sur une ligne sur téléphone (CSS). */}
                <div className="clz-film-head">
                  <span className="clz-film-num">
                    {String(i + 1).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")}
                  </span>
                  <span className="clz-film-tag">{s.tag}</span>
                </div>
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
                <Link href={s.action.href} className="clz-btn clz-btn-primary clz-film-cta" tabIndex={i === active ? 0 : -1}>
                  {s.action.label}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <div className="clz-film-actions">
                  <button
                    type="button"
                    className="clz-film-visit"
                    tabIndex={i === active ? 0 : -1}
                    onClick={() => goVisit(s.zone ?? "final", { kind: "film", step: s.id })}
                  >
                    {s.zone ? `Voir la zone ${JOURNEY_ZONES[s.zone].name.toLowerCase()} dans la visite` : "Choisir sa formule dans la visite"}
                  </button>
                  {back && (
                    <button type="button" className="clz-film-visit" tabIndex={i === active ? 0 : -1} onClick={back.go}>
                      ← {back.label}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
          <div className="clz-film-frame">
            <canvas ref={canvasRef} aria-hidden="true" />
          </div>
          <nav className="clz-film-nav" aria-label="Étapes du film">
            <button type="button" className="clz-film-arrow" aria-label="Étape précédente" disabled={active === 0} onClick={() => goStep(active - 1)}>
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <ol>
              {STEPS.map((s, i) => (
                <li key={s.clip}>
                  <button
                    type="button"
                    className="clz-film-dot"
                    aria-label={`Étape ${i + 1} sur ${STEPS.length} : ${s.tag}`}
                    aria-current={i === active ? "step" : undefined}
                    onClick={() => goStep(i)}
                  />
                </li>
              ))}
            </ol>
            <button
              type="button"
              className="clz-film-arrow"
              aria-label="Étape suivante"
              disabled={active === STEPS.length - 1}
              onClick={() => goStep(active + 1)}
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </nav>
        </div>
      </section>
    </div>
  )
}
