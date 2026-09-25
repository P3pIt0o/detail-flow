import type React from "react"
import { requireCompanyMember } from "@/lib/admin"
import { AdminShell } from "@/components/admin/admin-shell"
import { buildAdminNavGroups, buildMobilePrimaryNav } from "@/lib/admin/nav"
import { resolvePublicLink } from "@/lib/admin/public-link"
import { resolveDashboardIntent } from "@/lib/onboarding/intent"
import { siteConfig } from "@/config/site"

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
  const navOpts = { intent: onboardingIntent, customSiteKey: ctx.tenant.customSiteKey ?? null }
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

  return (
    <AdminShell
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
