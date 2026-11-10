"use client"

/**
 * VISITE EN VIDÉO CLEANYZER (L38) : remplace la visite 3D, même ancre (`CLZ_VISIT_ANCHOR`).
 * 6 chapitres ; données et prix lus dans `journey.ts` (prix = `content.ts`), aucun prix ici.
 * - Ordinateur : onglets en haut, vidéo 16:9 à gauche, panneau à droite (clic + clavier).
 * - Téléphone (≤ 768 px) : cartes en défilement horizontal accroché, vidéo verticale, points.
 * - Lecture : seule la vidéo du chapitre actif joue, et seulement quand la section est à l'écran.
 *   Aucune source au rendu serveur. Mouvement réduit ou économie de données : affiche + bouton lecture.
 */

import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import Link from "next/link"
import { ArrowRight, Play } from "lucide-react"
import { VEHICLES, type VehicleKey } from "./content"
import { heroVideoQuality } from "./hero"
import { CLZ_VISIT_ANCHOR, JOURNEY_FORMULAS, JOURNEY_ZONES, zoneAction, type FormulaRef, type ZoneKey } from "./journey"
import { goFilm, registerVisit, useJourney } from "./journey-nav"
import "./visit-video.css"

const BASE = "/custom-sites/cleanyzer"
type Q = "pc" | "tel"
type Media =
  | { kind: "video"; src: Record<Q, string>; poster: Record<Q, string> }
  | { kind: "image"; src: string; alt: string }
  | null
export type VisitChapter = { id: string; label: string; zones: ZoneKey[]; media: Media }

const visite = (n: string): Media => ({
  kind: "video",
  src: { pc: `${BASE}/visite/${n}-pc.mp4`, tel: `${BASE}/visite/${n}-tel.mp4` },
  poster: { pc: `${BASE}/visite/${n}-pc-poster.webp`, tel: `${BASE}/visite/${n}-tel-poster.webp` },
})
const ARRIVEE_POSTER = `${BASE}/neon/hero-arrivee-poster.webp`

export const CLZ_VISIT_CHAPTERS: VisitChapter[] = [
  { id: "habitacle", label: "Habitacle", zones: ["vents", "seats", "leather", "mats"], media: visite("interieur") },
  {
    id: "carrosserie",
    label: "Carrosserie",
    zones: ["body"],
    media: {
      kind: "video",
      src: { pc: `${BASE}/neon/hero-arrivee-1080.mp4`, tel: `${BASE}/neon/hero-arrivee-720.mp4` },
      poster: { pc: ARRIVEE_POSTER, tel: ARRIVEE_POSTER },
    },
  },
  { id: "jantes", label: "Jantes", zones: ["rims"], media: visite("jantes") },
  { id: "optiques", label: "Optiques", zones: ["optics"], media: visite("optiques") },
  // Bande de 8 images verticales : recadrée en CSS sur la première.
  { id: "moteur", label: "Moteur", zones: ["engine"], media: { kind: "image", src: `${BASE}/film/moteur_3.webp`, alt: "Compartiment moteur nettoyé par CLEANYZER" } },
  { id: "formule", label: "Choisir ma formule", zones: [], media: null },
]
const FINAL = CLZ_VISIT_CHAPTERS.length - 1

export function chapterForZone(zone: ZoneKey | "final") {
  if (zone === "final") return FINAL
  return Math.max(0, CLZ_VISIT_CHAPTERS.findIndex((c) => c.zones.includes(zone)))
}

/** Index de la seule vidéo qui doit jouer, ou `null`. */
export function playingChapter(active: number, inView: boolean, allowed: boolean): number | null {
  return inView && allowed && CLZ_VISIT_CHAPTERS[active]?.media?.kind === "video" ? active : null
}

export function visitVideoSrc(chapter: VisitChapter, width: number, reducedMotion = false, saveData = false): string | null {
  if (reducedMotion || saveData || chapter.media?.kind !== "video") return null
  return chapter.media.src[heroVideoQuality(width) === "720" ? "tel" : "pc"]
}

const FORM_GROUPS: { label: string; side: "int" | "ext" | "both" }[] = [
  { label: "Intérieur", side: "int" },
  { label: "Extérieur", side: "ext" },
  { label: "Sur mesure", side: "both" },
]
const MOBILE_MQ = "(max-width: 768px)"
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches

