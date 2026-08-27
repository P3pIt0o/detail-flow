"use client"

import { useState, useTransition } from "react"
import { KeyRound, Loader2, CheckCircle2, Circle } from "lucide-react"
import { resetOwnerPasswordAction } from "@/app/super-admin/actions"
import { AccessRecap, type AccessInfo } from "@/components/super-admin/access-recap"
import { CompanyRowActions } from "@/components/super-admin/company-row-actions"
import { LicensePanel } from "@/components/super-admin/license-panel"
import { tenantAdminUrl, tenantPublicUrl } from "@/lib/tenant-shared"
import { customSiteLabel, listRegisteredCustomSites } from "@/lib/custom-sites/meta"

export type CompanyCardData = {
  id: number
  name: string
  slug: string
  status: string
  betaStartedAt: Date | null
  betaEndsAt: Date | null
  createdAt: Date
  ownerEmail: string | null
  bookingCount: number
  ownerActivated: boolean
  licensePlan: string | null
  licenseGeneration: string | null
  customSiteKey: string | null
}

const STATUS_LABELS: Record<string, string> = {
  BETA: "Beta",
  ACTIVE: "Active",
  SUSPENDED: "Suspendue",
  ARCHIVED: "Archivée",
}

function statusClasses(status: string, expired: boolean): string {
  if (expired) return "bg-destructive/10 text-destructive"
  switch (status) {
    case "ACTIVE":
      return "bg-primary/10 text-primary"
    case "BETA":
      return "bg-amber-500/10 text-amber-600 dark:text-amber-400"
    case "SUSPENDED":
      return "bg-destructive/10 text-destructive"
    default:
      return "bg-muted text-muted-foreground"
  }
}

function fmtDate(d: Date | null): string {
  return d ? new Date(d).toLocaleDateString("fr-FR") : "—"
}

/** Carte entreprise du tableau de bord super-admin : infos + accès + actions. */
export function CompanyCard({ company, rootDomain }: { company: CompanyCardData; rootDomain: string | null }) {
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const expired = company.status === "BETA" && company.betaEndsAt != null && new Date(company.betaEndsAt).getTime() < Date.now()

  const info: AccessInfo = {
    companyName: company.name,
    slug: company.slug,
    publicUrl: tenantPublicUrl(company.slug, rootDomain ?? undefined),
    adminUrl: tenantAdminUrl(company.slug, rootDomain ?? undefined),
    ownerEmail: company.ownerEmail ?? "—",
    tempPassword,
  }

  function resetPassword() {
    if (!window.confirm("Générer un nouveau mot de passe provisoire ? L'ancien ne fonctionnera plus.")) return
    setError(null)
    startTransition(async () => {
      const res = await resetOwnerPasswordAction(company.id)
      if (res.ok) setTempPassword(res.tempPassword)
      else setError(res.error)
    })
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
      {/* En-tête : nom + statut + activation */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-foreground">{company.name}</h3>
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClasses(company.status, expired)}`}>
              {expired ? "Beta expirée" : STATUS_LABELS[company.status] ?? company.status}
            </span>
            {company.ownerActivated ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                <CheckCircle2 className="size-3" aria-hidden="true" /> Compte activé
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                <Circle className="size-3" aria-hidden="true" /> Jamais connecté
              </span>
            )}
          </div>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{company.slug}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={resetPassword}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
            Réinitialiser le mot de passe
          </button>
          <CompanyRowActions
          companyId={company.id}
          companyName={company.name}
          status={company.status}
          customSiteKey={company.customSiteKey}
          customSiteOptions={listRegisteredCustomSites()}
        />
        </div>
      </div>

      {/* Méta : dates + réservations */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted-foreground">Créée le</p>
          <p className="font-medium text-foreground">{fmtDate(company.createdAt)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Fin de beta</p>
          <p className="font-medium text-foreground">{fmtDate(company.betaEndsAt)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Réservations</p>
          <p className="font-medium text-foreground">{company.bookingCount}</p>
        </div>
        <div>
          {/* Site public : "Site standard" par défaut ; nom du site personnalisé
              s'il est enregistré. Lecture seule (attribution via action serveur). */}
          <p className="text-xs text-muted-foreground">Site public</p>
          <p className="font-medium text-foreground">
            {customSiteLabel(company.customSiteKey) ?? "Site standard"}
          </p>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {/* Licence & droits (chargé à la demande) */}
      <LicensePanel
        companyId={company.id}
        licensePlan={company.licensePlan}
        licenseGeneration={company.licenseGeneration}
      />

      {/* Accès + bouton "Copier les accès" */}
      <AccessRecap info={info} />
    </div>
  )
}
