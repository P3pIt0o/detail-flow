"use client"

import { useState, useTransition } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  openSaasPortalAction,
  startSaasCheckoutAction,
  type SaasBillingActionResult,
} from "@/app/admin/(dashboard)/abonnement/actions"

function useRedirectAction() {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  function run(action: () => Promise<SaasBillingActionResult>) {
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

export function SaasCheckoutButton({ plan, label, featured }: { plan: "PRO" | "BUSINESS"; label: string; featured?: boolean }) {
  const { error, isPending, run } = useRedirectAction()
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant={featured ? "default" : "outline"}
        className="w-full"
        onClick={() => run(() => startSaasCheckoutAction(plan))}
        disabled={isPending}
      >
        {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        {isPending ? "Redirection vers Stripe…" : label}
      </Button>
      <ActionError error={error} />
    </div>
  )
}

export function SaasPortalButton() {
  const { error, isPending, run } = useRedirectAction()
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        className="w-full sm:w-auto sm:self-start"
        onClick={() => run(openSaasPortalAction)}
        disabled={isPending}
      >
        {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        {isPending ? "Ouverture…" : "Gérer ma facturation"}
      </Button>
      <ActionError error={error} />
    </div>
  )
}
