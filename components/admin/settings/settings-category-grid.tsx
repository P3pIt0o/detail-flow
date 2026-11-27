import Link from "next/link"
import { ChevronRight } from "lucide-react"
import type { SettingsHomeEntry } from "@/lib/admin/settings-nav"
import type { SettingsStatusId, SettingsStatusLine } from "@/lib/admin/settings-status"
import { withTenant } from "@/lib/tenant-link"

const rowClass =
  "group flex min-h-14 items-center gap-3 border-b border-border py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"

function Chevron() {
  return (
    <ChevronRight
      className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
      aria-hidden="true"
    />
  )
}

/**
 * Page d'accueil des Paramètres : une liste de lignes (deux colonnes sur
 * ordinateur), chacune avec son état en clair et un point orange s'il manque
 * quelque chose, puis « Mon compte ». `?tenant=` conservé via withTenant().
 */
export function SettingsCategoryGrid({
  tenantParam,
  main,
  account,
  status,
}: {
  tenantParam: string | null
  /** Entrées déjà filtrées selon le tenant. */
  main: SettingsHomeEntry[]
  account: SettingsHomeEntry[]
  status: Partial<Record<SettingsStatusId, SettingsStatusLine>>
}) {
  return (
    <div className="space-y-8">
      <ul className="grid grid-cols-1 gap-x-10 sm:grid-cols-2">
        {main.map((entry) => {
          const line = status[entry.id as SettingsStatusId]
          return (
            <li key={entry.id}>
              <Link href={withTenant(entry.href, tenantParam)} className={rowClass}>
                <div className="min-w-0 flex-1">
                  <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
                    {entry.label}
                    {line?.attention ? (
                      <span className="size-2.5 shrink-0 rounded-full bg-amber-500">
                        <span className="sr-only">À compléter</span>
                      </span>
                    ) : null}
                  </h2>
                  {line ? <p className="text-sm text-muted-foreground text-pretty">{line.text}</p> : null}
                </div>
                <Chevron />
              </Link>
            </li>
          )
        })}
      </ul>

      <section aria-labelledby="settings-account-title">
        <h2 id="settings-account-title" className="text-sm font-medium text-muted-foreground">
          Mon compte
        </h2>
        {/* Lignes sur téléphone, une ligne compacte « A · B · C » sur ordinateur. */}
        <ul className="sm:flex sm:flex-wrap sm:items-center">
          {account.map((entry) => (
            <li key={entry.id} className="sm:after:px-2 sm:after:text-muted-foreground sm:after:content-['·'] sm:last:after:content-none sm:flex sm:items-center">
              <Link href={withTenant(entry.href, tenantParam)} className={`${rowClass} sm:min-h-11 sm:border-b-0`}>
                <span className="flex-1 text-base text-foreground">{entry.label}</span>
                <span className="sm:hidden">
                  <Chevron />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
