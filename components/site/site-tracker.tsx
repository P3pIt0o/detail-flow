"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"

const STORAGE_KEY = "df_vid"

/** Identifiant anonyme de navigateur, stable ~1 an. Aucune donnée personnelle. */
function getVisitorId(): string {
  try {
    let id = localStorage.getItem(STORAGE_KEY)
    if (!id) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`
      localStorage.setItem(STORAGE_KEY, id)
    }
    return id
  } catch {
    return ""
  }
}

/**
 * Tracker léger des pages publiques tenant. Monté UNIQUEMENT dans le layout
 * `(site)` → l'espace admin n'est jamais compté. L'appel est non bloquant
 * (keepalive) et n'impacte pas le rendu. Le companyId est résolu côté serveur
 * dans /api/track (jamais envoyé par le navigateur).
 */
export function SiteTracker() {
  const pathname = usePathname()

  useEffect(() => {
    const visitorId = getVisitorId()
    if (!visitorId) return

    const controller = new AbortController()
    // Léger délai : évite de compter les prefetch/navigations instantanées et
    // les rebonds < 400ms qui ressemblent à du bruit.
    const t = setTimeout(() => {
      fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorId, event: "pageview" }),
        keepalive: true,
        signal: controller.signal,
      }).catch(() => {})
    }, 400)

    return () => {
      clearTimeout(t)
      controller.abort()
    }
  }, [pathname])

  return null
}
