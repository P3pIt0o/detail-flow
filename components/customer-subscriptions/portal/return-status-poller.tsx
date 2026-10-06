"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export const RETURN_POLL_INTERVAL_MS = 2500
export const RETURN_POLL_MAX_ATTEMPTS = 12

/**
 * Rafraîchit le Server Component (lecture DB seule) pendant que le webhook
 * active le contrat. Monté uniquement pour l'état "processing" : dès que la
 * page passe à "active"/"unknown", le composant est démonté et le polling
 * s'arrête. Aucun appel Stripe depuis le navigateur.
 */
export function ReturnStatusPoller() {
  const router = useRouter()

  useEffect(() => {
    let attempts = 0
    const timer = window.setInterval(() => {
      attempts += 1
      router.refresh()
      if (attempts >= RETURN_POLL_MAX_ATTEMPTS) window.clearInterval(timer)
    }, RETURN_POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [router])

  return null
}
