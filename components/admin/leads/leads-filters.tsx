"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { LEAD_SOURCE_LABELS, LEAD_SOURCES } from "@/lib/leads/model"

/**
 * Filtres + recherche du CRM. Tout vit dans l'URL (survit au refresh, partageable) :
 * la page est un Server Component qui relit `searchParams`. La recherche est
 * DÉBOUNCÉE et exécutée côté serveur (jamais 10 000 prospects chargés côté client).
 */
const STATUS_TABS = [
  { key: "", label: "Tous" },
  { key: "NEW", label: "Nouveaux" },
  { key: "CONTACTED", label: "Contactés" },
  { key: "APPOINTMENT_BOOKED", label: "Rendez-vous pris" },
  { key: "CLIENT", label: "Clients" },
  { key: "LOST", label: "Perdus" },
  { key: "due", label: "À relancer" },
] as const

export function LeadsFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()

  const activeStatus = params.get("status") ?? ""
  const activeDue = params.get("due") === "1"
  const activeSource = params.get("source") ?? ""
  const [q, setQ] = useState(params.get("q") ?? "")
  const firstRender = useRef(true)

  function push(next: URLSearchParams) {
    next.delete("page") // tout changement de filtre repart page 1
    startTransition(() => {
      router.push(`${pathname}?${next.toString()}`)
    })
  }

  function selectTab(key: string) {
    const next = new URLSearchParams(params.toString())
    next.delete("status")
    next.delete("due")
    if (key === "due") next.set("due", "1")
    else if (key) next.set("status", key)
    push(next)
  }

  function selectSource(value: string) {
    const next = new URLSearchParams(params.toString())
    if (value) next.set("source", value)
    else next.delete("source")
    push(next)
  }

  // Recherche débouncée (350 ms).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    const t = setTimeout(() => {
      const next = new URLSearchParams(params.toString())
      const trimmed = q.trim()
      if (trimmed) next.set("q", trimmed)
      else next.delete("q")
      if ((params.get("q") ?? "") !== trimmed) push(next)
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const currentTab = activeDue ? "due" : activeStatus

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un nom, email, téléphone, véhicule…"
          aria-label="Rechercher un prospect"
          className="min-h-10 w-full rounded-lg border border-border bg-background pr-3 pl-9 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filtrer par statut">
        {STATUS_TABS.map((tab) => {
          const selected = currentTab === tab.key
          return (
            <button
              key={tab.key || "all"}
              type="button"
              role="tab"
              aria-selected={selected}
              disabled={pending}
              onClick={() => selectTab(tab.key)}
              className={cn(
                "inline-flex min-h-9 shrink-0 items-center rounded-full border px-3 text-sm font-medium whitespace-nowrap transition-colors",
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="source-filter" className="text-xs font-medium text-muted-foreground">
          Source
        </label>
        <select
          id="source-filter"
          value={activeSource}
          onChange={(e) => selectSource(e.target.value)}
          className="min-h-9 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground"
        >
          <option value="">Toutes</option>
          {LEAD_SOURCES.map((s) => (
            <option key={s} value={s}>
              {LEAD_SOURCE_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
