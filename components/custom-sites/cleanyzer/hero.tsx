"use client"

/**
 * HERO CLEANYZER.
 * Cahier §4/§6 : vidéo (avec son) en fond de hero, à la place de la photo.
 * - <video> autoplay/muted/loop/playsInline + poster (fallback image intégré).
 * - Le son démarre coupé (contrainte navigateur autoplay) avec un bouton
 *   son on/off explicite et accessible.
 * - `prefers-reduced-motion` : on neutralise l'autoplay et on affiche le poster.
 *
 * Preuve sociale Google : 5/5 — 78 avis (valeurs fournies par le client,
 * conformes aux visuels de référence). Ne pas modifier sans instruction.
 */

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { ArrowRight, ArrowUpRight, Star, Volume2, VolumeX } from "lucide-react"
import { BRAND } from "./content"
import { CLZ_PREVIEW_BASE } from "./tokens"

const POSTER = "/custom-sites/cleanyzer/hero-poster.png"
const VIDEO = "/custom-sites/cleanyzer/hero.mp4"

const GOOGLE_RATING = 5
const GOOGLE_REVIEWS = 78

export function CleanyzerHero() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [muted, setMuted] = useState(true)
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const apply = () => setReduceMotion(mq.matches)
    apply()
    mq.addEventListener("change", apply)
    return () => mq.removeEventListener("change", apply)
  }, [])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (reduceMotion) {
      v.pause()
    } else {
      v.play().catch(() => {})
    }
  }, [reduceMotion])

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
      {/* Fond vidéo plein cadre. Le poster sert de fallback pendant le chargement
          et lorsque le mouvement réduit est demandé. */}
      <div className="absolute inset-0 -z-10">
        {reduceMotion ? (
          <Image
            src={POSTER || "/placeholder.svg"}
            alt="Détaillage automobile CLEANYZER à domicile près d'Annecy"
            fill
            priority
            sizes="100vw"
            className="object-cover object-[50%_38%]"
          />
        ) : (
          <video
            ref={videoRef}
            className="h-full w-full object-cover object-[50%_38%]"
            poster={POSTER}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            aria-label="Détaillage automobile CLEANYZER à domicile près d'Annecy"
          >
            <source src={VIDEO} type="video/mp4" />
          </video>
        )}
        {/* Overlays de lisibilité (cahier §4). */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/55 to-black/85" />
        <div className="absolute inset-0 bg-gradient-to-tr from-black/70 via-transparent to-[rgba(10,132,255,0.28)]" />
      </div>

      {/* Le logo n'apparaît QUE dans le header (brief §2) : aucun filigrane,
          aucun watermark, aucun logo superposé à la vidéo du hero. */}

      <div className="relative mx-auto flex min-h-[100svh] max-w-6xl flex-col justify-center px-6 pb-28 pt-24 md:px-6 md:pb-24">
        <span className="clz-eyebrow">
          {BRAND.name} — {BRAND.area}
        </span>
        {/* Composition imposée en 3 lignes (maquette) : blocs explicites pour
            que le navigateur ne choisisse pas librement les retours. */}
        <h1 className="clz-display clz-hero-title mt-4 max-w-[16ch] text-white">
          <span className="block">Le détail</span>
          <span className="block">fait toute</span>
          <span className="clz-accent block">la différence.</span>
        </h1>
        {/* Sous-titre : deux lignes tenues (maquette), taille réduite avant tout
            retour supplémentaire — autorisé seulement sur très petits écrans. */}
        <p className="mt-6 max-w-md text-pretty text-base leading-relaxed text-[var(--clz-on-dark-muted)] sm:text-lg">
          <span className="block">Nettoyage automobile à domicile.</span>
          <span className="block">Intérieur, extérieur &amp; detailing.</span>
        </p>

        <div className="mt-8 flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-7">
          <Link href={`${CLZ_PREVIEW_BASE}#prestations`} className="clz-btn clz-btn-primary !px-6 !py-3 !text-[0.95rem]">
            Découvrir nos prestations
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href={`${CLZ_PREVIEW_BASE}/demande`}
            className="group inline-flex items-center gap-1.5 text-base font-medium text-white/85 transition hover:text-white"
          >
            Demander un devis
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>

        {/* Preuve sociale Google : 5/5 — 78 avis (valeurs client, cf. maquette). */}
        <div className="mt-10 flex items-center gap-3">
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
        </div>
      </div>

      {/* Bouton son on/off (la vidéo démarre coupée par contrainte navigateur). */}
      {!reduceMotion && (
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
