"use client"

import { useEffect } from "react"
import { useSearchParams } from "next/navigation"

/** Marge laissée au-dessus du bloc visé : son titre reste visible sous l'en-tête collant. */
export const SETTINGS_SCROLL_MARGIN = "6rem"

/**
 * Fait défiler jusqu'au bloc `?bloc=` (sinon jusqu'au haut de l'onglet `?tab=`), le
 * met en évidence quelques secondes, puis retire `bloc` de l'adresse : recliquer le
 * même résultat de recherche rouvre toujours le réglage. Ne rend rien.
 */
export function SettingsHighlight() {
  const params = useSearchParams()
  const bloc = params.get("bloc")
  const tab = params.get("tab")

  useEffect(() => {
    // `bloc` vient de l'URL : seuls les blocs de réglages sont visés.
    if (!bloc || !bloc.startsWith("reglage-")) return
    const el = document.getElementById(bloc) ?? (tab ? document.getElementById(`reglage-${tab}`) : null)
    if (!el) return
    el.style.scrollMarginTop = SETTINGS_SCROLL_MARGIN
    el.scrollIntoView({ block: "start" })
    const cls = ["ring-2", "ring-primary", "ring-offset-4", "ring-offset-background", "rounded-xl"]
    el.classList.add(...cls)
    // Pas de nettoyage lié au rendu : retirer `bloc` ci-dessous relance l'effet,
    // la surbrillance doit pourtant rester ses 3,5 secondes.
    window.setTimeout(() => el.classList.remove(...cls), 3500)
    // Usage unique : `bloc` retiré de l'adresse (sans recharger), le reste est gardé.
    const p = new URLSearchParams(window.location.search)
    p.delete("bloc")
    window.history.replaceState(null, "", `?${p.toString()}`)
  }, [bloc, tab])
  return null
}
