"use client"

/**
 * HERO CLEANYZER.
 * Cahier §4/§6 : vidéo (avec son) en fond de hero, à la place de la photo.
 * - <video> autoplay/muted/loop/playsInline, poster = première image de la vidéo (PERF V1).
 * - Le son démarre coupé (contrainte navigateur autoplay) avec un bouton
 *   son on/off explicite et accessible.
 * - `prefers-reduced-motion` : autoplay neutralisé, vidéo en pause (aucune image de remplacement).
 *
 * Preuve sociale Google : 5,0/5 — 86 avis (relevé sur la fiche Google Maps
 * officielle, source unique : BRAND dans content.ts). Ne pas modifier sans instruction.
 */

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowRight, ArrowUpRight, Star, Volume2, VolumeX } from "lucide-react"
import { BRAND } from "./content"
import { ClzCompareSlider } from "./compare-slider"
import { CLZ_DEMANDE_HREF, CLZ_HOME_HREF } from "./tokens"

// Variantes H.264 + AAC encodées depuis hero.mp4 (même scène, son conservé).
// Une seule est téléchargée, choisie au montage selon la largeur d'écran.
const VIDEO_DESKTOP = "/custom-sites/cleanyzer/hero-1280.mp4"
const VIDEO_MOBILE = "/custom-sites/cleanyzer/hero-720.mp4"
// Première image de la vidéo originale : affichée immédiatement (LCP).
const POSTER = "/custom-sites/cleanyzer/hero-poster.webp"

function pickHeroVideo(): string | null {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  if (conn?.saveData) return null
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null
  return window.matchMedia("(min-width: 768px)").matches ? VIDEO_DESKTOP : VIDEO_MOBILE
}

const GOOGLE_RATING = (BRAND.googleRating ?? 5).toLocaleString("fr-FR", { minimumFractionDigits: 1 })
const GOOGLE_REVIEWS = BRAND.googleReviewCount
const GOOGLE_REVIEWS_URL = BRAND.googleReviewsUrl

