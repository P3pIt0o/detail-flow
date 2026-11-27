import { TodayScreen } from "@/components/admin/today/today-screen"
import { buildTodayModel, shouldShareReservation } from "@/lib/admin/today"
import { loadTodayData } from "@/lib/admin/today-query"
import { humanReservationUrl, humanSiteUrl } from "@/lib/admin/public-link"
import { withTenant } from "@/lib/tenant-link"
import { requireCompanyMember, getCompanyOwnerName } from "@/lib/admin"
import { canUseFeature } from "@/lib/licensing/enforce"
import { resolveDashboardIntent } from "@/lib/onboarding/intent"
import { SpiritDashboardHome } from "./spirit-dashboard-home"

export const dynamic = "force-dynamic"

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string; start?: string }>
}) {
  const { tenant, start } = await searchParams

  // Contexte résolu CÔTÉ SERVEUR (jamais depuis le client). Sert à la fois à
  // l'isolation tenant et à l'évaluation des droits via le moteur central.
  // NB: `tenant` (ci-dessus) = slug d'URL ; `company` = entité résolue serveur.
  const { tenant: company, user, isSuperAdmin } = await requireCompanyMember()
  const companyId = company.id

  // Prénom pour l'accueil « Bonjour … ». Un super-admin en assistance voit le
  // prénom du PROPRIÉTAIRE du tenant consulté, jamais le sien. On n'invente
  // jamais un prénom (email ou vide → accueil neutre).
  const greetingSourceName = isSuperAdmin ? await getCompanyOwnerName(companyId) : user.name
  const rawName = (greetingSourceName ?? "").trim()
  const firstName = rawName && !rawName.includes("@") ? rawName.split(/\s+/)[0] : null

  // Spirit ACS (site sur mesure, sans réservation) garde son écran, strictement
  // gaté par `customSiteKey`.
  const isSpirit = company.customSiteKey === "spirit-acs"
  if (isSpirit) {
    return <SpiritDashboardHome company={company} firstName={firstName} tenant={tenant ?? null} />
  }

  // Droits (moteur central) : les chiffres ne sont calculés qu'avec
  // `business_stats`, les prospects qu'avec `leads_crm`.
  const [canStats, canLeads] = await Promise.all([
    canUseFeature(companyId, "business_stats"),
    canUseFeature(companyId, "leads_crm"),
  ])

  // UNE seule requête groupée pour tout l'écran, filtrée par `companyId`.
  const data = await loadTodayData(companyId, { timezone: company.timezone, canStats, canLeads })

  const intent = resolveDashboardIntent({
    persisted: company.onboardingIntent,
    customSiteKey: company.customSiteKey,
    transport: start ?? null,
  })
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN
  const reservationUrl = humanReservationUrl(company.slug, rootDomain)
  const pageUrl = humanSiteUrl(company.slug, rootDomain)
  const href = (path: string) => withTenant(path, tenant ?? null)

  const model = buildTodayModel(data, {
    href,
    intent,
    customSiteKey: company.customSiteKey,
    distributionMode: company.bookingDistributionMode,
    siteTextComplete: Boolean(company.heroTitle?.trim() || company.heroSubtitle?.trim()),
    paymentsEnabled: company.paymentsEnabled,
    // Page non publiée, « réservation seule », widget ou site sur mesure : le lien de réservation.
    shareUrl: shouldShareReservation({ publishedPage: data.publishedPage, intent, distributionMode: company.bookingDistributionMode, customSiteKey: company.customSiteKey }) ? reservationUrl : pageUrl,
  })

  return <TodayScreen model={model} firstName={firstName} tenant={tenant ?? null} statsHref={href("/admin/analyse")} />
}
