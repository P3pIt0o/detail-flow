"use client"

/**
 * VISITE 3D AU CLIC (L35) : carte d'aperçu + « Explorer en 3D ». Le module 3D (`visit-3d.tsx`, qui
 * charge Three.js puis le modèle) n'est importé qu'au clic : aucun octet de 3D avant.
 * Un lien du film (`goVisit`) avant le clic charge aussi la 3D ; la zone demandée est mémorisée
 * puis rejouée une fois la visite montée, qui s'ouvre ainsi directement sur cette zone.
 */

import { useEffect, useRef, useState, type ComponentType } from "react"
import { CLZ_VISIT_ANCHOR, type ZoneKey } from "./journey"
import { goVisit, registerVisit, useJourney } from "./journey-nav"

const POSTER = "/custom-sites/cleanyzer/neon/hero-boucle-poster.webp"

/** Zone demandée avant le chargement de la 3D : la dernière cliquée, rejouée une seule fois. */
export function createPendingVisit() {
  let zone: ZoneKey | "final" | null = null
  return {
    remember(z: ZoneKey | "final") {
      zone = z
    },
    take() {
      const z = zone
      zone = null
      return z
    },
  }
}

export function Visit3DLazy() {
  const [Visit3D, setVisit3D] = useState<ComponentType | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const cardRef = useRef<HTMLElement>(null)
  const pendingRef = useRef(createPendingVisit())
  const journey = useJourney()

  const load = () => {
    if (loading || Visit3D) return
    setLoading(true)
    setFailed(false)
    import("./visit-3d")
      .then((m) => setVisit3D(() => m.Visit3D))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false))
  }

  // Tant que la 3D n'est pas chargée, un renvoi du film (goVisit) la charge, mémorise la zone et
  // amène sur la section.
  useEffect(() => {
    if (Visit3D) return
    return registerVisit((zone) => {
      pendingRef.current.remember(zone)
      cardRef.current?.scrollIntoView({ behavior: "smooth" })
      load()
    })
  })

  // 3D montée : elle a enregistré son propre gestionnaire (effet de l'enfant, exécuté avant celui-ci).
  // On rejoue la zone mémorisée avec l'origine du parcours déjà enregistrée par le premier goVisit.
  useEffect(() => {
    if (!Visit3D) return
    const zone = pendingRef.current.take()
    if (!zone) return
    const id = requestAnimationFrame(() => goVisit(zone, journey.origin))
    return () => cancelAnimationFrame(id)
    // Rejoué une seule fois, au montage de la 3D ; l'origine lue est celle de ce moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Visit3D])

  if (Visit3D) return <Visit3D />

  return (
    <section ref={cardRef} className="clz-neon-visit" id={CLZ_VISIT_ANCHOR} aria-labelledby="clz-visit-title">
      <div className="clz-neon-wrap">
        <div className="clz-neon-vcard">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={POSTER} alt="" loading="lazy" decoding="async" />
          <div className="clz-neon-vcopy">
            <span className="clz-neon-eyebrow">Visite 3D</span>
            <h2 id="clz-visit-title" className="clz-neon-h2">
              Choisissez votre formule, <em>zone par zone.</em>
            </h2>
            <p>Tournez autour de la voiture et découvrez ce que comprend chaque prestation.</p>
            <button type="button" className="clz-neon-btn clz-neon-btn-primary" onClick={load} disabled={loading} aria-busy={loading}>
              {loading ? "Chargement de la 3D…" : "Explorer en 3D"}
            </button>
            {failed && (
              <p role="alert" className="clz-neon-vnote">
                La visite 3D n&apos;a pas pu se charger. Vérifiez votre connexion puis réessayez.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
