import type { Metadata } from "next"
import Link from "next/link"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { resolvePublicRequestTenant } from "@/lib/tenant"
import { loadPublicOffer } from "@/lib/customer-subscriptions/public-offer"
import { PublicPlans } from "@/components/subscriptions/public-plans"
import { EmbedFrameSync } from "@/components/booking/embed-frame-sync"
import { publicSiteHref } from "@/lib/public-site-links"

export const metadata: Metadata = {
  title: "Formules d'entretien",
  description: "Découvrez les formules d'entretien régulier de votre véhicule et envoyez votre demande en ligne.",
}

export const dynamic = "force-dynamic"

/**
 * Page publique des formules. Widget : `?embed=1` (formules seules) ou
 * `?embed=1&view=both` (formules + accès à la réservation). Même backend que
 * le site standard (loadPublicOffer + submitSubscriptionRequest).
 */
export default async function FormulesPage({
  searchParams,
}: {
  searchParams: Promise<{ embed?: string; view?: string }>
}) {
  const { embed, view } = await searchParams
  const isEmbed = embed === "1"
  const tenant = await resolvePublicRequestTenant()
  const h = await headers()
  if (!tenant && h.get("x-tenant-slug")?.trim()) notFound()
  const offer = await loadPublicOffer(db, tenant?.id)
  const bookingHref = publicSiteHref("reservation", {
    tenantKind: h.get("x-tenant-kind"),
    tenantSlug: tenant?.slug,
    embed: isEmbed,
    view,
  })

  return (
    <>
      {isEmbed && (
        <>
          <script
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('df-embed')" }}
          />
          <EmbedFrameSync />
        </>
      )}
      {view === "both" && (
        <nav aria-label="Choix du service" className={`flex flex-wrap gap-2 px-4 ${isEmbed ? "pt-6" : "pt-24"}`}>
          <Link href={bookingHref} className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground">
            Réserver une prestation
          </Link>
          <span aria-current="page" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Formules d&apos;entretien
          </span>
        </nav>
      )}
      {offer ? (
        <PublicPlans offer={offer} heading="Formules d'entretien" />
      ) : (
        <section className="mx-auto flex max-w-xl flex-col gap-3 px-4 py-16 text-center">
          <h1 className="text-balance text-2xl font-semibold text-foreground">Formules d&apos;entretien</h1>
          <p className="leading-relaxed text-muted-foreground">
            Aucune formule n&apos;est proposée en ligne pour le moment.
          </p>
          {view === "both" && (
            <Link href={bookingHref} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
              Réserver une prestation
            </Link>
          )}
        </section>
      )}
    </>
  )
}
