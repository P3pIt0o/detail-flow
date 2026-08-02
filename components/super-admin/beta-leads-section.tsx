"use client"

import { useState, useTransition } from "react"
import { Check, Inbox, Loader2, Mail, MapPin, Phone, X } from "lucide-react"
import {
  acceptBetaLeadAction,
  declineBetaLeadAction,
  reopenBetaLeadAction,
} from "@/app/super-admin/actions"
import { tenantAdminUrl, tenantPublicUrl } from "@/lib/tenant-shared"
import { AccessRecap, type AccessInfo } from "@/components/super-admin/access-recap"

type Lead = {
  id: number
  businessName: string
  contactName: string
  email: string
  phone: string | null
  city: string | null
  message: string | null
  status: string
  createdAt: Date
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  new: { label: "En attente", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  converted: { label: "Acceptée", cls: "bg-primary/10 text-primary" },
  declined: { label: "Refusée", cls: "bg-destructive/10 text-destructive" },
}

export function BetaLeadsSection({ leads, rootDomain }: { leads: Lead[]; rootDomain: string | null }) {
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Récap d'accès affiché après acceptation (mot de passe visible une seule fois).
  const [accepted, setAccepted] = useState<Record<number, AccessInfo>>({})

  const pendingCount = leads.filter((l) => l.status === "new").length

  function accept(lead: Lead) {
    setError(null)
    setBusyId(lead.id)
    startTransition(async () => {
      const res = await acceptBetaLeadAction(lead.id)
      setBusyId(null)
      if (!res.ok) {
        setError(res.error)
        return
      }
      const r = res.result
      setAccepted((prev) => ({
        ...prev,
        [lead.id]: {
          companyName: lead.businessName,
          slug: r.slug,
          publicUrl: tenantPublicUrl(r.slug, rootDomain ?? undefined),
          adminUrl: tenantAdminUrl(r.slug, rootDomain ?? undefined),
          ownerEmail: r.ownerEmail,
          tempPassword: r.ownerCreated ? r.tempPassword : null,
        },
      }))
    })
  }

  function decline(lead: Lead) {
    setError(null)
    setBusyId(lead.id)
    startTransition(async () => {
      await declineBetaLeadAction(lead.id)
      setBusyId(null)
    })
  }

  function reopen(lead: Lead) {
    setError(null)
    setBusyId(lead.id)
    startTransition(async () => {
      await reopenBetaLeadAction(lead.id)
      setBusyId(null)
    })
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Inbox className="size-5 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Demandes du programme beta</h2>
        {pendingCount > 0 && (
          <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
            {pendingCount} en attente
          </span>
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {leads.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Aucune demande pour le moment. Les soumissions du formulaire « Rejoindre la beta » apparaîtront ici.
        </div>
      ) : (
        <div className="grid gap-3">
          {leads.map((lead) => {
            const badge = STATUS_BADGE[lead.status] ?? STATUS_BADGE.new
            const recap = accepted[lead.id]
            const isBusy = pending && busyId === lead.id
            return (
              <div key={lead.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-foreground">{lead.businessName}</h3>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {lead.contactName} · {new Date(lead.createdAt).toLocaleDateString("fr-FR")}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-1 hover:text-foreground">
                        <Mail className="size-3.5" aria-hidden="true" /> {lead.email}
                      </a>
                      {lead.phone && (
                        <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1 hover:text-foreground">
                          <Phone className="size-3.5" aria-hidden="true" /> {lead.phone}
                        </a>
                      )}
                      {lead.city && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3.5" aria-hidden="true" /> {lead.city}
                        </span>
                      )}
                    </div>
                    {lead.message && (
                      <p className="mt-2 rounded-lg bg-muted/50 px-3 py-2 text-sm text-foreground/80">{lead.message}</p>
                    )}
                  </div>

                  {!recap && (
                    <div className="flex shrink-0 items-center gap-2">
                      {lead.status !== "converted" && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => accept(lead)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-50"
                        >
                          {isBusy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                          Accepter
                        </button>
                      )}
                      {lead.status === "new" && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => decline(lead)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
                        >
                          <X className="size-4" /> Refuser
                        </button>
                      )}
                      {lead.status === "declined" && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => reopen(lead)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
                        >
                          Remettre en attente
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {recap && (
                  <div className="mt-4 border-t border-border pt-4">
                    <p className="mb-3 text-sm font-medium text-foreground">
                      Entreprise créée. Voici les accès à transmettre :
                    </p>
                    <AccessRecap info={recap} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
