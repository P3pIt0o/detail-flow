"use client"

import Link from "next/link"
import { useState } from "react"
import { Search } from "lucide-react"
import { SETTINGS_SEARCH_EMPTY, searchSettings, settingsResultContext } from "@/lib/admin/settings-search"
import { withTenant } from "@/lib/tenant-link"

/** Champ « Rechercher un réglage » : filtre à chaque lettre, sans accent ni majuscule. */
export function SettingsSearch({
  tenantParam,
  customSiteKey,
  onboardingIntent,
}: {
  tenantParam: string | null
  customSiteKey: string | null
  onboardingIntent: string | null
}) {
  const [q, setQ] = useState("")
  const results = searchSettings(q, customSiteKey, onboardingIntent)

  return (
    <div role="search" className="max-w-2xl space-y-2">
      <label className="relative block">
        <span className="sr-only">Rechercher un réglage</span>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setQ("")}
          placeholder="Rechercher : acompte, horaires, SMS…"
          className="h-12 w-full rounded-xl border border-border bg-card pl-10 pr-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
      </label>
      <div aria-live="polite">
        {q.trim() !== "" && (
          <ul className="overflow-hidden rounded-xl border border-border bg-card">
            {results.length === 0 ? (
              <li className="p-3 text-sm text-muted-foreground">{SETTINGS_SEARCH_EMPTY}</li>
            ) : (
              results.map((r) => (
                <li key={r.href} className="border-b border-border last:border-b-0">
                  <Link
                    href={withTenant(r.href, tenantParam)}
                    // Depuis « Tous les réglages », la page reste montée : on referme la liste.
                    onClick={() => setQ("")}
                    className="block min-h-11 px-3 py-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                  >
                    <span className="block text-base font-medium text-foreground">{r.label}</span>
                    <span className="block text-sm text-muted-foreground">{settingsResultContext(r)}</span>
                  </Link>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  )
}
