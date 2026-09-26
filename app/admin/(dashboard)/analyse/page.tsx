import type { Metadata } from "next"
import {
  Banknote,
  CalendarCheck,
  Coins,
  Eye,
  Receipt,
  Repeat,
  ShoppingBag,
  TrendingUp,
  UserPlus,
  Wallet,
} from "lucide-react"
import { requireCompanyId } from "@/lib/tenant"
import { canUseFeature } from "@/lib/licensing/enforce"
import { formatMoney } from "@/lib/format"
import { resolveAnalyseAccess } from "@/lib/analytics/access"
import { loadAnalyseData } from "@/lib/analytics/business"
import { parsePeriod, PERIOD_LABELS, type AnalysePeriod } from "@/lib/analytics/periods"
import { AnalyseKpi } from "@/components/admin/analyse/analyse-kpi"
import { AnalyseLocked } from "@/components/admin/analyse/analyse-locked"
import { ConversionFunnel } from "@/components/admin/analyse/conversion-funnel"
import { InsightsList } from "@/components/admin/analyse/insights-list"
import { PeriodSelector } from "@/components/admin/analyse/period-selector"
import { RevenueAreaChart } from "@/components/admin/analyse/revenue-area-chart"
import { ShareBars } from "@/components/admin/analyse/share-bars"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Analyse · DetailFlow",
  description: "Suivez la performance de votre activité : chiffre d'affaires, rendez-vous, clients et rentabilité.",
}

/** Lien vers les offres (site marketing DetailFlow) — aucun achat automatique. */
const PRICING_HREF = `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/marketing`

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-muted-foreground text-pretty">{description}</p> : null}
      </div>
      {children}
    </section>
  )
}

