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

    // Le tenant est porté par `?tenant=<slug>` sur le domaine racine (routage
    // multi-tenant de production) ET en aperçu/dev. Un `fetch("/api/track")`
    // relatif PERD cette query → le middleware ne peut plus résoudre le tenant
    // (x-tenant-slug vide) et la route répond 204 sans rien enregistrer. On
    // reconduit donc explicitement `?tenant=` depuis l'URL courante. Sur un vrai
    // sous-domaine ({slug}.detailflow.fr) il n'y a pas de query : l'hôte suffit,
    // et l'URL reste `/api/track` sans query (comportement identique).
    let url = "/api/track"
    try {
      const tenant = new URLSearchParams(window.location.search).get("tenant")
      if (tenant) url = `/api/track?tenant=${encodeURIComponent(tenant)}`
    } catch {
      // Environnement sans window (défensif) : on garde l'URL relative simple.
    }

    const controller = new AbortController()
    // Léger délai : évite de compter les prefetch/navigations instantanées et
    // les rebonds < 400ms qui ressemblent à du bruit.
    const t = setTimeout(() => {
      fetch(url, {
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
