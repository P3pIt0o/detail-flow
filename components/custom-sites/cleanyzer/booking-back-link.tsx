"use client"

/**
 * « ← Retour au site » en haut de la réservation CLEANYZER (L59) : vers la page d'origine si elle
 * appartient au site, sinon l'accueil. Rendu serveur = accueil ; l'origine est lue au montage.
 */

import { useEffect, useState } from "react"
import { ClzLink as Link } from "./clz-link"
import { CLZ_HOME_HREF, CLZ_SITE_BASE } from "./tokens"

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
  const [href, setHref] = useState(CLZ_HOME_HREF)
  useEffect(() => setHref(clzBackHref(document.referrer, window.location.origin, CLZ_SITE_BASE)), [])
  return (
    <div className="mx-auto max-w-6xl px-4 pt-24 md:pt-28">
      <Link href={href} className="clz-back-link">
        ← Retour au site
      </Link>
    </div>
  )
}