export function CleanyzerHero() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [muted, setMuted] = useState(true)
  const [reduceMotion, setReduceMotion] = useState(false)
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    setSrc(pickHeroVideo())
  }, [])

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const apply = () => setReduceMotion(mq.matches)
    apply()
    mq.addEventListener("change", apply)
    return () => mq.removeEventListener("change", apply)
  }, [])

  useEffect(() => {
    const v = videoRef.current
    if (!v || !src) return
    if (reduceMotion) {
      v.pause()
    } else {
      v.play().catch(() => {})
    }
  }, [reduceMotion, src])

  function toggleSound() {
    const v = videoRef.current
    if (!v) return
    const next = !muted
    v.muted = next
    setMuted(next)
    if (!next) v.play().catch(() => {})
  }

  return (
    <section className="clz-dark relative isolate overflow-hidden">
      {/* Fond vidéo plein cadre. Poster = première image de la vidéo, affiché
          immédiatement. Mouvement réduit ou économie de données : la vidéo n'est
          pas téléchargée, seule cette première image reste affichée. */}
      <div className="absolute inset-0 -z-10 bg-[var(--clz-ink)]">
        <video
          ref={videoRef}
          className="h-full w-full object-cover object-[50%_38%]"
          src={src ?? undefined}
          poster={POSTER}
          autoPlay={!reduceMotion}
          muted
          loop
          playsInline
          preload="metadata"
          aria-label="Détaillage automobile CLEANYZER à domicile près d'Annecy"
        />
        {/* Overlays de lisibilité (cahier §4). */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/55 to-black/85" />
        <div className="absolute inset-0 bg-gradient-to-tr from-black/70 via-transparent to-[rgba(10,132,255,0.28)]" />
      </div>

      {/* Le logo n'apparaît QUE dans le header (brief §2) : aucun filigrane,
          aucun watermark, aucun logo superposé à la vidéo du hero. */}

      <div className="relative mx-auto max-w-6xl px-6 pb-20 md:px-6">
        <div className="flex min-h-[100svh] flex-col justify-center pb-16 pt-24">
        <span className="clz-eyebrow">
          {BRAND.name} — {BRAND.area}
        </span>
        {/* Signature visuelle (composition imposée en 3 lignes, maquette).
            SEO : ce n'est PAS le titre de la page — le H1 est la ligne
            descriptive ci-dessous (mots-clés « nettoyage automobile à
            domicile » + « Annecy »), sans aucun changement visuel. */}
        <p className="clz-display clz-hero-title clz-rise mt-4 max-w-[16ch] text-white">
          <span className="block">Le détail</span>{" "}
          <span className="block">fait toute</span>{" "}
          <span className="clz-accent block">la différence.</span>
        </p>
        {/* H1 : deux lignes tenues (maquette), taille réduite avant tout
            retour supplémentaire — autorisé seulement sur très petits écrans. */}
        <h1 className="clz-rise clz-rise-2 mt-6 max-w-md text-pretty text-base font-normal leading-relaxed text-[var(--clz-on-dark-muted)] sm:text-lg">
          <span className="block">Nettoyage automobile à domicile à Annecy.</span>{" "}
          <span className="block">Intérieur, extérieur &amp; detailing.</span>
        </h1>

        {/* id observé par la barre sticky mobile (site-shell) pour son apparition. */}
        <div id="clz-hero-ctas" className="clz-rise clz-rise-3 mt-8 flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-7">
          <Link href={`${CLZ_HOME_HREF}#prestations`} className="clz-btn clz-btn-primary !px-6 !py-3 !text-[0.95rem]">
            Découvrir nos prestations
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href={CLZ_DEMANDE_HREF}
            className="group inline-flex items-center gap-1.5 text-base font-medium text-white/85 transition hover:text-white"
          >
            Demander un devis
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>

        {/* Preuve sociale Google : 5,0/5 — 86 avis (fiche Google Maps officielle). */}
        <div className="mt-10 flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex" aria-hidden>
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="h-4 w-4 fill-[var(--clz-gold)] text-[var(--clz-gold)]" />
            ))}
          </div>
          <p className="text-sm text-[var(--clz-on-dark-muted)]">
            <span className="font-semibold text-white">
              {GOOGLE_RATING}/5
            </span>{" "}
            — {GOOGLE_REVIEWS} avis Google
          </p>
          {GOOGLE_REVIEWS_URL && (
            <a
              href={GOOGLE_REVIEWS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-white/85 underline-offset-4 transition hover:text-white hover:underline"
            >
              Voir les avis Google
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">(nouvel onglet)</span>
            </a>
          )}
        </div>
        </div>

        {/* Avant / après (retours de Tom) : bas du héros, pleine largeur, juste
            avant la section suivante. Vraie intervention ; format fixe via
            --clz-cmp-ratio (4/5 mobile, 4/3 centré dès 768 px) → aucun décalage de
            mise en page. Sous la ligne de flottaison : chargement différé. */}
        <figure className="clz-hero-cmp m-0">
          <ClzCompareSlider
            before="/custom-sites/cleanyzer/isuzu-avant.webp"
            after="/custom-sites/cleanyzer/isuzu-apres.webp"
            altBefore="Habitacle, moquette et sièges d'un ISUZU avant le nettoyage intérieur"
            altAfter="Habitacle, moquette et sièges du même ISUZU après le nettoyage intérieur CLEANYZER"
            label="Nettoyage intérieur ISUZU"
            sizes="(max-width:1100px) 100vw, 1100px"
            ratio="var(--clz-cmp-ratio)"
          />
          <figcaption className="mt-3 text-sm text-[var(--clz-on-dark-muted)]">
            Un nettoyage intérieur réalisé par CLEANYZER. Faites glisser la poignée pour comparer.
          </figcaption>
        </figure>
      </div>

      {/* Bouton son on/off (la vidéo démarre coupée par contrainte navigateur). */}
      {!reduceMotion && src && (
        <button
          type="button"
          onClick={toggleSound}
          aria-pressed={!muted}
          aria-label={muted ? "Activer le son de la vidéo" : "Couper le son de la vidéo"}
          className="absolute bottom-4 right-4 z-10 inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/45 px-3.5 py-2 text-xs font-medium text-white/85 backdrop-blur transition hover:bg-black/65"
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          {muted ? "Son coupé" : "Son activé"}
        </button>
      )}
    </section>
  )
}
