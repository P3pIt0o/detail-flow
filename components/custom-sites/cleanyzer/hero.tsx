"use client"

/**
 * HERO CLEANYZER « néon » (L35, maquette validée par Tom le 04/11/2026).
 * - Deux vidéos superposées : `hero-arrivee` joue une fois, puis `hero-boucle` (déjà chargée,
 *   arrêtée sur sa 1re image = dernière image de l'arrivée) démarre et l'arrivée se masque :
 *   aucun écran noir. 720p jusqu'à 760 px de large, 1080p au-delà. Vidéos muettes.
 * - Image LCP : poster de l'arrivée (`fetchpriority="high"`), affichée tout de suite ; les
 *   sources vidéo ne sont posées qu'après le montage.
 * - `prefers-reduced-motion` ou économie de données : aucune vidéo, la boucle reste sur son poster.
 * - Arrivée en erreur ou qui ne démarre pas : la boucle prend le relais (`runHeroSequence`).
 *
 * Preuve sociale Google : 5,0 — 92 avis (BRAND dans content.ts, relevé manuel). Ne pas modifier
 * sans instruction.
 */

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { BRAND } from "./content"
import { CLZ_BOOKING_HREF, CLZ_HOME_HREF } from "./tokens"

const NEON = "/custom-sites/cleanyzer/neon"
/** Largeur maximale (px) servie en 720p ; au-delà, 1080p. */
export const HERO_MOBILE_MAX = 760

export function heroVideoQuality(width: number): "720" | "1080" {
  return width <= HERO_MOBILE_MAX ? "720" : "1080"
}

/** Poster (L55) : 720 = portrait 720×1280 (téléphone), 1080 = paysage 1920×1080. */
export const heroPoster = (q: "720" | "1080") => `${NEON}/hero-poster-${q}.webp`

/** Sources des deux vidéos ; `null` (poster seul) si le mouvement est réduit ou en économie de données. */
export function heroVideoSources(
  width: number,
  reducedMotion: boolean,
  saveData = false,
): { arrivee: string; boucle: string } | null {
  if (reducedMotion || saveData) return null
  const q = heroVideoQuality(width)
  return { arrivee: `${NEON}/hero-arrivee-${q}.mp4`, boucle: `${NEON}/hero-boucle-${q}.mp4` }
}

/** Délai (ms) au-delà duquel une arrivée qui n'a jamais démarré laisse place à la boucle. */
export const HERO_INTRO_GUARD_MS = 4000

type HeroVideo = Pick<HTMLVideoElement, "play" | "currentTime" | "duration" | "addEventListener" | "removeEventListener">

/**
 * Enchaînement arrivée → boucle. La boucle démarre à la fin de l'arrivée, mais aussi si l'arrivée
 * échoue ou ne démarre jamais (délai de garde) ; si la boucle échoue à son tour : image fixe.
 * Jamais d'écran noir. Renvoie la fonction de nettoyage.
 */
export function runHeroSequence(
  intro: HeroVideo,
  loop: HeroVideo,
  onPhase: (phase: "loop" | "still") => void,
  { raf = requestAnimationFrame, guardMs = HERO_INTRO_GUARD_MS }: { raf?: (cb: FrameRequestCallback) => number; guardMs?: number } = {},
): () => void {
  let swapped = false
  let started = false
  let guard: ReturnType<typeof setTimeout> | undefined
  const toLoop = () => {
    if (swapped) return
    swapped = true
    clearTimeout(guard)
    loop.currentTime = 0
    loop.play().then(
      () => raf(() => onPhase("loop")),
      () => onPhase("still"),
    )
  }
  // Bascule juste avant la dernière image : la boucle démarre sur la même image.
  const onTime = () => {
    if (intro.duration && intro.currentTime > intro.duration - 0.08) toLoop()
  }
  const onPlaying = () => {
    started = true
    clearTimeout(guard)
  }
  intro.addEventListener("timeupdate", onTime)
  intro.addEventListener("ended", toLoop)
  intro.addEventListener("error", toLoop)
  intro.addEventListener("playing", onPlaying)
  guard = setTimeout(() => {
    if (!started) toLoop()
  }, guardMs)
  intro.play().catch(toLoop)
  return () => {
    clearTimeout(guard)
    intro.removeEventListener("timeupdate", onTime)
    intro.removeEventListener("ended", toLoop)
    intro.removeEventListener("error", toLoop)
    intro.removeEventListener("playing", onPlaying)
  }
}

