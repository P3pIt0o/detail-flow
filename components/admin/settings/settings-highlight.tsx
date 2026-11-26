"use client"

import { useEffect } from "react"

/** Fait défiler jusqu'au bloc `bloc` et le met en évidence quelques secondes. Ne rend rien. */
export function SettingsHighlight({ bloc }: { bloc: string }) {
  useEffect(() => {
    // `bloc` vient de l'URL : seuls les blocs de réglages sont visés.
    if (!bloc.startsWith("reglage-")) return
    const el = document.getElementById(bloc)
    if (!el) return
    el.scrollIntoView({ block: "start" })
    const cls = ["ring-2", "ring-primary", "ring-offset-4", "ring-offset-background", "rounded-xl"]
    el.classList.add(...cls)
    const remove = () => el.classList.remove(...cls)
    const t = window.setTimeout(remove, 3500)
    return () => {
      window.clearTimeout(t)
      remove()
    }
  }, [bloc])
  return null
}
