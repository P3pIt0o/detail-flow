import type { Metadata } from "next"
import { ExternalLink, Info } from "lucide-react"
import { requireCompanyMember } from "@/lib/admin"
import { withTenant } from "@/lib/tenant-link"
import { publicReservationUrl } from "@/lib/tenant-shared"
import { buildEmbedScriptSnippet, buildEmbedIframeSnippet } from "@/lib/embed/snippet"
import { getBookingSetupStatus } from "@/lib/booking/setup-status"
import { ReadinessBanner, SetupChecklist, StepHeading } from "@/components/admin/booking-hub/setup-overview"
import { LinkActions, LinkDisplay } from "@/components/admin/booking-hub/link-actions"
import { btnOutline } from "@/components/admin/booking-hub/styles"
import { AddToSite } from "@/components/admin/booking-hub/add-to-site"

export const metadata: Metadata = { title: "Ma réservation en ligne" }

export const dynamic = "force-dynamic"

/**
 * « MA RÉSERVATION EN LIGNE » — assistant Configurer → Tester → Partager.
 *
 * ISOLATION : `requireCompanyMember()` résout le tenant côté serveur ; le slug
 * est injecté dans les liens et le code d'intégration CÔTÉ SERVEUR. Un seul
 * moteur : `/p/<slug>/reservation` (le widget en est la version `?embed=1`).
 * Spirit ACS (parcours devis, sans réservation en ligne) voit un message dédié.
 */
export default async function MaReservationPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string }>
}) {
  const { tenant } = await requireCompanyMember()
  const { tenant: tenantParam } = await searchParams
  const href = (path: string) => withTenant(path, tenantParam ?? null)

  if (tenant.customSiteKey === "spirit-acs") {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Ma réservation en ligne</h1>
        <Notice>
          Votre site fonctionne avec un parcours de demande de devis dédié : la réservation en ligne standard
          n&apos;est pas activée sur votre espace.
        </Notice>
      </div>
    )
  }

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN
  const reachable = tenant.status !== "SUSPENDED" && tenant.status !== "ARCHIVED"
  const reservationUrl = publicReservationUrl(tenant.slug, rootDomain)
  const status = await getBookingSetupStatus(tenant.id)

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">Ma réservation en ligne</h1>
        <p className="text-base text-muted-foreground text-pretty">Configurez, vérifiez, puis partagez votre lien.</p>
      </header>

      <ReadinessBanner missing={status.missing.map((m) => ({ id: m.id, todo: m.todo, href: href(m.href) }))} />

      <section className="flex flex-col gap-4">
        <StepHeading n={1} label="CONFIGURER" text="Vos prestations, horaires et lieux d'intervention." done={status.ready} />
        <SetupChecklist
          items={status.sections.map((s) => ({
            id: s.id,
            title: s.title,
            question: s.question,
            summary: s.summary,
            ready: s.ready,
            href: href(s.href),
          }))}
        />
      </section>

      {reachable ? (
        <>
          <section className="flex flex-col gap-4">
            <StepHeading n={2} label="TESTER" text="Voyez exactement ce que verront vos clients." />
            <a href={reservationUrl} target="_blank" rel="noopener noreferrer" className={btnOutline}>
              <ExternalLink className="size-5" aria-hidden="true" />
              Voir ma page de réservation
            </a>
          </section>

          <section className="flex flex-col gap-4">
            <StepHeading n={3} label="PARTAGER" text="Votre réservation est prête ? Partagez votre lien." />
            <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
              <LinkDisplay url={reservationUrl} />
              <LinkActions url={reservationUrl} primaryCopy={status.ready} />
            </div>
          </section>

          <AddToSite
            url={reservationUrl}
            scriptSnippet={buildEmbedScriptSnippet(tenant.slug, rootDomain)}
            iframeSnippet={buildEmbedIframeSnippet(tenant.slug, rootDomain)}
          />
        </>
      ) : (
        <Notice>
          Votre espace est momentanément indisponible au public. Votre lien de réservation sera de nouveau actif dès la
          réactivation de votre compte.
        </Notice>
      )}
    </div>
  )
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-border bg-muted/40 p-4">
      <Info className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
      <p className="text-base text-muted-foreground text-pretty">{children}</p>
    </div>
  )
}