/** Ancre de la section « Prestations & tarifs » (PrestationsPreview). */
export const CLZ_TARIFS_HREF = `${CLZ_HOME_HREF}#tarifs`

const TRADES = ["Nettoyage auto", "Detailing", "Matelas", "Canapés", "Tapis & moquettes"]
const RATING = (BRAND.googleRating ?? 5).toLocaleString("fr-FR", { minimumFractionDigits: 1 })

export function CleanyzerHero() {
  const introRef = useRef<HTMLVideoElement>(null)
  const loopRef = useRef<HTMLVideoElement>(null)
  // "intro" : arrivée en cours (ou poster) · "loop" : boucle visible · "still" : mouvement réduit.
  const [phase, setPhase] = useState<"intro" | "loop" | "still">("intro")

  useEffect(() => {
    const intro = introRef.current
    const loop = loopRef.current
    if (!intro || !loop) return
    const saveData = Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData)
    // Posters des vidéos au format de l'écran (le rendu serveur pose la version 1080).
    intro.poster = loop.poster = heroPoster(heroVideoQuality(window.innerWidth))
    const sources = heroVideoSources(
      window.innerWidth,
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      saveData,
    )
    if (!sources) {
      setPhase("still")
      return
    }
    loop.src = sources.boucle
    loop.load()
    intro.src = sources.arrivee
    return runHeroSequence(intro, loop, setPhase)
  }, [])

  return (
    <section id="clz-hero" className="clz-neon-hero" data-phase={phase}>
      <div className="clz-neon-scene" aria-hidden="true">
        {/* Image LCP : poster de l'arrivée, servi tout de suite (la vidéo vient après). */}
        <picture>
          <source media={`(max-width: ${HERO_MOBILE_MAX}px)`} srcSet={heroPoster("720")} width={720} height={1280} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="clz-neon-poster" src={heroPoster("1080")} alt="" fetchPriority="high" decoding="async" width={1920} height={1080} />
        </picture>
        <video ref={loopRef} className="clz-neon-loop" poster={heroPoster("1080")} muted loop playsInline preload="auto" width={1920} height={1080} />
        <video ref={introRef} className="clz-neon-intro" poster={heroPoster("1080")} muted playsInline preload="auto" width={1920} height={1080} />
      </div>

      <div className="clz-neon-copy">
        <div className="clz-neon-wrap">
          <div className="clz-neon-title">
            <p className="clz-neon-mega">CLEANYZER</p>
            <p className="clz-neon-sub">La propreté à l&apos;état pur</p>
            <span className="clz-neon-rule" aria-hidden="true" />
            <h1 className="clz-neon-promise">Nettoyage auto &amp; detailing à domicile, à Annecy et alentours</h1>
            {/* Masqués jusqu'à 760 px (maquette). */}
            <div className="clz-neon-ctas">
              <Link href={CLZ_BOOKING_HREF} className="clz-neon-btn clz-neon-btn-primary">
                Réserver mon nettoyage
              </Link>
              <Link href={CLZ_TARIFS_HREF} className="clz-neon-btn clz-neon-btn-ghost">
                Voir les tarifs
              </Link>
            </div>
          </div>
        </div>
      </div>

      <ul className="clz-neon-trades" aria-label="Nos métiers">
        {TRADES.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>

      {BRAND.googleReviewsUrl && BRAND.googleReviewCount != null && (
        <a className="clz-neon-gproof" href={BRAND.googleReviewsUrl} target="_blank" rel="noopener noreferrer">
          <span className="clz-neon-stars" aria-hidden="true">
            ★★★★★
          </span>{" "}
          <b>{RATING}</b> · {BRAND.googleReviewCount} avis Google
          <span className="sr-only"> (nouvel onglet)</span>
        </a>
      )}
    </section>
  )
}