export default async function AnalysePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const companyId = await requireCompanyId()
  const sp = await searchParams
  const period = parsePeriod(sp.period)

  // Droits : source de vérité serveur, jamais un `if (plan === ...)`.
  const [businessStats, profitability, advanced] = await Promise.all([
    canUseFeature(companyId, "business_stats"),
    canUseFeature(companyId, "profitability_analysis"),
    canUseFeature(companyId, "advanced_reporting"),
  ])
  const access = resolveAnalyseAccess({ businessStats, profitability, advanced })

  const hrefFor = (p: AnalysePeriod) => (p === "30d" ? "/admin/analyse" : `/admin/analyse?period=${p}`)

  const header = (
    <header className="flex flex-col gap-1">
      <h1 className="text-xl font-bold text-foreground sm:text-2xl">Analyse</h1>
      <p className="text-sm text-muted-foreground text-pretty">
        La performance de votre activité, calculée à partir de vos données réelles.
      </p>
    </header>
  )

  if (access.locked) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">
        {header}
        <AnalyseLocked pricingHref={PRICING_HREF} />
      </div>
    )
  }

  const data = await loadAnalyseData(companyId, period, access)
  const { essentials, profitability: profit, advanced: adv, financial } = data

  // Devises d'affichage résolues côté serveur (jamais de € codé en dur). Les
  // FACTURES et les PAIEMENTS ont leur propre devise (elles peuvent différer).
  const money = (cents: number) => formatMoney(cents, financial.invoiceCurrency)
  const moneyPay = (cents: number) => formatMoney(cents, financial.paymentsCurrency)

  // DetailFlow ne convertit JAMAIS de change : dès que plusieurs devises
  // incompatibles coexistent, on n'agrège AUCUN total et on l'explique. Les
  // décisions (factures / paiements / rentabilité) viennent de `financial`.
  const invoicesComparable = financial.currentComparable
  const currencyNotice = (currencies: string[]) => (
    <p className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground text-pretty">
      Plusieurs devises ({currencies.join(", ")}) sont présentes sur cette période. Les totaux financiers ne
      peuvent pas être regroupés sans conversion.
    </p>
  )
  const invoiceNotice = currencyNotice(financial.invoiceCurrencies)
  const paymentsNotice = (
    <p className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground text-pretty">
      Plusieurs devises ({financial.paymentCurrencies.join(", ")}) sont présentes dans les paiements de cette
      période. Le total ne peut pas être regroupé sans conversion.
    </p>
  )

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        {header}
        <PeriodSelector active={period} hrefFor={hrefFor} />
      </div>

      {essentials ? (
        <>
          {invoicesComparable ? null : invoiceNotice}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <AnalyseKpi
              label={`CA facturé · ${PERIOD_LABELS[period].toLowerCase()}`}
              value={invoicesComparable ? money(essentials.invoicedRevenueCents ?? 0) : "—"}
              icon={Banknote}
              hint={
                invoicesComparable
                  ? "Factures payées, net des avoirs, sur la période."
                  : "Plusieurs devises sur la période : total non regroupable."
              }
              change={adv?.revenueChange ?? undefined}
            />
            <AnalyseKpi
              label="Rendez-vous"
              value={String(essentials.appointmentsTotal)}
              icon={CalendarCheck}
              hint="Rendez-vous confirmés ou terminés (hors annulés)."
              change={adv?.appointmentsChange}
            />
            <AnalyseKpi
              label="Panier moyen"
              value={
                invoicesComparable && essentials.averageBasketCents !== null
                  ? money(essentials.averageBasketCents)
                  : "—"
              }
              icon={ShoppingBag}
              hint={
                invoicesComparable
                  ? "CA des factures payées ÷ nombre de factures payées."
                  : "Plusieurs devises sur la période : total non regroupable."
              }
              change={adv?.basketChange ?? undefined}
            />
            <AnalyseKpi
              label="Nouveaux clients"
              value={String(essentials.clients.newClients)}
              icon={UserPlus}
              hint="Clients dont le tout premier rendez-vous tombe dans la période."
              change={adv?.newClientsChange}
            />
          </div>

          {invoicesComparable ? (
            <Section
              title="Évolution du chiffre d'affaires"
              description="CA facturé (net des avoirs) sur la période sélectionnée."
            >
              <RevenueAreaChart
                data={essentials.revenueSeries}
                granularity={essentials.granularity}
                currencyCode={financial.invoiceCurrency}
              />
            </Section>
          ) : null}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Section title="Encaissements réels" description="Ce qui est réellement entré sur la période.">
              {financial.paymentsComparable && essentials.collected ? (
                <dl className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Wallet className="size-4" aria-hidden="true" /> Encaissé net
                    </dt>
                    <dd className="tabular-nums text-sm font-semibold text-foreground">
                      {moneyPay(essentials.collected.netCents)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Coins className="size-4" aria-hidden="true" /> Encaissé brut
                    </dt>
                    <dd className="tabular-nums text-sm text-foreground">
                      {moneyPay(essentials.collected.grossCents)}
                    </dd>
                  </div>
                  {essentials.collected.refundedCents > 0 ? (
                    <div className="flex items-center justify-between gap-3">
                      <dt className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Receipt className="size-4" aria-hidden="true" /> Remboursé
                      </dt>
                      <dd className="tabular-nums text-sm text-foreground">
                        −{moneyPay(essentials.collected.refundedCents)}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              ) : (
                paymentsNotice
              )}
            </Section>

            <Section title="Clientèle" description="Répartition des clients vus sur la période.">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-muted p-3">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <UserPlus className="size-3.5" aria-hidden="true" /> Nouveaux
                  </p>
                  <p className="mt-1 text-lg font-bold text-foreground">{essentials.clients.newClients}</p>
                </div>
                <div className="rounded-lg bg-muted p-3">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Repeat className="size-3.5" aria-hidden="true" /> Récurrents
                  </p>
                  <p className="mt-1 text-lg font-bold text-foreground">{essentials.clients.returningClients}</p>
                </div>
              </div>
              <p className="mt-3 flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Eye className="size-4" aria-hidden="true" /> Visiteurs du site
                </span>
                <span className="tabular-nums font-semibold text-foreground">
                  {essentials.site.uniqueVisitors.toLocaleString("fr-FR")}
                </span>
              </p>
            </Section>
          </div>
        </>
      ) : null}

      {profit ? (
        <Section
          title="Rentabilité estimée"
          description="Estimation simple : CA facturé moins le coût des produits/consommables achetés. N'inclut pas les charges (temps, déplacements, taxes)."
        >
          {profit.comparable ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <AnalyseKpi
                label="CA facturé"
                value={formatMoney(profit.invoicedRevenueCents ?? 0, profit.currencyCode)}
                icon={Banknote}
              />
              <AnalyseKpi
                label="Coût produits"
                value={formatMoney(profit.productCostsCents ?? 0, profit.currencyCode)}
                icon={ShoppingBag}
              />
              <AnalyseKpi
                label="Résultat estimé"
                value={formatMoney(profit.resultCents ?? 0, profit.currencyCode)}
                icon={TrendingUp}
                hint="CA facturé − coût des produits. Indicatif."
              />
            </div>
          ) : (
            <p className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground text-pretty">
              Le résultat estimé n&apos;est pas disponible pour cette période car les dépenses enregistrées et le
              chiffre d&apos;affaires ne sont pas dans une devise comparable.
            </p>
          )}
        </Section>
      ) : null}

      {adv ? (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Section title="Prestations les plus demandées" description="Par nombre de rendez-vous sur la période.">
              <ShareBars rows={adv.serviceVolume} kind="count" />
            </Section>
            <Section
              title="Prestations qui génèrent le plus de CA"
              description="Répartition du chiffre d'affaires facturé par prestation sur la période."
            >
              {invoicesComparable ? (
                <ShareBars rows={adv.serviceRevenue} kind="money" currencyCode={financial.invoiceCurrency} />
              ) : (
                invoiceNotice
              )}
            </Section>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Section title="Conversion du site" description="Du visiteur à la réservation.">
              <ConversionFunnel
                uniqueVisitors={adv.site.uniqueVisitors}
                bookingClicks={adv.site.bookingClicks}
                bookingsCompleted={adv.site.bookingsCompleted}
                conversionRate={adv.site.conversionRate}
              />
            </Section>
            <Section title="Ce que vos chiffres suggèrent" description="Observations calculées, sans jugement.">
              <InsightsList insights={adv.insights} />
            </Section>
          </div>
        </>
      ) : null}
    </div>
  )
}
