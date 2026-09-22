"use client"

import { useEffect } from "react"

/**
 * Synchronisation de l'iframe de réservation embarquée (mode `?embed=1`).
 *
 * Monté UNIQUEMENT en mode embarqué (décidé côté serveur). Rôle :
 *  - garantir la classe `df-embed` sur <html> (le chrome du site est masqué par
 *    CSS) — la page pose déjà cette classe via un script inline anti-flash, on
 *    la ré-assure ici pour les navigations douces ;
 *  - publier la hauteur du contenu au parent (site hôte) pour l'auto-resize.
 *
 * Ne rend aucun élément. La hauteur est envoyée avec une cible `*` : le loader
 * hôte vérifie l'origine ET la source de l'iframe avant de l'appliquer, et
 * aucune donnée sensible ne transite (seulement un nombre de pixels).
 */
export function EmbedFrameSync() {
  useEffect(() => {
    const root = document.documentElement
    root.classList.add("df-embed")

    const post = () => {
      const height = Math.ceil(document.body.getBoundingClientRect().height)
      if (height > 0) window.parent?.postMessage({ type: "detailflow:height", height }, "*")
    }

    post()
    const ro = new ResizeObserver(post)
    ro.observe(document.body)
    window.addEventListener("load", post)

    return () => {
      ro.disconnect()
      window.removeEventListener("load", post)
      root.classList.remove("df-embed")
    }
  }, [])

  return null
}
