import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { requireCompanyMember } from "@/lib/admin"
import { isLifetimePreviewTestEnabled } from "@/lib/billing/lifetime-preview-test"
import { LifetimeTestCheckoutButton } from "./test-checkout-button"

export const metadata: Metadata = { title: "Test Lifetime — Preview", robots: { index: false, follow: false } }
export const dynamic = "force-dynamic"

export default async function LifetimePreviewTestPage() {
  if (!isLifetimePreviewTestEnabled(process.env.VERCEL_ENV)) notFound()
  await requireCompanyMember(["OWNER"])

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-12">
      <div
        role="alert"
        className="rounded-md border border-destructive bg-destructive/10 px-4 py-3 text-sm font-semibold tracking-wide text-destructive"
      >
        ENVIRONNEMENT TEST — aucun paiement réel
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-balance text-2xl font-semibold text-foreground">Test Lifetime — Preview</h1>
        <p className="text-pretty leading-relaxed text-muted-foreground">
          Ce paiement utilise Stripe TEST et la base Preview isolée.
        </p>
      </div>
      <LifetimeTestCheckoutButton />
    </main>
  )
}
