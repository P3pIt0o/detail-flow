"use client"

/**
 * PRÉSENTATION CLEANYZER (L35) : texte + carte « Découvrir Cleanyzer en vidéo ».
 * La vidéo de Tom (avec le son) ne se lance JAMAIS seule : aucune balise <video> ni source avant le
 * clic ; ouverture en plein écran (lightbox), fermeture par le bouton, Échap, clic sur le fond ou à
 * la fin. Focus : « Fermer » à l'ouverture, retour sur le bouton de lecture à la fermeture.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { BRAND } from "./content"
import { CLZ_BOOKING_HREF } from "./tokens"
import { CLZ_TARIFS_HREF, HERO_MOBILE_MAX } from "./hero"

const POSTER = "/custom-sites/cleanyzer/hero-poster.webp"
const RATING = (BRAND.googleRating ?? 5).toLocaleString("fr-FR", { minimumFractionDigits: 1 })

export function ClzPresentation() {
  const [open, setOpen] = useState(false)
  const playRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  const close = useCallback(() => {
    setOpen(false)
    document.body.style.overflow = ""
    playRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return
    document.body.style.overflow = "hidden"
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, close])

  return (
    <section className="clz-neon-present" id="presentation" aria-labelledby="clz-present-title">
      <div className="clz-neon-wrap clz-neon-present-grid">
        <div>
          <span className="clz-neon-eyebrow">Cleanyzer — Annecy &amp; alentours</span>
          <p className="clz-neon-display" id="clz-present-title">
            Le détail
            <br />
            fait toute
            <br />
            <em>la différence.</em>
          </p>
          <p className="clz-neon-lede">Nettoyage automobile à domicile à Annecy. Intérieur, extérieur &amp; detailing.</p>
          <div className="clz-neon-actions">
            <Link href={CLZ_TARIFS_HREF} className="clz-neon-btn clz-neon-btn-primary">
              Voir les prestations et tarifs →
            </Link>
            <Link href={CLZ_BOOKING_HREF} className="clz-neon-btn clz-neon-btn-ghost">
              Réserver
            </Link>
          </div>
          {BRAND.googleReviewCount != null && (
            <div className="clz-neon-rating">
              <span className="clz-neon-stars" aria-hidden="true">
                ★★★★★
              </span>
              <span>
                <b>{RATING}/5</b> — {BRAND.googleReviewCount} avis Google
              </span>
            </div>
          )}
        </div>
        <figure className="clz-neon-tomvid" style={{ backgroundImage: `url(${POSTER})` }}>
          <button ref={playRef} type="button" className="clz-neon-play" aria-haspopup="dialog" onClick={() => setOpen(true)}>
            <span className="clz-neon-tri" aria-hidden="true" />
            <span>Découvrir Cleanyzer en vidéo</span>
          </button>
        </figure>
      </div>

      {open && (
        <div
          className="clz-neon-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Vidéo Cleanyzer"
          onClick={(e) => {
            if (e.target === e.currentTarget) close()
          }}
        >
          <button ref={closeRef} type="button" className="clz-neon-lb-close" aria-label="Fermer la vidéo" onClick={close}>
            ×
          </button>
          <video
            src={`/custom-sites/cleanyzer/hero-${window.innerWidth <= HERO_MOBILE_MAX ? "720" : "1280"}.mp4`}
            poster={POSTER}
            controls
            autoPlay
            playsInline
            preload="none"
            onEnded={close}
            aria-label="Tom nettoie une voiture à domicile près d'Annecy"
          />
        </div>
      )}
    </section>
  )
}
