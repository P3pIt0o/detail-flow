"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Input } from "@/components/ui/input"
import { StatusBadge } from "@/components/admin/status-badge"
import { BOOKING_STATUS_META, type BookingStatus } from "@/lib/booking/status"
import { formatPrice, formatDateShort } from "@/lib/format"
import { withTenant } from "@/lib/tenant-link"
import { cn } from "@/lib/utils"

type Row = {
  id: number
  reference: string
  customerName: string
  customerEmail: string
  date: string
  startTime: string
  status: string
  totalCents: number
}

const FILTERS: { value: BookingStatus | "all"; label: string }[] = [
  { value: "all", label: "Toutes" },
  { value: "pending_deposit", label: "En attente" },
  { value: "confirmed", label: "Confirmées" },
  { value: "completed", label: "Terminées" },
  { value: "cancelled", label: "Annulées" },
]

export function ReservationsTable({ rows }: { rows: Row[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Tenant courant (slug) porté par ?tenant= en aperçu. On le conserve à chaque
  // navigation vers le détail pour rester sur la même entreprise. Ce n'est jamais
  // un companyId : le serveur résout toujours l'entreprise via requireCompanyId().
  const tenantParam = searchParams.get("tenant")
  const bookingHref = (id: number) => withTenant(`/admin/reservations/${id}`, tenantParam)
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<BookingStatus | "all">("all")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (status !== "all" && r.status !== status) return false
      if (!q) return true
      return (
        r.customerName.toLowerCase().includes(q) ||
        r.customerEmail.toLowerCase().includes(q) ||
        r.reference.toLowerCase().includes(q)
      )
    })
  }, [rows, query, status])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          placeholder="Rechercher (nom, email, référence)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="sm:max-w-xs"
        />
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setStatus(f.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                status === f.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Client</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">Date</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">Référence</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 text-right font-medium">Montant</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  Aucune réservation.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => router.push(bookingHref(r.id))}
                  className="cursor-pointer transition-colors hover:bg-muted/40"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={bookingHref(r.id)}
                      className="block"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="font-medium text-foreground">{r.customerName}</span>
                      <span className="block text-xs text-muted-foreground sm:hidden">
                        {formatDateShort(r.date)} · {r.startTime}
                      </span>
                    </Link>
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                    {formatDateShort(r.date)} · {r.startTime}
                  </td>
                  <td className="hidden px-4 py-3 font-mono text-xs text-muted-foreground md:table-cell">
                    {r.reference}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-foreground">
                    {formatPrice(r.totalCents)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        {filtered.length} réservation{filtered.length > 1 ? "s" : ""}
        {status !== "all" && ` · ${BOOKING_STATUS_META[status].label}`}
      </p>
    </div>
  )
}