export function ClzVisitVideo() {
  const sectionRef = useRef<HTMLElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([])
  const videosRef = useRef<(HTMLVideoElement | null)[]>([])
  const [active, setActive] = useState(0)
  const [inView, setInView] = useState(false)
  // Lecture automatique permise (pas de mouvement réduit ni d'économie de données) ; sinon lancée au clic.
  const [allowed, setAllowed] = useState(false)
  const [manual, setManual] = useState<number | null>(null)
  const [q, setQ] = useState<Q>("tel")
  const [veh, setVeh] = useState<VehicleKey>(VEHICLES[0].key)
  const journey = useJourney()
  const fromFilm = journey.origin?.kind === "film" ? journey.origin.step : null

  const scrollTrack = (i: number) => {
    const track = trackRef.current
    const card = track?.children[i] as HTMLElement | undefined
    if (!track || !card || !window.matchMedia(MOBILE_MQ).matches) return
    track.scrollTo({ left: card.offsetLeft - (track.children[0] as HTMLElement).offsetLeft, behavior: reducedMotion() ? "auto" : "smooth" })
  }
  const select = (i: number) => {
    setActive(i)
    scrollTrack(i)
  }

  useEffect(() => {
    const saveData = Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData)
    setAllowed(!reducedMotion() && !saveData)
    setQ(heroVideoQuality(window.innerWidth) === "720" ? "tel" : "pc")
    try {
      const saved = window.localStorage.getItem("clz-veh")
      if (saved === "citadine" || saved === "berline" || saved === "suv") setVeh(saved)
    } catch {
      /* valeur par défaut */
    }
    const section = sectionRef.current
    if (!section) return
    const io = new IntersectionObserver((e) => setInView(e[0].isIntersecting), { threshold: 0.25 })
    io.observe(section)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    return registerVisit((zone) => {
      select(chapterForZone(zone))
      sectionRef.current?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth" })
    })
  }, [])

  // Une seule vidéo joue ; la source n'est posée qu'au premier besoin.
  const playing = playingChapter(active, inView, allowed || manual === active)
  useEffect(() => {
    videosRef.current.forEach((v, i) => {
      if (!v) return
      if (i !== playing) return v.pause()
      if (!v.getAttribute("src")) {
        const src = visitVideoSrc(CLZ_VISIT_CHAPTERS[i], window.innerWidth)
        if (!src) return
        v.src = src
      }
      v.play().catch(() => setManual(null))
    })
  }, [playing])

  // Téléphone : le chapitre actif suit la carte visible dans la piste.
  const onTrackScroll = () => {
    const track = trackRef.current
    if (!track || track.children.length < 2) return
    const step = (track.children[1] as HTMLElement).offsetLeft - (track.children[0] as HTMLElement).offsetLeft
    if (step <= 0) return
    const i = Math.min(FINAL, Math.max(0, Math.round(track.scrollLeft / step)))
    setActive((a) => (a === i ? a : i))
  }

  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const n = CLZ_VISIT_CHAPTERS.length
    const next = { ArrowRight: (active + 1) % n, ArrowLeft: (active - 1 + n) % n, Home: 0, End: n - 1 }[e.key]
    if (next === undefined) return
    e.preventDefault()
    select(next)
    tabsRef.current[next]?.focus()
  }

  const chooseVeh = (v: VehicleKey) => {
    setVeh(v)
    try {
      window.localStorage.setItem("clz-veh", v)
    } catch {
      /* ignoré */
    }
  }

  return (
    <section ref={sectionRef} className="clz-neon-visit clz-vv" id={CLZ_VISIT_ANCHOR} aria-labelledby="clz-visit-title">
      <div className="clz-neon-wrap">
        <span className="clz-neon-eyebrow">Visite en vidéo</span>
        <h2 id="clz-visit-title" className="clz-neon-h2">
          Choisissez votre formule, <em>zone par zone.</em>
        </h2>
        <p className="clz-vv-sub">Regardez le travail sur chaque zone et découvrez ce que comprend chaque prestation.</p>

        <div className="clz-vv-tabs" role="tablist" aria-label="Chapitres de la visite" onKeyDown={onTabKey}>
          {CLZ_VISIT_CHAPTERS.map((c, i) => (
            <button
              key={c.id}
              ref={(el) => {
                tabsRef.current[i] = el
              }}
              type="button"
              role="tab"
              id={`clz-vv-tab-${c.id}`}
              aria-controls={`clz-vv-panel-${c.id}`}
              aria-selected={i === active}
              tabIndex={i === active ? 0 : -1}
              onClick={() => select(i)}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="clz-vv-track" ref={trackRef} onScroll={onTrackScroll}>
          {CLZ_VISIT_CHAPTERS.map((c, i) => {
            const m = c.media
            const single = c.zones.length === 1 ? JOURNEY_ZONES[c.zones[0]] : null
            const action = c.zones.length ? zoneAction(c.zones[0]) : null
            return (
              <article
                key={c.id}
                id={`clz-vv-panel-${c.id}`}
                role="tabpanel"
                aria-labelledby={`clz-vv-tab-${c.id}`}
                className={`clz-vv-card${i === active ? " is-on" : ""}${m ? "" : " is-final"}`}
              >
                {m?.kind === "video" && (
                  <div className="clz-vv-media">
                    <video
                      ref={(el) => {
                        videosRef.current[i] = el
                      }}
                      poster={m.poster[q]}
                      muted
                      playsInline
                      loop
                      preload="none"
                      aria-label={`Vidéo : ${c.label.toLowerCase()}`}
                    />
                    {playing !== i && !allowed && (
                      <button type="button" className="clz-vv-play" aria-label={`Lire la vidéo : ${c.label.toLowerCase()}`} onClick={() => (select(i), setManual(i))}>
                        <Play className="h-6 w-6" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                )}
                {m?.kind === "image" && (
                  <div className="clz-vv-media clz-vv-strip">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.src} alt={m.alt} loading="lazy" decoding="async" />
                  </div>
                )}

                <div className="clz-vv-panel">
                  {fromFilm && i === active && (
                    <button type="button" className="clz-vv-back" onClick={() => goFilm(fromFilm, null)}>
                      ← Retour à la vidéo
                    </button>
                  )}
                  {m ? (
                    <>
                      <h3>{single ? single.title : c.label}</h3>
                      {single?.description && <p className="clz-vv-desc">{single.description}</p>}
                      {c.zones.map((k) => {
                        const z = JOURNEY_ZONES[k]
                        return (
                          <div key={k}>
                            {!single && <h4>{z.title}</h4>}
                            <ul>
                              {(Object.keys(z.formulas) as FormulaRef[]).map((f) => (
                                <li key={f}>
                                  <b>{JOURNEY_FORMULAS[f].name}</b>
                                  <span>{z.formulas[f]}</span>
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
                          </div>
                        )
                      })}
                      {action && (
                        <Link className="clz-neon-btn clz-neon-btn-primary" href={action.href}>
                          {action.label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </Link>
                      )}
                    </>
                  ) : (
                    <>
                      <h3>{c.label}</h3>
                      <div className="clz-vv-veh" role="group" aria-label="Type de véhicule">
                        {VEHICLES.map((v) => (
                          <button key={v.key} type="button" aria-pressed={veh === v.key} onClick={() => chooseVeh(v.key)}>
                            {v.label}
                          </button>
                        ))}
                      </div>
                      {FORM_GROUPS.map((g) => (
                        <div key={g.side}>
                          <p className="clz-neon-eyebrow clz-vv-group">{g.label}</p>
                          <div className="clz-vv-forms">
                            {(Object.keys(JOURNEY_FORMULAS) as FormulaRef[])
                              .filter((k) => JOURNEY_FORMULAS[k].side === g.side)
                              .map((k) => {
                                const F = JOURNEY_FORMULAS[k]
                                const price = F.formula.prices[veh]
                                return (
                                  <div key={k} className="clz-vv-form">
                                    <b>{F.name}</b>
                                    <span className="clz-vv-price">{price == null ? "Sur devis" : `${price} €`}</span>
                                    {F.note && <small>{F.note}</small>}
                                    <Link className="clz-neon-btn clz-neon-btn-primary" href={F.action.href}>
                                      {F.action.label}
                                    </Link>
                                  </div>
                                )
                              })}
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </article>
            )
          })}
        </div>

        <div className="clz-vv-dots" aria-hidden="true">
          {CLZ_VISIT_CHAPTERS.map((c, i) => (
            <i key={c.id} className={i === active ? "on" : undefined} />
          ))}
        </div>
      </div>
    </section>
  )
}
