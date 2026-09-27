"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { startLifetimeSingleCheckout } from "../actions"

export function LifetimeTestCheckoutButton() {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    setError(null)
    startTransition(async () => {
      const result = await startLifetimeSingleCheckout()
      if (result.ok) {
        window.location.assign(result.url)
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <Button type="button" onClick={handleClick} disabled={isPending} className="self-start">
        {isPending ? "Initialisation…" : "Lancer le Checkout TEST — 1 290 €"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm leading-relaxed text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
