"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { RETURN_POLL_INTERVAL_MS, RETURN_POLL_MAX_ATTEMPTS } from "@/lib/billing/saas-admin"

/**
 * Re-rend la page serveur (lecture DB uniquement) tant que le webhook Billing
 * n'a pas synchronisé l'abonnement. N'appelle jamais Stripe.
 */
export function SubscriptionReturnPoller({ active }: { active: boolean }) {
  const router = useRouter()
  const attempts = useRef(0)

  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => {
      attempts.current += 1
      if (attempts.current > RETURN_POLL_MAX_ATTEMPTS) {
        window.clearInterval(id)
        return
      }
      router.refresh()
    }, RETURN_POLL_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [active, router])

  return null
}
