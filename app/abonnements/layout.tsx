import type React from "react"
import type { Metadata } from "next"

/** Espace client privé : jamais indexé, aucun tracker ni script marketing. */
export const metadata: Metadata = {
  title: "Mon abonnement",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
}

export default function CustomerSubscriptionsLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-background font-sans text-foreground">{children}</div>
}
