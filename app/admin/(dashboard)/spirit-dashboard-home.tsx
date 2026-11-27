import Link from "next/link"
import {
  Euro,
  Wallet,
  PackageMinus,
  TrendingUp,
  CalendarDays,
  ArrowRight,
  Clock,
  Navigation,
  UserPlus,
  Inbox,
  Info,
} from "lucide-react"
import { buildMapsDirectionsUrl } from "@/lib/notifications/maps"
import { getLocationConfig } from "@/lib/booking/location"
import { showDirections } from "@/lib/admin/nav"
import {
  getDashboardStats,
  getUpcomingBookingsDetailed,
  getDashboardWeek,
  getBookingCount,
  type UpcomingBookingDetailed,
} from "@/lib/admin/queries"
import { listCustomRequests } from "@/lib/custom-requests-queries"
import { countAttachmentsByRequest } from "@/lib/quote-photos/server"
import { getVisitStats } from "@/lib/analytics/queries"
import { getSettings, getServices, getBusinessHours } from "@/lib/booking/queries"
import { getFullSettings } from "@/lib/invoice/queries"
import { formatPrice, formatDateShort } from "@/lib/format"
import { StatusBadge } from "@/components/admin/status-badge"
import { DashboardWeek } from "@/components/admin/dashboard-week"
import { DashboardAnalytics } from "@/components/admin/dashboard-analytics"
import { OnboardingPanel } from "@/components/admin/onboarding-panel"
import { SpiritDashboardRequests, type SpiritActionItem } from "@/components/admin/spirit-dashboard-requests"
import { computeOnboardingSteps } from "@/lib/onboarding/steps"
import { withTenant } from "@/lib/tenant-link"
import { canUseFeature } from "@/lib/licensing/enforce"
import type { Tenant } from "@/lib/tenant"

/**
 * Dashboard Spirit ACS (site 100 % personnalisé, parcours demande → devis) :
 * Demandes → Planning → Activité → Site. Écran déplacé tel quel depuis
 * `page.tsx` (L96). `company` est TOUJOURS résolu côté serveur par la page
 * (requireCompanyMember), jamais reçu du navigateur.
 */
