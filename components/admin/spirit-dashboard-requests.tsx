import Link from "next/link"
import { Inbox, ArrowRight, CheckCircle2, ImageIcon } from "lucide-react"
import { CustomRequestStatusBadge } from "@/components/admin/custom-request-status-badge"
import { formatDateShort } from "@/lib/format"

/**
 * Élément « À traiter » du dashboard, prêt à afficher : les liens et le nombre
 * de photos sont RÉSOLUS CÔTÉ SERVEUR (jamais recalculés ici). Le composant est
 * purement présentationnel — aucune décision d'isolation multi-tenant.
 */
export type SpiritActionItem = {
  id: number
  href: string
  customerName: string
  /** Véhicule concaténé (marque/modèle ou type), sinon null si non renseigné. */
  vehicle: string | null
  /** Prestation / formule demandée (libellé figé de la demande). */
  typeLabel: string
  createdAt: Date
  status: string
  photoCount: number
  /** Mise en avant visuelle d'une demande jamais ouverte (status `new`). */
  isNew: boolean
}

/**
 * Bloc PRIORITAIRE « À traiter » du dashboard Spirit ACS.
 *
 * Réutilise le module Demandes existant (mêmes données, mêmes statuts, même
 * route de détail admin protégée). N'introduit AUCUN nouveau statut ni système
 * de demandes parallèle. Le simple affichage ne modifie jamais l'état d'une
 * demande : « à traiter » reflète uniquement l'état réel côté serveur.
 */
export function SpiritDashboardRequests({
  items,
  actionCount,
  waitingClientCount,
  allHref,
}: {
  items: SpiritActionItem[]
  actionCount: number
  waitingClientCount: number
  allHref: string
}) {
  // État compact et positif quand rien ne nécessite d'action (pas d'alarme inutile).
  if (actionCount === 0) {
    return (
      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Tout est à jour</p>
            <p className="text-xs text-muted-foreground text-pretty">
              Aucune demande en attente.
              {waitingClientCount > 0
                ? ` ${waitingClientCount} en attente de réponse client.`
                : ""}
            </p>
          </div>
          <Link
            href={allHref}
            className="ml-auto shrink-0 text-xs font-medium text-primary hover:underline"
          >
            Demandes
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-primary/30 bg-primary/5 p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Inbox className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-foreground">À traiter</h2>
          <p className="text-xs text-muted-foreground text-pretty">
            {actionCount} demande{actionCount > 1 ? "s" : ""} nécessite
            {actionCount > 1 ? "nt" : ""} votre attention
            {waitingClientCount > 0 ? ` · ${waitingClientCount} en attente client` : ""}
          </p>
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {items.map((r) => (
          <li key={r.id}>
            <Link
              href={r.href}
              className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/40"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-foreground">{r.customerName}</span>
                  {r.isNew ? (
                    <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
                      Nouvelle
                    </span>
                  ) : null}
                </div>
                {r.vehicle ? <p className="truncate text-xs text-foreground/80">{r.vehicle}</p> : null}
                <p className="truncate text-xs text-muted-foreground">{r.typeLabel}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                  <span>Reçue le {formatDateShort(r.createdAt)}</span>
                  {r.photoCount > 0 ? (
                    <span className="inline-flex items-center gap-1">
                      <ImageIcon className="size-3" aria-hidden="true" />
                      {r.photoCount} photo{r.photoCount > 1 ? "s" : ""}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <CustomRequestStatusBadge status={r.status} />
                <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <Link
        href={allHref}
        className="mt-3 inline-flex min-h-9 items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        Voir toutes les demandes
        <ArrowRight className="size-3.5" aria-hidden="true" />
      </Link>
    </section>
  )
}
