import type React from "react"
import { requireCompanyMember } from "@/lib/admin"
import { AdminShell } from "@/components/admin/admin-shell"
import { buildAdminNavGroups, buildMobilePrimaryNav } from "@/lib/admin/nav"
import { resolvePublicLink } from "@/lib/admin/public-link"
import { resolveDashboardIntent } from "@/lib/onboarding/intent"
import { siteConfig } from "@/config/site"
import { resolveDashboardPrimaryMode, type WidgetPrimaryAction } from "@/lib/admin/primary-action"
import { getPublicationFlags } from "@/lib/company/publication"
import { getBookingDistributionMode } from "@/lib/company/booking-distribution"
import { bookingLinkUrl, isBookingLinkAccessible } from "@/lib/company/publication-shared"
import { buildEmbedScriptSnippet } from "@/lib/embed/snippet"
import { marketingOrigin } from "@/lib/tenant-shared"

export const metadata = {
  title: "Espace pro",
  robots: { index: false, follow: false },
}

/**
 * Layout protégé du dashboard.
 * requireAdmin() redirige vers /admin/login si aucune session valide.
 * Les pages /admin/login et /admin/setup sont hors de ce groupe (non protégées).
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCompanyMember()

  // Parcours résolu CÔTÉ SERVEUR : détermine l'entrée « web » du menu (Ma
  // réservation / Mon site / Page publique). customSiteKey non nul → null →
  // libellé « Page publique » historique (Spirit ACS, Rozan, Cleanyzer…).
  const onboardingIntent = resolveDashboardIntent({
    persisted: ctx.tenant.onboardingIntent,
    customSiteKey: ctx.tenant.customSiteKey,
  })

  // Navigation GROUPÉE + barre mobile — mêmes routes, mêmes règles d'éligibilité
  // (Spirit ACS, parcours web) : seule la présentation change.
  // Mode de distribution PERSISTÉ du tenant authentifié (jamais un slug client).
  const bookingDistributionMode = await getBookingDistributionMode(ctx.tenant.id)
  const navOpts = {
    intent: onboardingIntent,
    customSiteKey: ctx.tenant.customSiteKey ?? null,
    bookingDistributionMode,
  }
  const groups = buildAdminNavGroups(navOpts)
  const primaryMobile = buildMobilePrimaryNav(navOpts)

  // Meilleur lien PUBLIC réel (jamais d'URL technique) résolu côté serveur.
  const publicLink = resolvePublicLink({
    slug: ctx.tenant.slug,
    intent: onboardingIntent,
    customSiteKey: ctx.tenant.customSiteKey ?? null,
    status: ctx.tenant.status,
    rootDomain: process.env.NEXT_PUBLIC_ROOT_DOMAIN,
  })

  // Action principale : widget si bookingDistributionMode = "widget", sinon
  // comportement inchangé. Tout est résolu depuis le tenant serveur.
  let widgetAction: WidgetPrimaryAction | null = null
  if (resolveDashboardPrimaryMode(bookingDistributionMode) === "widget") {
    const active = isBookingLinkAccessible(ctx.tenant.status, await getPublicationFlags(ctx.tenant.id))
    widgetAction = {
      active,
      scriptSnippet: buildEmbedScriptSnippet(ctx.tenant.slug, process.env.NEXT_PUBLIC_ROOT_DOMAIN),
      moduleUrl: active ? bookingLinkUrl(ctx.tenant.slug, marketingOrigin(process.env.NEXT_PUBLIC_ROOT_DOMAIN)) : null,
    }
  }

  return (
    <AdminShell
      widgetAction={widgetAction}
      brandName={siteConfig.brand.name}
      companyName={ctx.tenant.name || siteConfig.brand.name}
      adminName={ctx.user.name || ctx.user.email}
      isSuperAdmin={ctx.isSuperAdmin}
      groups={groups}
      primaryMobile={primaryMobile}
      publicUrl={publicLink?.url ?? null}
    >
      {children}
    </AdminShell>
  )
}