export async function SpiritDashboardHome({
  company,
  firstName,
  tenant,
}: {
  company: Tenant
  firstName: string | null
  tenant: string | null
}) {
  const companyId = company.id
  const href = (path: string) => withTenant(path, tenant)

  // Onboarding « Vos premiers pas » — signaux dérivés des données RÉELLES du tenant.
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

  // Droits (moteur central) : business_stats (KPI + visites) et
  // profitability_analysis (bénéfice estimé), décidés séparément.
  const [canStats, canProfit] = await Promise.all([
    canUseFeature(companyId, "business_stats"),
    canUseFeature(companyId, "profitability_analysis"),
  ])
  const needStats = canStats || canProfit
  const [stats, upcoming, week, requests, visitStats, locationConfig] = await Promise.all([
    needStats ? getDashboardStats(companyId) : Promise.resolve(null),
    getUpcomingBookingsDetailed(8),
    getDashboardWeek(),
    listCustomRequests(),
    canStats ? getVisitStats() : Promise.resolve(null),
    getLocationConfig(companyId),
  ])

  // KPI : 4 maximum, période = mois en cours. « CA facturé » et « Encaissé »
  // restent deux notions DISTINCTES, jamais confondues.
  const kpis: { label: string; value: string; icon: typeof Euro; accent: boolean; hint?: string }[] = []
  if (canStats && stats) {
    kpis.push(
      {
        label: "CA facturé ce mois",
        value: formatPrice(stats.monthRevenueCents),
        icon: Euro,
        accent: true,
        hint: "Factures émises ce mois, moins les avoirs.",
      },
      {
        label: "Encaissé ce mois",
        value: formatPrice(stats.collectedNetCents),
        icon: Wallet,
        accent: true,
        hint: "Paiements réellement reçus ce mois (par date de paiement), montant brut avant frais Stripe et net des remboursements.",
      },
    )
  }
  if (canProfit && stats) {
    kpis.push({
      label: "Bénéfice estimé",
      value: formatPrice(stats.monthResultCents),
      icon: TrendingUp,
      accent: true,
      hint: "CA facturé − dépenses produits du mois. Estimation indicative, non comptable.",
    })
  }
  if (canStats && stats) {
    kpis.push(
      { label: "Rendez-vous du mois", value: String(stats.monthBookingsCount), icon: CalendarDays, accent: false },
      {
        label: "Dépenses produits",
        value: formatPrice(stats.monthProductsCents),
        icon: PackageMinus,
        accent: false,
      },
    )
  }
  const shownKpis = kpis.slice(0, 4)

  // 4 KPI maximum ; les explications comptables passent en infobulle (`title`).
  const kpiBlock =
    shownKpis.length > 0 ? (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {shownKpis.map(({ label, value, icon: Icon, accent, hint }) => (
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
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <span className="truncate">{label}</span>
              {hint ? (
                <span
                  className="inline-flex cursor-help text-muted-foreground/70"
                  title={hint}
                  tabIndex={0}
                  role="note"
                  aria-label={`${label} : ${hint}`}
                >
                  <Info className="size-3.5" aria-hidden="true" />
                </span>
              ) : null}
            </p>
          </div>
        ))}
      </div>
    ) : (
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">Cette fonctionnalité n&apos;est pas incluse dans votre licence.</p>
      </div>
    )

  // « Itinéraire » : inutile pour un detailer qui travaille uniquement en atelier.
  const directions = showDirections(locationConfig)

  // Ligne « rendez-vous » réutilisée par « Aujourd'hui » et « Prochains rendez-vous ».
  const renderUpcoming = (b: UpcomingBookingDetailed) => {
    const mapsUrl = directions ? buildMapsDirectionsUrl(b.address) : null
    return (
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
          {mapsUrl ? (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-primary hover:underline"
              aria-label={`Itinéraire vers ${b.address}`}
            >
              <Navigation className="size-3.5" aria-hidden="true" />
              Itinéraire
            </a>
          ) : null}
        </div>
      </li>
    )
  }

  // ACTIONS RAPIDES : Spirit ACS n'a ni Réservations ni Prestations.
  const quickActions: { label: string; href: string; icon: typeof UserPlus }[] = [
    { label: "Voir les demandes", href: href("/admin/demandes"), icon: Inbox },
    { label: "Nouveau client", href: href("/admin/clients/new"), icon: UserPlus },
    { label: "Planning", href: href("/admin/calendrier"), icon: CalendarDays },
  ]

  const primaryActionClass =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
  const secondaryActionClass =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"

  // « À traiter » = état RÉEL nécessitant une action de Corentin :
  //  - new      : demande reçue, à étudier ;
  //  - accepted : proposition acceptée, à organiser (RDV).
  // `proposal_sent` = en attente de réponse client (pas une action de Corentin).
  // `declined` / `converted` = terminées. Statuts issus du module Demandes existant.
  const ACTION_STATUSES = new Set(["new", "accepted"])
  const actionRequests = requests.filter((r) => ACTION_STATUSES.has(r.status))
  const waitingClientCount = requests.filter((r) => r.status === "proposal_sent").length
  const topActionRequests = actionRequests.slice(0, 3)
  const photoCounts = await countAttachmentsByRequest(
    topActionRequests.map((r) => r.id),
    companyId,
  )
  const actionItems: SpiritActionItem[] = topActionRequests.map((r) => ({
    id: r.id,
    href: href(`/admin/demandes/${r.id}`),
    customerName: r.customerName,
    vehicle: [r.vehicleBrand, r.vehicleModel].filter(Boolean).join(" ").trim() || r.vehicleType || null,
    typeLabel: r.typeLabel,
    createdAt: r.createdAt,
    status: r.status,
    photoCount: photoCounts.get(r.id) ?? 0,
    isNew: r.status === "new",
  }))

  // « Aujourd'hui » vs « Prochains » : le MÊME jeu de rendez-vous. Le seuil suit
  // la borne serveur de getUpcomingBookingsDetailed (date ISO UTC courante).
  const todayStr = new Date().toISOString().slice(0, 10)
  const todayBookings = upcoming.filter((b) => b.date === todayStr)
  const laterBookings = upcoming.filter((b) => b.date > todayStr)

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
          {firstName ? `Bonjour ${firstName}` : "Bonjour 👋"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {firstName ? "Voici ce qui se passe aujourd'hui." : "Voici l'activité de votre entreprise."}
        </p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {quickActions.map((a, i) => {
            const Icon = a.icon
            return (
              <Link key={a.href + a.label} href={a.href} className={i === 0 ? primaryActionClass : secondaryActionClass}>
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {a.label}
              </Link>
            )
          })}
        </div>
      </header>

      {/* Onboarding « Vos premiers pas » — accompagnement progressif, non bloquant. */}
      <OnboardingPanel data={onboardingData} />

      {/* 1. À TRAITER — élément le plus visible dès qu'une action est nécessaire. */}
      <SpiritDashboardRequests
        items={actionItems}
        actionCount={actionRequests.length}
        waitingClientCount={waitingClientCount}
        allHref={href("/admin/demandes")}
      />

      {/* 2. PLANNING — Aujourd'hui, puis prochains rendez-vous, puis la semaine. */}
      <section className="mt-6 rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Aujourd&apos;hui</h2>
          <Link
            href={href("/admin/calendrier")}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Planning complet
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
        {todayBookings.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Aucun rendez-vous aujourd&apos;hui.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">{todayBookings.map(renderUpcoming)}</ul>
        )}
      </section>

      {laterBookings.length > 0 && (
        <section className="mt-6 rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Prochains rendez-vous</h2>
            <Link href={href("/admin/calendrier")} className="text-xs font-medium text-primary hover:underline">
              Tout voir
            </Link>
          </div>
          <ul className="flex flex-col divide-y divide-border">{laterBookings.map(renderUpcoming)}</ul>
        </section>
      )}

      <div className="mt-6">
        <DashboardWeek week={week} planningHref={href("/admin/calendrier")} />
      </div>

      {/* 3. ACTIVITÉ / CA — après les demandes et le planning. */}
      <div className="mt-6">{kpiBlock}</div>

      {/* Visites du site (analytics V1) — statistique métier (business_stats). */}
      {visitStats ? (
        <div className="mt-6">
          <DashboardAnalytics stats={visitStats} />
        </div>
      ) : null}
    </div>
  )
}
