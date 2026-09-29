import type { Metadata } from "next"
import Link from "next/link"
import { requireCompanyMember } from "@/lib/admin"
import { canUseFeature } from "@/lib/licensing/enforce"
import { businessToday } from "@/lib/analytics/periods"
import {
  addDaysYmd,
  followUpBucket,
  isLeadSource,
  isLeadStatus,
  toValidDate,
  zonedStartOfDayUtc,
  type LeadSource,
  type LeadStatus,
} from "@/lib/leads/model"
import { getLeadKpis, isLeadsSchemaNotReady, listLeads, type LeadKpis, type LeadListResult } from "@/lib/leads/server"
import { withTenant } from "@/lib/tenant-link"
import { LeadsKpis } from "@/components/admin/leads/leads-kpis"
import { LeadsFilters } from "@/components/admin/leads/leads-filters"
import { LeadCard, type LeadCardData } from "@/components/admin/leads/lead-card"
import { LeadsLocked } from "@/components/admin/leads/leads-locked"
import { LeadsInitializing } from "@/components/admin/leads/leads-initializing"
import { NewLeadDialog } from "@/components/admin/leads/new-lead-dialog"

export const metadata: Metadata = {
  title: "Prospects · DetailFlow",
  description: "Suivez vos prospects de la première demande jusqu'au client.",
}

const PRICING_HREF = `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/marketing`
const PAGE_SIZE = 25

function vehicleLabel(brand: string | null, model: string | null): string | null {
  const parts = [brand, model].filter(Boolean)
  return parts.length ? parts.join(" ") : null
}

/** Libellé relatif court et sûr pour la dernière activité (fuseau non critique ici). */
function relativeLabel(from: Date | string | number | null, now: Date): string {
  const date = toValidDate(from)
  // Repli d'affichage sur une date invalide : on ne fait jamais tomber la page,
  // mais on ne masque pas une erreur DB structurelle (les valeurs remontent d'un
  // chemin déjà normalisé en amont dans `listLeads`).
  if (!date) return "Activité récente"
  const diffMs = now.getTime() - date.getTime()
  const day = 86_400_000
  const days = Math.floor(diffMs / day)
  if (days <= 0) return "Aujourd'hui"
  if (days === 1) return "Hier"
  if (days < 7) return `Il y a ${days} j`
  if (days < 30) return `Il y a ${Math.floor(days / 7)} sem.`
  if (days < 365) return `Il y a ${Math.floor(days / 30)} mois`
  return `Il y a ${Math.floor(days / 365)} an(s)`
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireCompanyMember()
  const companyId = ctx.tenant.id
  const allowed = await canUseFeature(companyId, "leads_crm")

  const header = (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Prospects</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          Suivez vos prospects de la première demande jusqu&apos;au client.
        </p>
      </div>
      {allowed ? <NewLeadDialog /> : null}
    </header>
  )

  if (!allowed) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">
        {header}
        <LeadsLocked pricingHref={PRICING_HREF} />
      </div>
    )
  }

  const sp = await searchParams
  const readStr = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

  // Contexte tenant (aperçu sans sous-domaine) : conservé sur tous les liens internes.
  const tenant = readStr(sp.tenant) ?? null

  const statusRaw = readStr(sp.status)
  const status: LeadStatus | null = isLeadStatus(statusRaw) ? statusRaw : null
  const sourceRaw = readStr(sp.source)
  const source: LeadSource | null = isLeadSource(sourceRaw) ? sourceRaw : null
  const due = readStr(sp.due) === "1"
  const query = readStr(sp.q)?.trim() || null
  const page = Math.max(1, Number(readStr(sp.page)) || 1)

  const tz = ctx.tenant.timezone
  const todayYmd = businessToday(new Date(), tz)
  // « À relancer » : relance due jusqu'à la fin de la journée métier (= début de demain local).
  const dueBefore = zonedStartOfDayUtc(addDaysYmd(todayYmd, 1), tz)

  let kpis: LeadKpis
  let result: LeadListResult
  try {
    ;[kpis, result] = await Promise.all([
      getLeadKpis(companyId, dueBefore),
      listLeads({
        companyId,
        status,
        source,
        dueBefore: due ? dueBefore : null,
        query,
        page,
        pageSize: PAGE_SIZE,
      }),
    ])
  } catch (err) {
    // Tables CRM pas encore créées (migration additive non appliquée) : état
    // propre plutôt qu'une 500. Toute autre erreur remonte normalement.
    if (isLeadsSchemaNotReady(err)) {
      return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">
          {header}
          <LeadsInitializing />
        </div>
      )
    }
    throw err
  }

  const now = new Date()
  const cards: LeadCardData[] = result.items.map((item) => {
    const followYmd = item.nextFollowUpAt ? businessToday(item.nextFollowUpAt, tz) : null
    return {
      id: item.id,
      href: withTenant(`/admin/leads/${item.id}`, tenant),
      contactName: item.contactName,
      status: item.status,
      source: item.source,
      phone: item.phone,
      email: item.email,
      vehicle: vehicleLabel(item.vehicleBrand, item.vehicleModel),
      serviceInterest: item.serviceInterest,
      followUpBucket: followUpBucket(followYmd, todayYmd),
      lastActivityLabel: relativeLabel(item.lastActivityAt, now),
    }
  })

  const hasAnyFilter = Boolean(status || source || due || query)

  function pageHref(target: number): string {
    const params = new URLSearchParams()
    if (status) params.set("status", status)
    if (source) params.set("source", source)
    if (due) params.set("due", "1")
    if (query) params.set("q", query)
    if (target > 1) params.set("page", String(target))
    const qs = params.toString()
    return withTenant(qs ? `/admin/leads?${qs}` : "/admin/leads", tenant)
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">
      {header}
      <LeadsKpis kpis={kpis} tenant={tenant} />
      <LeadsFilters />

      {cards.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/50 p-10 text-center">
          {hasAnyFilter ? (
            <>
              <p className="font-medium text-foreground">Aucun prospect ne correspond à ces filtres.</p>
              <Link href={withTenant("/admin/leads", tenant)} className="text-sm font-medium text-primary hover:underline">
                Réinitialiser les filtres
              </Link>
            </>
          ) : (
            <>
              <p className="font-medium text-foreground">Vous n&apos;avez encore aucun prospect.</p>
              <p className="max-w-sm text-sm text-muted-foreground text-pretty">
                Ajoutez un prospect manuellement ou recevez vos demandes depuis votre site.
              </p>
              <div className="pt-1">
                <NewLeadDialog />
              </div>
            </>
          )}
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-2.5">
            {cards.map((lead) => (
              <li key={lead.id}>
                <LeadCard lead={lead} />
              </li>
            ))}
          </ul>

          {result.totalPages > 1 ? (
            <nav className="flex items-center justify-between gap-2" aria-label="Pagination">
              {page > 1 ? (
                <Link
                  href={pageHref(page - 1)}
                  className="inline-flex min-h-10 items-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-muted"
                >
                  Précédent
                </Link>
              ) : (
                <span />
              )}
              <span className="text-sm text-muted-foreground">
                Page {result.page} / {result.totalPages}
              </span>
              {page < result.totalPages ? (
                <Link
                  href={pageHref(page + 1)}
                  className="inline-flex min-h-10 items-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-muted"
                >
                  Suivant
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      )}
    </div>
  )
}
