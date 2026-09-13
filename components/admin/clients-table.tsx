"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Pencil } from "lucide-react"
import { Input } from "@/components/ui/input"
import { formatPrice, formatDateShort } from "@/lib/format"
import { withTenant } from "@/lib/tenant-link"

type Client = {
  key: string
  /** id de la fiche `clients` (null pour un client issu uniquement d'une résa). */
  clientId: number | null
  /** Réservation représentative (ancrage d'une fiche virtuelle), sinon null. */
  anchorBookingId: number | null
  name: string
  email: string | null
  phone: string | null
  bookingsCount: number
  /** Montant réservé (réservations non annulées, hors données de démo). */
  reservedCents: number
  lastDate: string | null
  source: "manual" | "booking" | "both"
}

const SOURCE_LABEL: Record<Client["source"], string> = {
  manual: "Fiche client",
  booking: "Réservations",
  both: "Fiche + réservations",
}

export function ClientsTable({ clients }: { clients: Client[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Conserve le tenant courant (slug) vers la fiche client. Jamais un companyId.
  const tenantParam = searchParams.get("tenant")
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return clients
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.phone ?? "").includes(q),
    )
  }, [clients, query])

  // Chemin de la fiche : fiche manuelle par clientId, sinon fiche virtuelle
  // ancrée sur une réservation représentative (jamais d'email/téléphone en URL).
  function detailHref(c: Client): string | null {
    if (c.clientId != null) return withTenant(`/admin/clients/${c.clientId}`, tenantParam)
    if (c.anchorBookingId != null) return withTenant(`/admin/clients/reservation/${c.anchorBookingId}`, tenantParam)
    return null
  }

  return (
    <div className="space-y-4">
      <Input
        placeholder="Rechercher un client…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="sm:max-w-xs"
      />

      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Client</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">Téléphone</th>
              <th className="px-4 py-3 text-center font-medium">Résas</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">Dernière</th>
              <th className="px-4 py-3 text-right font-medium">Montant réservé</th>
              <th className="px-4 py-3 text-right font-medium">
                <span className="sr-only">Modifier</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  Aucun client.
                </td>
              </tr>
            ) : (
              filtered.map((c) => {
                const href = detailHref(c)
                const open = () => {
                  if (href) router.push(href)
                }
                return (
                  <tr
                    key={c.key}
                    role={href ? "link" : undefined}
                    tabIndex={href ? 0 : undefined}
                    aria-label={href ? `Ouvrir la fiche de ${c.name}` : undefined}
                    onClick={open}
                    onKeyDown={(e) => {
                      if (href && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault()
                        open()
                      }
                    }}
                    className={
                      href
                        ? "cursor-pointer transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                        : "transition-colors"
                    }
                  >
                    <td className="px-4 py-3">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">{c.name}</span>
                        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {SOURCE_LABEL[c.source]}
                        </span>
                      </span>
                      <span className="block text-xs text-muted-foreground">{c.email ?? "—"}</span>
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                      {c.phone ? (
                        <a
                          href={`tel:${c.phone}`}
                          className="hover:text-foreground"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {c.phone}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-foreground">{c.bookingsCount}</td>
                    <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                      {c.lastDate ? formatDateShort(c.lastDate) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-foreground">
                      {formatPrice(c.reservedCents)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {c.clientId != null ? (
                        <Link
                          href={withTenant(`/admin/clients/${c.clientId}/modifier`, tenantParam)}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                          aria-label={`Modifier ${c.name}`}
                        >
                          <Pencil className="size-3.5" aria-hidden="true" />
                          Modifier
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground/60">—</span>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        {filtered.length} client{filtered.length > 1 ? "s" : ""}
      </p>
    </div>
  )
}
