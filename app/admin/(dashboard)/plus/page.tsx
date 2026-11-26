import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { requireCompanyMember } from "@/lib/admin"
import { buildPlusGroups, canExportData, type PlusItem } from "@/lib/admin/nav"
import { getBookingDistributionMode } from "@/lib/company/booking-distribution"
import { resolveDashboardIntent } from "@/lib/onboarding/intent"
import { withTenant } from "@/lib/tenant-link"
import { NAV_ICONS } from "@/components/admin/nav-icons"
import { SettingsSearch } from "@/components/admin/settings/settings-search"

export const metadata: Metadata = { title: "Plus" }

/**
 * Page « Plus » : tous les écrans en trois rubriques, recherche des réglages en tête.
 * Le bloc compte (lien, déconnexion…) est ajouté par le shell sur mobile.
 */
export default async function PlusPage({ searchParams }: { searchParams: Promise<{ tenant?: string }> }) {
  const { tenant: tenantParam } = await searchParams
  // Contexte résolu CÔTÉ SERVEUR ; `tenantParam` ne sert qu'à conserver les liens d'aperçu.
  const { tenant: company, role, isSuperAdmin } = await requireCompanyMember()

  const customSiteKey = company.customSiteKey ?? null
  const intent = resolveDashboardIntent({ persisted: company.onboardingIntent, customSiteKey })
  const groups = buildPlusGroups({
    intent,
    customSiteKey,
    bookingDistributionMode: await getBookingDistributionMode(company.id),
    canExport: canExportData({ role, isSuperAdmin }),
  })

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">Plus</h1>

      <SettingsSearch tenantParam={tenantParam ?? null} customSiteKey={customSiteKey} onboardingIntent={intent} />

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {groups.map((g) => (
          <section key={g.id} aria-labelledby={`plus-${g.id}`}>
            <h2 id={`plus-${g.id}`} className="px-1 pb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {g.label}
            </h2>
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
              {g.items.map((item) => (
                <li key={item.href}>
                  <PlusLink item={item} href={withTenant(item.href, tenantParam ?? null)} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}

function PlusLink({ item, href }: { item: PlusItem; href: string }) {
  const Icon = NAV_ICONS[item.icon]
  const className =
    "flex min-h-14 items-center gap-3 px-4 py-2 text-base font-medium text-foreground transition-colors hover:bg-muted"
  const content = (
    <>
      <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        {item.label}
        {item.hint ? <span className="block text-sm font-normal text-muted-foreground">{item.hint}</span> : null}
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </>
  )
  // Téléchargement (export) : lien classique, jamais de navigation client.
  return item.download ? (
    <a href={href} className={className}>
      {content}
    </a>
  ) : (
    <Link href={href} className={className}>
      {content}
    </Link>
  )
}
