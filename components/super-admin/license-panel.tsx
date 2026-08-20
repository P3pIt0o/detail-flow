"use client"

import { useState, useTransition } from "react"
import { ChevronDown, ChevronUp, Loader2, ShieldCheck, Sparkles } from "lucide-react"
import {
  getCompanyLicenseViewAction,
  setCompanyLicenseAction,
  setFeatureOverrideAction,
  type LicenseViewState,
  type LicensePlanOption,
} from "@/app/super-admin/license-actions"
import type { EntitlementView, FeatureResolution } from "@/lib/licensing/resolver"

const STATE_LABELS: Record<string, string> = {
  INHERIT: "Hériter du plan",
  ENABLED: "Forcer ON",
  DISABLED: "Forcer OFF",
}
const SOURCES = ["MANUAL", "PURCHASED", "GIFT", "TRIAL", "FOUNDER", "COMMERCIAL_GESTURE"] as const

function fmtDate(d: Date | null): string {
  return d ? new Date(d).toLocaleDateString("fr-FR") : "—"
}
function toDateInput(d: Date | null): string {
  if (!d) return ""
  const dt = new Date(d)
  return Number.isNaN(dt.getTime()) ? "" : dt.toISOString().slice(0, 10)
}

/** Ligne d'édition d'une feature (droit plan / override / expiration / effectif). */
function FeatureRow({
  companyId,
  f,
  note,
  onSaved,
}: {
  companyId: number
  f: FeatureResolution
  note: string | null
  onSaved: () => void
}) {
  const [state, setState] = useState(f.overrideState)
  const [source, setSource] = useState(f.overrideSource ?? "MANUAL")
  const [expiresAt, setExpiresAt] = useState(toDateInput(f.expiresAt))
  const [noteVal, setNoteVal] = useState(note ?? "")
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function save() {
    setErr(null)
    start(async () => {
      const res = await setFeatureOverrideAction(companyId, {
        featureKey: f.key,
        state,
        source,
        expiresAt: expiresAt || null,
        internalNote: noteVal,
      })
      if (res.ok) onSaved()
      else setErr(res.error)
    })
  }

  const showOverrideControls = state !== "INHERIT"

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{f.key}</span>
          <span className="text-xs text-muted-foreground">
            plan : {f.planValue == null ? "—" : f.planValue ? "oui" : "non"}
          </span>
        </div>
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
            f.effective ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
          }`}
        >
          {f.effective ? "Actif" : "Inactif"}
          {f.overrideExpired ? " (essai expiré)" : ""}
        </span>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Droit
          <select
            value={state}
            onChange={(e) => setState(e.target.value as FeatureResolution["overrideState"])}
            className="rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground"
          >
            {Object.entries(STATE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>

        {showOverrideControls && (
          <>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Origine
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground"
              >
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Expiration (essai)
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground"
              />
            </label>
            <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-muted-foreground">
              Note interne
              <input
                type="text"
                value={noteVal}
                maxLength={1000}
                onChange={(e) => setNoteVal(e.target.value)}
                placeholder="Ex. Booking offert au lancement"
                className="rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground"
              />
            </label>
          </>
        )}

        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {pending && <Loader2 className="size-3.5 animate-spin" />}
          Enregistrer
        </button>
      </div>

      {err && (
        <p className="text-xs text-destructive" role="alert">
          {err}
        </p>
      )}
    </div>
  )
}

/** Panneau « Licence & droits » — chargé à la demande (une requête par ouverture). */
export function LicensePanel({
  companyId,
  licensePlan,
  licenseGeneration,
}: {
  companyId: number
  licensePlan: string | null
  licenseGeneration: string | null
}) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<LicenseViewState | null>(null)
  const [loading, startLoad] = useTransition()
  const [assigning, startAssign] = useTransition()
  const [selectedPlan, setSelectedPlan] = useState<string>(licensePlan ?? "FREE")
  const [msg, setMsg] = useState<string | null>(null)

  function load() {
    startLoad(async () => {
      const res = await getCompanyLicenseViewAction(companyId)
      setData(res)
      if (res.ok && res.view.plan) setSelectedPlan(res.view.plan)
    })
  }

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && !data) load()
  }

  function assign() {
    setMsg(null)
    startAssign(async () => {
      const res = await setCompanyLicenseAction(companyId, selectedPlan)
      setMsg(res.ok ? res.message ?? "Licence mise à jour." : res.error)
      if (res.ok) load()
    })
  }

  const view: EntitlementView | null = data?.ok ? data.view : null
  const plans: LicensePlanOption[] = data?.ok ? data.plans : []

  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
      >
        <span className="inline-flex items-center gap-2">
          <ShieldCheck className="size-4 text-muted-foreground" aria-hidden="true" />
          Licence &amp; droits
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {licensePlan ?? "LEGACY"}
            {licenseGeneration ? ` · ${licenseGeneration}` : ""}
          </span>
        </span>
        {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
      </button>

      {open && (
        <div className="flex flex-col gap-4 border-t border-border p-3">
          {loading && (
            <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Chargement…
            </p>
          )}

          {data && !data.ok && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {data.error}
            </p>
          )}

          {view && (
            <>
              {view.legacy && (
                <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                  Tenant historique sans licence explicite — accès LEGACY conservé (comportement actuel préservé).
                </p>
              )}

              {view.plan === "FOUNDER" && (
                <p className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-medium text-primary">
                  <Sparkles className="size-4" aria-hidden="true" />
                  FOUNDER · {view.generation} · EARLY ACCESS
                </p>
              )}

              {/* Sélecteur de plan */}
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Plan de licence
                  <select
                    value={selectedPlan}
                    onChange={(e) => setSelectedPlan(e.target.value)}
                    className="rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground"
                  >
                    {plans.map((p) => (
                      <option key={p.plan} value={p.plan}>
                        {p.label}
                        {p.internalOnly ? " (interne)" : p.purchasable ? "" : " (bientôt)"}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={assign}
                  disabled={assigning}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
                >
                  {assigning && <Loader2 className="size-3.5 animate-spin" />}
                  Attribuer la licence
                </button>
                {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
              </div>

              {/* Limites */}
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                {view.limits.map((l) => (
                  <span key={l.key} className="rounded-full bg-muted px-2 py-0.5">
                    {l.key} : {l.value == null ? "illimité" : l.value}
                  </span>
                ))}
              </div>

              {/* Fonctionnalités */}
              <div className="flex flex-col gap-2">
                {view.features.map((f) => (
                  <FeatureRow
                    key={f.key}
                    companyId={companyId}
                    f={f}
                    note={data?.ok ? data.notes[f.key] ?? null : null}
                    onSaved={load}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
