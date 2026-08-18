"use client"

import { useState, useTransition } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, CircleDashed, Loader2, Pencil } from "lucide-react"
import { setPlatformFeeAction, setCompanyFeeOverrideAction } from "@/app/super-admin/actions"
import type { PlatformPaymentsOverview, PlatformPaymentsRow } from "@/lib/payments/config"

function euros(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })
}
function pct(bps: number): string {
  return `${(bps / 100).toFixed(2).replace(/\.?0+$/, "")} %`
}

export function PaymentsOverview({ data }: { data: PlatformPaymentsOverview }) {
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null)

  return (
    <div className="flex flex-col gap-8">
      {msg ? (
        <p className={`text-sm ${msg.type === "ok" ? "text-primary" : "text-destructive"}`}>{msg.text}</p>
      ) : null}

      {/* Totaux plateforme */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Encaissé (clients)" value={euros(data.totals.grossCents)} />
        <StatCard label="Commission DetailFlow" value={euros(data.totals.commissionCents)} accent />
        <StatCard label="Paiements réglés" value={String(data.totals.paidCount)} />
      </div>

      {/* Commission globale */}
      <GlobalFeeCard defaultFeeBps={data.defaultFeeBps} onResult={setMsg} />

      {/* Détail par entreprise */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Par entreprise</h2>
        {data.rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Aucune entreprise.
          </div>
        ) : (
          <div className="grid gap-3">
            {data.rows.map((row) => (
              <CompanyRow key={row.companyId} row={row} defaultFeeBps={data.defaultFeeBps} onResult={setMsg} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${accent ? "text-primary" : "text-foreground"}`}>{value}</p>
    </div>
  )
}

type ResultSetter = (m: { type: "ok" | "err"; text: string }) => void

function GlobalFeeCard({ defaultFeeBps, onResult }: { defaultFeeBps: number; onResult: ResultSetter }) {
  const [value, setValue] = useState((defaultFeeBps / 100).toString())
  const [pending, start] = useTransition()

  function save() {
    const percent = Number.parseFloat(value.replace(",", "."))
    start(async () => {
      const r = await setPlatformFeeAction(percent)
      onResult(r.ok ? { type: "ok", text: r.message ?? "Enregistré." } : { type: "err", text: r.error })
    })
  }

  return (
    <Card className="space-y-3 p-6">
      <div>
        <h2 className="font-semibold text-foreground">Commission par défaut</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Appliquée à toutes les entreprises sans commission spécifique. Prélevée automatiquement sur chaque paiement en
          ligne.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Commission (%)</span>
          <Input
            type="number"
            min={0}
            max={20}
            step={0.1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-32"
          />
        </label>
        <Button onClick={save} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          Enregistrer
        </Button>
      </div>
    </Card>
  )
}

function CompanyRow({
  row,
  defaultFeeBps,
  onResult,
}: {
  row: PlatformPaymentsRow
  defaultFeeBps: number
  onResult: ResultSetter
}) {
  const hasOverride = row.feeBps !== defaultFeeBps
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState((row.feeBps / 100).toString())
  const [pending, start] = useTransition()

  function save(percent: number | null) {
    start(async () => {
      const r = await setCompanyFeeOverrideAction(row.companyId, percent)
      onResult(r.ok ? { type: "ok", text: r.message ?? "Enregistré." } : { type: "err", text: r.error })
      if (r.ok) setEditing(false)
    })
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{row.companyName}</p>
          <p className="text-xs text-muted-foreground">/{row.slug}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {row.paymentsEnabled && row.chargesEnabled ? (
            <Badge variant="secondary" className="gap-1">
              <CheckCircle2 className="size-3.5" aria-hidden="true" />
              Actif
            </Badge>
          ) : row.connected ? (
            <Badge variant="outline" className="gap-1">
              <CircleDashed className="size-3.5" aria-hidden="true" />
              Config. en cours
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 text-muted-foreground">
              <CircleDashed className="size-3.5" aria-hidden="true" />
              Non connecté
            </Badge>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Metric label="Paiements" value={String(row.paidCount)} />
        <Metric label="Encaissé" value={euros(row.grossCents)} />
        <Metric label="Commission" value={euros(row.commissionCents)} />
        <Metric label="Taux" value={`${pct(row.feeBps)}${hasOverride ? " (spécifique)" : ""}`} />
      </div>

      <div className="mt-3 border-t border-border pt-3">
        {editing ? (
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Commission spécifique (%)</span>
              <Input
                type="number"
                min={0}
                max={20}
                step={0.1}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="w-28"
              />
            </label>
            <Button
              size="sm"
              onClick={() => save(Number.parseFloat(value.replace(",", ".")))}
              disabled={pending}
            >
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              Appliquer
            </Button>
            {hasOverride ? (
              <Button size="sm" variant="ghost" onClick={() => save(null)} disabled={pending}>
                Retirer l&apos;override
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={pending}>
              Annuler
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" aria-hidden="true" />
            {hasOverride ? "Modifier la commission" : "Commission spécifique"}
          </Button>
        )}
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium text-foreground">{value}</p>
    </div>
  )
}
