import Link from "next/link"
import {
  Euro,
  Wallet,
  PackageMinus,
  TrendingUp,
  CalendarDays,
  ArrowRight,
  AlertCircle,
  Clock,
  Navigation,
  UserPlus,
  ClipboardList,
  Inbox,
  Info,
  Activity,
} from "lucide-react"
import { buildMapsDirectionsUrl } from "@/lib/notifications/maps"
import {
  getDashboardStats,
  getUpcomingBookingsDetailed,
  getDashboardWeek,
  getPendingDepositCount,
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
import { StartFlowCard } from "@/components/admin/start-flow-card"
import { SpiritDashboardRequests, type SpiritActionItem } from "@/components/admin/spirit-dashboard-requests"
import { computeOnboardingSteps } from "@/lib/onboarding/steps"
import { publicPageUrl, publicReservationUrl } from "@/lib/tenant-shared"
import { withTenant } from "@/lib/tenant-link"
import { requireCompanyMember } from "@/lib/admin"
import { canUseFeature } from "@/lib/licensing/enforce"
import { isPublicPagePublished } from "@/lib/public-page/config"
import { resolveDashboardIntent } from "@/lib/onboarding/intent"
import { getBookingSetupStatus } from "@/lib/booking/setup-status"
import { buildEmbedScriptSnippet, buildEmbedIframeSnippet } from "@/lib/embed/snippet"

export const dynamic = "force-dynamic"

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string; start?: string }>
}) {
  const { tenant, start } = await searchParams
  const href = (path: string) => withTenant(path, tenant ?? null)

  // Contexte résolu CÔTÉ SERVEUR (jamais depuis le client). Sert à la fois à
  // l'isolation tenant et à l'évaluation des droits via le moteur central.
  // NB: `tenant` (ci-dessus) = slug d'URL ; `company` = entité résolue serveur.
  const { tenant: company, user } = await requireCompanyMember()
  const companyId = company.id

  // Prénom pour l'accueil humain du dashboard. On n'invente JAMAIS un prénom :
  // si le nom ressemble à un email ou est vide, on retombe sur un accueil neutre.
  const rawName = (user.name ?? "").trim()
  const firstName = rawName && !rawName.includes("@") ? rawName.split(/\s+/)[0] : null

  // Dashboard Spirit ACS : réorganisation UX spécifique (Demandes → Planning →
  // Activité → Site), strictement gatée par `customSiteKey`. Tout autre tenant
  // (`customSiteKey` nul/autre) conserve EXACTEMENT le dashboard actuel.
  const isSpirit = company.customSiteKey === "spirit-acs"

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
    // Spirit sépare « aujourd'hui » et « prochains » : on charge un peu plus large.
    getUpcomingBookingsDetailed(isSpirit ? 8 : 5),
    getDashboardWeek(),
    listCustomRequests(),
    canStats ? getVisitStats() : Promise.resolve(null),
    // Compteur OPÉRATIONNEL (alerte), toujours chargé — indépendant du premium.
    getPendingDepositCount(companyId),
  ])

  // Demandes "à traiter" = reçues (new) ou proposition envoyée en attente de réponse.
  const pendingRequests = requests.filter((r) => r.status === "new" || r.status === "proposal_sent").length

  // Parcours d'onboarding à afficher — décidé CÔTÉ SERVEUR à partir de la valeur
  // PERSISTÉE `companies.onboardingIntent` (source de vérité, stable après
  // reconnexion), avec `?start=` en simple repli pour le tout premier rendu.
  // `null` pour un tenant historique (colonne NULL) ET pour tout site 100 %
  // personnalisé (customSiteKey non nul) → comportement historique strict.
  const contextualIntent = resolveDashboardIntent({
    persisted: company.onboardingIntent,
    customSiteKey: company.customSiteKey,
    transport: start ?? null,
  })

  // Panneau contextuel du parcours — mutuellement exclusif (jamais de blocs
  // contradictoires). On ne lit l'état de publication que si un parcours est
  // actif, pour éviter toute requête inutile en navigation historique.
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN
  const bookingSetup =
    contextualIntent === "booking_only" ? await getBookingSetupStatus(companyId) : null
  const startCard = contextualIntent ? (
    <StartFlowCard
      intent={contextualIntent}
      reservationUrl={publicReservationUrl(company.slug, rootDomain)}
      pageUrl={publicPageUrl(company.slug, rootDomain)}
      configureHref={href("/admin/page-publique")}
      bookingSettingsHref={href("/admin/ma-reservation")}
      customRequestHref={href("/admin/site-personnalise")}
      isPublished={contextualIntent === "public_page" ? await isPublicPagePublished(companyId) : false}
      bookingSetup={
        bookingSetup
          ? {
              ready: bookingSetup.ready,
              missing: bookingSetup.missing.map((m) => ({ id: m.id, todo: m.todo, href: href(m.href) })),
            }
          : undefined
      }
      scriptSnippet={bookingSetup ? buildEmbedScriptSnippet(company.slug, rootDomain) : undefined}
      iframeSnippet={bookingSetup ? buildEmbedIframeSnippet(company.slug, rootDomain) : undefined}
    />
  ) : null

  // KPI : cartes compactes, période = mois en cours.
  //  - business_stats : CA, dépenses produits, nombre de rendez-vous ;
  //  - profitability_analysis : bénéfice estimé (CA − dépenses).
  // Un plan peut avoir business_stats SANS profitability_analysis (ex. ESSENTIAL) :
  // dans ce cas les stats s'affichent mais le bénéfice reste masqué.
  // KPI PRINCIPAUX — 4 maximum (les détails avancés iront dans « Analyse »).
  // L'explication comptable détaillée est déportée en infobulle (`hint`) pour ne
  // plus encombrer le dashboard, sans jamais supprimer l'information.
  const kpis: { label: string; value: string; icon: typeof Euro; accent: boolean; hint?: string }[] = []
  if (canStats && stats) {
    // « CA facturé » (factures émises − avoirs) et « Encaissé » (argent réellement
    // reçu) restent deux notions DISTINCTES, jamais confondues.
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
  // Ne jamais afficher plus de 4 KPI sur la home (les autres vivront dans Analyse).
  const shownKpis = kpis.slice(0, 4)

  // Zone d'alertes : uniquement si une action est réellement nécessaire.
  // OPÉRATIONNEL — jamais gaté par une feature premium. NON utilisée pour Spirit
  // (le bloc « À traiter » couvre les demandes, et « Réservations » est masqué).
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

  // ACTIVITÉ RÉCENTE (disposition standard) — données RÉELLES : dernières
  // demandes reçues, triées par date décroissante. Jamais de timeline fictive ;
  // masquée si aucune donnée disponible.
  const recentActivity = [...requests]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5)
    .map((r) => {
      const vehicle = [r.vehicleBrand, r.vehicleModel].filter(Boolean).join(" ").trim() || r.vehicleType || null
      return {
        id: r.id,
        href: href(`/admin/demandes/${r.id}`),
        title: r.customerName || "Nouvelle demande",
        subtitle: [r.typeLabel, vehicle].filter(Boolean).join(" · ") || "Demande reçue",
        when: timeAgo(new Date(r.createdAt)),
      }
    })

  // Bloc KPI réutilisé à l'identique par les deux dispositions (Spirit / standard).
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

  // Ligne « prochain rendez-vous » réutilisée par les deux dispositions et, pour
  // Spirit, par « Aujourd'hui » comme par « Prochains rendez-vous ». Une seule
  // source de vérité pour le rendu d'un rendez-vous.
  const renderUpcoming = (b: UpcomingBookingDetailed) => {
    const mapsUrl = buildMapsDirectionsUrl(b.address)
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

  // ACTIONS RAPIDES — 3 maximum, uniquement vers des routes RÉELLES existantes.
  // Spirit ACS n'a ni Réservations ni Prestations : on n'oriente donc que vers
  // Demandes / Clients / Planning, qui restent disponibles pour ce tenant.
  const quickActions: { label: string; href: string; icon: typeof UserPlus }[] = isSpirit
    ? [
        { label: "Voir les demandes", href: href("/admin/demandes"), icon: Inbox },
        { label: "Nouveau client", href: href("/admin/clients/new"), icon: UserPlus },
        { label: "Planning", href: href("/admin/calendrier"), icon: CalendarDays },
      ]
    : [
        { label: "Nouveau client", href: href("/admin/clients/new"), icon: UserPlus },
        { label: "Voir le planning", href: href("/admin/calendrier"), icon: CalendarDays },
        { label: "Rendez-vous", href: href("/admin/reservations"), icon: ClipboardList },
      ]

  const primaryActionClass =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
  const secondaryActionClass =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"

  const header = (
    <header className="mb-6">
      <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
        {firstName ? `Bonjour ${firstName}` : "Bonjour 👋"}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {firstName ? "Voici ce qui se passe aujourd'hui." : "Voici l'activité de votre entreprise."}
      </p>

      {/* Actions rapides : 1 action principale + secondaires. Sur mobile, la 1re
          reste pleinement visible ; les autres passent en dessous (wrap). */}
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
  )

  /* ------------------------------------------------------------------ */
  /*  Disposition Spirit ACS : Demandes → Planning → Activité → Site.   */
  /* ------------------------------------------------------------------ */
  if (isSpirit) {
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

    // « Aujourd'hui » vs « Prochains » : on réutilise le MÊME jeu de rendez-vous
    // (aucun 2ᵉ système de calendrier). Le seuil « aujourd'hui » suit exactement
    // la borne serveur de getUpcomingBookingsDetailed (date ISO UTC courante).
    const todayStr = new Date().toISOString().slice(0, 10)
    const todayBookings = upcoming.filter((b) => b.date === todayStr)
    const laterBookings = upcoming.filter((b) => b.date > todayStr)

    return (
      <div className="mx-auto max-w-5xl">
        {header}

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

        {/* 3. ACTIVITÉ / CA — repositionné après les demandes et le planning.
            Le partage du lien public vit désormais dans le header (« Copier mon
            lien »), plus dans une carte dédiée. */}
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

  /* ------------------------------------------------------------------ */
  /*  Disposition STANDARD — inchangée pour tous les autres tenants.    */
  /* ------------------------------------------------------------------ */
  return (
    <div className="mx-auto max-w-5xl">
      {header}

      {/* Panneau contextuel du parcours choisi (booking_only / public_page /
          custom_website). Persistant : il réapparaît à chaque reconnexion tant
          que l'intention est renseignée. Null pour les tenants historiques. */}
      {startCard}

      {/* Onboarding « Vos premiers pas » — accompagnement progressif, non bloquant. */}
      <OnboardingPanel data={onboardingData} />

      {/* 1. À TRAITER — NIVEAU 1. Uniquement s'il existe réellement une action à
          mener. Mis en avant (accent primaire) : ressort davantage qu'un KPI
          passif. Le partage du lien vit dans le header (« Copier mon lien »). */}
      {alerts.length > 0 && (
        <section className="mt-6 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <AlertCircle className="size-4 text-primary" aria-hidden="true" />
            À traiter
          </h2>
          <ul className="flex flex-col divide-y divide-border">
            {alerts.map((a) => (
              <li key={a.label}>
                <Link
                  href={a.href}
                  className="flex min-h-11 items-center justify-between gap-3 py-1 text-sm font-medium text-foreground transition-colors hover:text-primary"
                >
                  <span className="text-pretty">{a.label}</span>
                  <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 2. AUJOURD'HUI / PROCHAINS RENDEZ-VOUS — NIVEAU 2, cœur opérationnel. */}
      <section className="mt-6 rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Prochains rendez-vous</h2>
          <Link href={href("/admin/reservations")} className="text-xs font-medium text-primary hover:underline">
            Tout voir
          </Link>
        </div>

        {upcoming.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm font-medium text-foreground">Aucun rendez-vous à venir.</p>
            <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground text-pretty">
              Partagez votre lien de réservation pour recevoir vos premiers rendez-vous.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border">{upcoming.map(renderUpcoming)}</ul>
        )}
      </section>

      {/* Aperçu de la semaine (planning). */}
      <div className="mt-6">
        <DashboardWeek week={week} planningHref={href("/admin/calendrier")} />
      </div>

      {/* 3. KPI principaux — NIVEAU 3. Zone PREMIUM (business_stats /
          profitability_analysis), verrouillée proprement sans casser le reste. */}
      <div className="mt-6">{kpiBlock}</div>

      {/* Visites du site (analytics V1) — statistique métier (business_stats). */}
      {visitStats ? (
        <div className="mt-6">
          <DashboardAnalytics stats={visitStats} />
        </div>
      ) : null}

      {/* 4. ACTIVITÉ RÉCENTE — données réelles (demandes reçues). Masqué si vide :
          jamais de fausse timeline. */}
      {recentActivity.length > 0 && (
        <section className="mt-6 rounded-xl border border-border bg-card p-4 sm:p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Activity className="size-4 text-muted-foreground" aria-hidden="true" />
            Activité récente
          </h2>
          <ul className="flex flex-col divide-y divide-border">
            {recentActivity.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="flex items-center justify-between gap-3 py-2.5 transition-colors hover:text-primary"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">{item.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{item.when}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

// Libellé relatif court et humain (« il y a 12 min », « hier », « il y a 3 j »).
// Utilisé uniquement pour l'affichage de l'activité récente ; les dates réelles
// restent inchangées côté données.
function timeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime()
  if (!Number.isFinite(diffMs) || diffMs < 0) return "à l'instant"
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min} min`
  const hours = Math.floor(min / 60)
  if (hours < 24) return `il y a ${hours} h`
  const days = Math.floor(hours / 24)
  if (days === 1) return "hier"
  if (days < 7) return `il y a ${days} j`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `il y a ${weeks} sem`
  const months = Math.floor(days / 30)
  if (months < 12) return `il y a ${months} mois`
  return `il y a ${Math.floor(days / 365)} an${days >= 730 ? "s" : ""}`
}
