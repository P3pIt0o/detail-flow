import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { requireCompanyMember } from "@/lib/admin"
import { isLifetimePreviewTestEnabled } from "@/lib/billing/lifetime-preview-test"
import { describeSubscriptionReturnState } from "@/lib/billing/subscription-core"
import { createPgSubscriptionStore } from "@/lib/billing/subscription-server"
import { withTenant } from "@/lib/tenant-link"

export const metadata: Metadata = { title: "Abonnement — confirmation", robots: { index: false, follow: false } }
export const dynamic = "force-dynamic"

/** Lit UNIQUEMENT l'état en base synchronisé par le webhook (jamais l'URL). */
export default async function SubscriptionReturnPage() {
  if (!isLifetimePreviewTestEnabled(process.env.VERCEL_ENV)) notFound()
  const member = await requireCompanyMember(["OWNER"])
  const company = await createPgSubscriptionStore().getCompany(member.tenant.id)
  const { state, title } = company
    ? describeSubscriptionReturnState(company)
    : { state: "pending" as const, title: "Confirmation en cours" }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-12">
      <p className="text-sm font-semibold tracking-wide text-destructive">ENVIRONNEMENT TEST</p>
      <h1 className="text-balance text-2xl font-semibold text-foreground">{title}</h1>
      {state === "pending" ? (
        <p className="text-pretty leading-relaxed text-muted-foreground">
          Stripe confirme votre abonnement. Actualisez la page dans quelques secondes.
        </p>
      ) : null}
      <Link
        href={withTenant("/admin/abonnement/test-subscriptions", member.tenant.slug)}
        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Retour à l&apos;outil de test
      </Link>
    </main>
  )
}
