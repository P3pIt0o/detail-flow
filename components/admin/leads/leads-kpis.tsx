import Link from "next/link"
import { BellRing, CalendarCheck, CheckCircle2, Sparkles } from "lucide-react"
import type { LeadKpis } from "@/lib/leads/server"

/**
 * KPIs compacts du CRM (max 4). Chaque carte est un raccourci vers la liste
 * filtrée. Aucun chiffre fictif, aucun CA potentiel, aucun scoring.
 */
const CARDS = [
  { key: "newCount", label: "Nouveaux", href: "/admin/leads?status=NEW", Icon: Sparkles },
  { key: "toFollowUp", label: "À relancer", href: "/admin/leads?due=1", Icon: BellRing },
  { key: "appointment", label: "Rendez-vous pris", href: "/admin/leads?status=APPOINTMENT_BOOKED", Icon: CalendarCheck },
  { key: "client", label: "Convertis", href: "/admin/leads?status=CLIENT", Icon: CheckCircle2 },
] as const

export function LeadsKpis({ kpis }: { kpis: LeadKpis }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {CARDS.map(({ key, label, href, Icon }) => (
        <Link
          key={key}
          href={href}
          className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
        >
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Icon className="size-3.5" aria-hidden="true" />
            {label}
          </span>
          <span className="text-2xl font-bold tabular-nums text-foreground">{kpis[key]}</span>
        </Link>
      ))}
    </div>
  )
}
