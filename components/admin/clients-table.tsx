"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Pencil } from "lucide-react"
import { Input } from "@/components/ui/input"
import { formatPrice, formatDateShort } from "@/lib/format"

type Client = {
  key: string
  /** id de la fiche `clients` (null pour un client issu uniquement d'une résa). */
  clientId: number | null
  name: string
  email: string | null
  phone: string | null
  bookingsCount: number
  totalSpentCents: number
  lastDate: string | null
  source: "manual" | "booking" | "both"
}

export function ClientsTable({ clients }: { clients: Client[] }) {
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
              <th className="px-4 py-3 text-right font-medium">Total</th>
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
              filtered.map((c) => (
                <tr key={c.key} className="transition-colors hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{c.name}</span>
                      {c.source !== "booking" && (
                        <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                          Fiche
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {c.email ?? "—"}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                    {c.phone ? (
                      <a href={`tel:${c.phone}`} className="hover:text-foreground">
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
                    {formatPrice(c.totalSpentCents)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {c.clientId != null ? (
                      <Link
                        href={`/admin/clients/${c.clientId}`}
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
              ))
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
