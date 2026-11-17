"use client"

/**
 * « ← Retour au site » en haut de la réservation CLEANYZER (L59) : vers la page d'origine si elle
 * appartient au site, sinon l'accueil. Rendu serveur = accueil ; l'origine est lue au montage.
 */

import { useEffect, useState } from "react"
import { useClzBase } from "./clz-link"

/** Chemin de retour sûr : même origine ET sous la base du site, jamais la réservation elle-même. */
export function clzBackHref(referrer: string, origin: string, base: string): string {
  const home = base || "/"
  let url: URL
  try {
    url = new URL(referrer)
  } catch {
    return home
  }
  const onSite = url.origin === origin && (base === "" || url.pathname === base || url.pathname.startsWith(`${base}/`))
  if (!onSite || url.pathname.replace(/\/$/, "").endsWith("/reservation")) return home
  return `${url.pathname}${url.search}${url.hash}`
}

export function ClzBookingBackLink() {
  // Base de la requête (L60) : l'adresse calculée est déjà finale, d'où le `<a>` direct.
  const base = useClzBase()
  const [href, setHref] = useState(base || "/")
  useEffect(() => setHref(clzBackHref(document.referrer, window.location.origin, base)), [base])
  return (
    <div className="mx-auto max-w-6xl px-4 pt-24 md:pt-28">
      <a href={href} className="clz-back-link">
        ← Retour au site
      </a>
    </div>
  )
}
