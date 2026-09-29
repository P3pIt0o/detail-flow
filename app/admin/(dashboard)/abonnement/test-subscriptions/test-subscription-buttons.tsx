"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import {
  openSubscriptionPreviewTestPortal,
  startSubscriptionPreviewTestCheckout,
  type SubscriptionTestActionResult,
} from "./actions"

function useRedirectAction() {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  function run(action: () => Promise<SubscriptionTestActionResult>) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result.ok) window.location.assign(result.url)
      else setError(result.error)
    })
  }
  return { error, isPending, run }
}

function ActionError({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <p role="alert" className="text-sm leading-relaxed text-destructive">
      {error}
    </p>
  )
}

export function SubscriptionTestCheckoutButton({ plan, label }: { plan: string; label: string }) {
  const { error, isPending, run } = useRedirectAction()
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        onClick={() => run(() => startSubscriptionPreviewTestCheckout(plan))}
        disabled={isPending}
        className="self-start"
      >
        {isPending ? "Initialisation…" : label}
      </Button>
      <ActionError error={error} />
    </div>
  )
}

export function SubscriptionTestPortalButton() {
  const { error, isPending, run } = useRedirectAction()
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={() => run(openSubscriptionPreviewTestPortal)}
        disabled={isPending}
        className="self-start"
      >
        {isPending ? "Ouverture…" : "Gérer la facturation (Customer Portal)"}
      </Button>
      <ActionError error={error} />
    </div>
  )
}
