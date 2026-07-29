"use client"

import { useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { formatPrice, formatDateShort } from "@/lib/format"

type Client = {
  email: string
  name: string
  phone: string
  bookingsCount: number
  totalSpentCents: number
  lastDate: string
}

export function ClientsTable({ clients }: { clients: Client[] }) {
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return clients
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.phone.includes(q),
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
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  Aucun client.
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr key={c.email} className="transition-colors hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <span className="font-medium text-foreground">{c.name}</span>
                    <span className="block text-xs text-muted-foreground">{c.email}</span>
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                    <a href={`tel:${c.phone}`} className="hover:text-foreground">
                      {c.phone}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-center text-foreground">{c.bookingsCount}</td>
                  <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                    {formatDateShort(c.lastDate)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-foreground">
                    {formatPrice(c.totalSpentCents)}
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
