import type { Metadata } from "next"
import { Info } from "lucide-react"
import { requireCompanyMember } from "@/lib/admin"
import { withTenant } from "@/lib/tenant-link"
import { publicReservationUrl } from "@/lib/tenant-shared"
import { buildEmbedScriptSnippet, buildEmbedIframeSnippet } from "@/lib/embed/snippet"
import { ReservationEmbedCard } from "@/components/admin/reservation-embed-card"

export const metadata: Metadata = { title: "Ma réservation" }

export const dynamic = "force-dynamic"

/**
 * « MA RÉSERVATION » — hub du parcours booking_only (le pro a déjà son site).
 *
 * DetailFlow ne génère PAS de site vitrine ici : on fournit un lien de
 * réservation à partager ET un module intégrable (code à coller) qui ouvre le
 * MÊME moteur de réservation directement dans le site existant du professionnel.
 *
 * ISOLATION : `requireCompanyMember()` résout le tenant côté serveur ; le slug
 * est injecté dans les liens et les snippets CÔTÉ SERVEUR (jamais depuis le
 * client). Les URL de réservation utilisent la route canonique host-agnostique
 * `/p/<slug>/reservation`, donc un seul moteur, jamais dupliqué.
 *
 * La route reste servie pour tous les tenants ; seule la navigation affiche
 * cette entrée pour `booking_only`. Les sites 100 % personnalisés sans module
 * de réservation en ligne (Spirit ACS) voient un message explicite.
 */
export default async function MaReservationPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string }>
}) {
  const { tenant } = await requireCompanyMember()
  const { tenant: tenantParam } = await searchParams

  // Spirit ACS : parcours demande → devis, sans moteur de réservation en ligne.
  if (tenant.customSiteKey === "spirit-acs") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Ma réservation</h1>
          <p className="text-sm text-muted-foreground">Lien et module de réservation à intégrer à votre site.</p>
        </div>
        <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-4">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <p className="text-sm text-muted-foreground text-pretty">
            Votre site fonctionne avec un parcours de demande de devis dédié : la réservation en ligne standard
            n&apos;est pas activée sur votre espace.
          </p>
        </div>
      </div>
    )
  }

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN
  const slug = tenant.slug
  const reachable = tenant.status !== "SUSPENDED" && tenant.status !== "ARCHIVED"

  const reservationUrl = publicReservationUrl(slug, rootDomain)
  const scriptSnippet = buildEmbedScriptSnippet(slug, rootDomain)
  const iframeSnippet = buildEmbedIframeSnippet(slug, rootDomain)
  const bookingSettingsHref = withTenant("/admin/parametres", tenantParam ?? null)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Ma réservation</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          Vous avez déjà votre site : partagez votre lien de réservation ou intégrez le module directement dans vos
          pages. Vos clients réservent sans quitter votre site.
        </p>
      </div>

      {reachable ? (
        <ReservationEmbedCard
          reservationUrl={reservationUrl}
          scriptSnippet={scriptSnippet}
          iframeSnippet={iframeSnippet}
          bookingSettingsHref={bookingSettingsHref}
        />
      ) : (
        <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-4">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <p className="text-sm text-muted-foreground text-pretty">
            Votre espace est momentanément indisponible au public. Votre lien de réservation et son module seront de
            nouveau actifs dès la réactivation de votre compte.
          </p>
        </div>
      )}
    </div>
  )
}
