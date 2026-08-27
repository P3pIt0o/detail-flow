import Link from "next/link"
import { Euro, PackageMinus, TrendingUp, CalendarDays, ArrowRight, AlertCircle, Clock } from "lucide-react"
import {
  getDashboardStats,
  getUpcomingBookingsDetailed,
  getDashboardWeek,
  getPendingDepositCount,
  getBookingCount,
} from "@/lib/admin/queries"
import { listCustomRequests } from "@/lib/custom-requests-queries"
import { getVisitStats } from "@/lib/analytics/queries"
import { getSettings, getServices, getBusinessHours } from "@/lib/booking/queries"
import { getFullSettings } from "@/lib/invoice/queries"
import { formatPrice, formatDateShort } from "@/lib/format"
import { StatusBadge } from "@/components/admin/status-badge"
import { DashboardWeek } from "@/components/admin/dashboard-week"
import { DashboardAnalytics } from "@/components/admin/dashboard-analytics"
import { OnboardingPanel } from "@/components/admin/onboarding-panel"
import { computeOnboardingSteps } from "@/lib/onboarding/steps"
import { withTenant } from "@/lib/tenant-link"
import { requireCompanyMember } from "@/lib/admin"
import { canUseFeature } from "@/lib/licensing/enforce"

export const dynamic = "force-dynamic"

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string }>
}) {
  const { tenant } = await searchParams
  const href = (path: string) => withTenant(path, tenant ?? null)

  // Contexte résolu CÔTÉ SERVEUR (jamais depuis le client). Sert à la fois à
  // l'isolation tenant et à l'évaluation des droits via le moteur central.
  // NB: `tenant` (ci-dessus) = slug d'URL ; `company` = entité résolue serveur.
  const { tenant: company } = await requireCompanyMember()
  const companyId = company.id

  // Onboarding « Vos premiers pas » — signaux dérivés des données RÉELLES du
  // tenant (aucune case cochée à la main). Toutes les lectures sont scopées au
  // companyId résolu côté serveur.
  const [obSettings, obServices, obHours, obFullSettings, obBookingCount] = await Promise.all([
    getSettings(companyId),
    getServices(companyId),
    getBusinessHours(companyId),
    getFullSettings(companyId),
    getBookingCount(companyId),
  ])
  const nonEmpty = (v: string | null | undefined) => Boolean(v && v.trim())
  const onboarding = computeOnboardingSteps({
    companyInfoComplete:
      nonEmpty(obSettings.businessName) && nonEmpty(obSettings.businessPhone) && nonEmpty(obSettings.businessAddress),
    billingConfirmed: Boolean(obFullSettings?.billingProfileConfirmedAt),
    hasService: obServices.length > 0,
    hasAvailability: obHours.some((h) => h.isOpen),
    publicSiteComplete: (nonEmpty(company.heroTitle) || nonEmpty(company.heroSubtitle)) && nonEmpty(obSettings.businessPhone),
    hasBooking: obBookingCount > 0,
  })
  // Réécrit les liens relatifs en liens tenant-safe (jamais de companyId client).
  const onboardingData = { ...onboarding, steps: onboarding.steps.map((s) => ({ ...s, href: href(s.href) })) }

  // Droits (moteur central). LEGACY (licensePlan = NULL) => true partout
  // (dashboard actuel strictement inchangé). Aucune décision `if (plan === ...)`.
  //  - business_stats : KPI métier agrégés + analytics de visites ;
  //  - profitability_analysis : bénéfice/résultat estimé (indépendant de stats) ;
  //  - les blocs OPÉRATIONNELS (semaine, prochains RDV, alertes) ne sont jamais gatés.
  const [canStats, canProfit] = await Promise.all([
    canUseFeature(companyId, "business_stats"),
    canUseFeature(companyId, "profitability_analysis"),
  ])

  // Les données premium ne sont chargées/calculées QUE si un droit les expose.
  // `getDashboardStats` est nécessaire pour les KPI métier (business_stats) OU
  // le bénéfice (profitability_analysis). Les visites (business_stats) et les
  // KPI ne sont pas calculés inutilement quand aucune feature ne les autorise.
  const needStats = canStats || canProfit
  const [stats, upcoming, week, requests, visitStats, pendingDepositCount] = await Promise.all([
    needStats ? getDashboardStats(companyId) : Promise.resolve(null),
    getUpcomingBookingsDetailed(5),
    getDashboardWeek(),
    listCustomRequests(),
    canStats ? getVisitStats() : Promise.resolve(null),
    // Compteur OPÉRATIONNEL (alerte), toujours chargé — indépendant du premium.
    getPendingDepositCount(companyId),
  ])

  // Demandes "à traiter" = reçues (new) ou proposition envoyée en attente de réponse.
  const pendingRequests = requests.filter((r) => r.status === "new" || r.status === "proposal_sent").length

  // KPI : cartes compactes, période = mois en cours.
  //  - business_stats : CA, dépenses produits, nombre de rendez-vous ;
  //  - profitability_analysis : bénéfice estimé (CA − dépenses).
  // Un plan peut avoir business_stats SANS profitability_analysis (ex. ESSENTIAL) :
  // dans ce cas les stats s'affichent mais le bénéfice reste masqué.
  const kpis: { label: string; value: string; icon: typeof Euro; accent: boolean }[] = []
  if (canStats && stats) {
    kpis.push(
      { label: "CA du mois", value: formatPrice(stats.monthRevenueCents), icon: Euro, accent: true },
      { label: "Dépenses produits", value: formatPrice(stats.monthProductsCents), icon: PackageMinus, accent: false },
    )
  }
  if (canProfit && stats) {
    kpis.push({ label: "Bénéfice estimé", value: formatPrice(stats.monthResultCents), icon: TrendingUp, accent: true })
  }
  if (canStats && stats) {
    kpis.push({ label: "Rendez-vous du mois", value: String(stats.monthBookingsCount), icon: CalendarDays, accent: false })
  }

  // Zone d'alertes : uniquement si une action est réellement nécessaire.
  // OPÉRATIONNEL — jamais gaté par une feature premium.
  const alerts: { label: string; href: string }[] = []
  if (pendingDepositCount > 0) {
    alerts.push({
      label: `${pendingDepositCount} réservation${pendingDepositCount > 1 ? "s" : ""} en attente d'acompte`,
      href: href("/admin/reservations"),
    })
  }
  if (pendingRequests > 0) {
    alerts.push({
      label: `${pendingRequests} demande${pendingRequests > 1 ? "s" : ""} personnalisée${pendingRequests > 1 ? "s" : ""} à traiter`,
      href: href("/admin/demandes"),
    })
  }

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Tableau de bord</h1>
        <p className="mt-1 text-sm text-muted-foreground">Votre activité en un coup d&apos;œil.</p>
      </header>

      {/* Onboarding « Vos premiers pas » — accompagnement progressif, non bloquant. */}
      <OnboardingPanel data={onboardingData} />

      {/* 1. KPI principaux — zone PREMIUM (business_stats / profitability_analysis).
          Verrouillée proprement si aucune des deux features n'est incluse, sans
          casser le reste du dashboard (opérationnel ci-dessous). */}
      {kpis.length > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kpis.map(({ label, value, icon: Icon, accent }) => (
              <div key={label} className="rounded-xl border border-border bg-card p-4">
                <div
                  className={
                    accent
                      ? "mb-3 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary"
                      : "mb-3 flex size-9 items-center justify-center rounded-lg bg-muted text-foreground"
                  }
                >
                  <Icon className="size-4" aria-hidden="true" />
                </div>
                <p className="text-xl font-bold text-foreground sm:text-2xl">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
          {canProfit ? (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Bénéfice estimé = chiffre d&apos;affaires − dépenses produits du mois. Estimation indicative, non comptable.
            </p>
          ) : null}
        </>
      ) : (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Cette fonctionnalité n&apos;est pas incluse dans votre licence.</p>
        </div>
      )}

      {/* 4. À surveiller — masqué s'il n'y a rien à signaler */}
      {alerts.length > 0 && (
        <section className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
            <AlertCircle className="size-4 text-amber-500" aria-hidden="true" />
            À surveiller
          </h2>
          <ul className="flex flex-col gap-1.5">
            {alerts.map((a) => (
              <li key={a.label}>
                <Link
                  href={a.href}
                  className="inline-flex items-center gap-1.5 text-sm text-foreground hover:text-primary hover:underline"
                >
                  {a.label}
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 2. Aperçu du calendrier (élément principal) */}
      <div className="mt-6">
        <DashboardWeek week={week} planningHref={href("/admin/calendrier")} />
      </div>

      {/* Visites du site (analytics V1) — statistique métier (business_stats).
          Masqué sans la feature ; les blocs opérationnels restent intacts. */}
      {visitStats ? (
        <div className="mt-6">
          <DashboardAnalytics stats={visitStats} />
        </div>
      ) : null}

      {/* 3. Prochains rendez-vous */}
      <section className="mt-6 rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Prochains rendez-vous</h2>
          <Link href={href("/admin/reservations")} className="text-xs font-medium text-primary hover:underline">
            Tout voir
          </Link>
        </div>

        {upcoming.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Aucun rendez-vous à venir.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {upcoming.map((b) => (
              <li key={b.id} className="flex items-start justify-between gap-3 py-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex shrink-0 flex-col items-center rounded-lg bg-muted px-2.5 py-1.5 text-center">
                    <Clock className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    <span className="mt-0.5 text-xs font-semibold text-foreground">{b.startTime}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{b.customerName}</p>
                    <p className="text-xs text-muted-foreground">{formatDateShort(b.date)}</p>
                    {b.services.length > 0 && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {b.services.join(" · ")}
                        {b.vehicles.length > 0 && ` — ${b.vehicles.join(", ")}`}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-sm font-semibold text-foreground">{formatPrice(b.totalCents)}</span>
                  <StatusBadge status={b.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
