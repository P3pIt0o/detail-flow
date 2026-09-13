import Link from "next/link"
import { ArrowLeft, Mail, MessageCircle, Pencil, Phone, Car, AlertTriangle, BellRing } from "lucide-react"
import type { ClientProfile, TimelineEntry } from "@/lib/admin/client-profile"
import { vehicleLabel } from "@/lib/admin/client-crm"
import { StatusBadge } from "@/components/admin/status-badge"
import { CustomRequestStatusBadge } from "@/components/admin/custom-request-status-badge"
import { QuoteAttachmentsGallery } from "@/components/admin/quote-attachments-gallery"
import { formatPrice, formatDateShort } from "@/lib/format"
import { withTenant } from "@/lib/tenant-link"
import { toTelHref, toWhatsAppDigits } from "@/lib/phone"

/** Au-delà de ce délai sans prestation terminée, on propose une relance manuelle. */
const RELANCE_THRESHOLD_DAYS = 60

const CUSTOMER_TYPE_LABEL: Record<string, string> = {
  individual: "Particulier",
  business: "Entreprise",
}

const SOURCE_LABEL: Record<ClientProfile["source"], string> = {
  manual: "Fiche client",
  booking: "Issu des réservations",
  both: "Fiche + réservations",
}

const FINANCIAL_STATUS_LABEL: Record<string, string> = {
  draft: "Brouillon",
  issued: "Émise",
  sent: "Envoyée",
  paid: "Payée",
  cancelled: "Annulée",
  pending: "En attente",
  processing: "En cours",
  failed: "Échoué",
  refunded: "Remboursé",
  partially_refunded: "Part. remboursé",
  succeeded: "Effectué",
}

function financialStatusLabel(status: string | null): string {
  if (!status) return ""
  return FINANCIAL_STATUS_LABEL[status] ?? status
}

export function ClientProfileView({
  profile,
  tenantParam,
  tenantSlug,
}: {
  profile: ClientProfile
  tenantParam: string | null
  tenantSlug: string
}) {
  const typeLabel = profile.customerType ? CUSTOMER_TYPE_LABEL[profile.customerType] : "À confirmer"
  const telHref = toTelHref(profile.phone)
  const waDigits = toWhatsAppDigits(profile.phone)
  const s = profile.stats
  const showRelance =
    s.daysSinceLastCompleted != null && s.daysSinceLastCompleted >= RELANCE_THRESHOLD_DAYS
  const relanceHref = waDigits
    ? `https://wa.me/${waDigits}`
    : profile.email
      ? `mailto:${profile.email}`
      : null

  return (
    <div className="space-y-6">
      <Link
        href={withTenant("/admin/clients", tenantParam)}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Retour aux clients
      </Link>

      {/* En-tête */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-foreground text-balance">{profile.name}</h1>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
              {typeLabel}
            </span>
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              {SOURCE_LABEL[profile.source]}
            </span>
          </div>
          <div className="space-y-0.5 text-sm text-muted-foreground">
            <p>{profile.email ?? "Aucun email"}</p>
            <p>{profile.phone ?? "Aucun téléphone"}</p>
            {profile.address && <p className="text-pretty">{profile.address}</p>}
          </div>
        </div>
        {profile.hasManualRecord && profile.clientId != null && (
          <Link
            href={withTenant(`/admin/clients/${profile.clientId}/modifier`, tenantParam)}
            className="inline-flex h-9 w-fit items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
          >
            <Pencil className="size-4" aria-hidden="true" />
            Modifier
          </Link>
        )}
      </div>

      {/* Actions rapides (uniquement selon les coordonnées disponibles) */}
      {(telHref || profile.email || waDigits) && (
        <div className="flex flex-wrap gap-2">
          {telHref && (
            <a
              href={telHref}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Phone className="size-4" aria-hidden="true" /> Appeler
            </a>
          )}
          {profile.email && (
            <a
              href={`mailto:${profile.email}`}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Mail className="size-4" aria-hidden="true" /> Envoyer un email
            </a>
          )}
          {waDigits && (
            <a
              href={`https://wa.me/${waDigits}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <MessageCircle className="size-4" aria-hidden="true" /> WhatsApp
            </a>
          )}
        </div>
      )}

      {profile.needsReview && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-foreground text-pretty">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
          Certains éléments partagent ce téléphone mais un email différent. Ils ne sont pas inclus
          dans cette fiche (association à vérifier).
        </p>
      )}

      {/* Indicateurs fiables */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Réservations" value={String(s.bookingsCount)} />
        <Stat label="Prestations terminées" value={String(s.completedCount)} />
        <Stat
          label="Dernière prestation"
          value={s.lastCompletedDay ? formatDateShort(s.lastCompletedDay) : "—"}
          hint={s.daysSinceLastCompleted != null ? `il y a ${s.daysSinceLastCompleted} j` : undefined}
        />
        <Stat label="Montant réservé" value={formatPrice(s.reservedCents)} />
        <Stat label="Encaissé net" value={formatPrice(s.collectedNetCents)} />
      </div>

      {/* Relance client légère (manuelle, jamais automatique) */}
      {showRelance && relanceHref && (
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <BellRing className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <p className="text-sm text-foreground text-pretty">
              Dernière prestation le {formatDateShort(s.lastCompletedDay!)} (il y a {s.daysSinceLastCompleted} jours).
              C&apos;est peut-être le moment de reprendre contact.
            </p>
          </div>
          <a
            href={relanceHref}
            target={waDigits ? "_blank" : undefined}
            rel={waDigits ? "noopener noreferrer" : undefined}
            className="inline-flex h-10 w-fit shrink-0 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <BellRing className="size-4" aria-hidden="true" /> Relancer le client
          </a>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Historique */}
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Historique
            </h2>
            {profile.timeline.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun évènement pour ce client.</p>
            ) : (
              <ol className="space-y-3">
                {profile.timeline.map((e) => (
                  <TimelineRow key={e.key} entry={e} tenantParam={tenantParam} />
                ))}
              </ol>
            )}
          </section>

          {/* Documents (factures & avoirs liés aux réservations reconnues) */}
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Factures & avoirs
            </h2>
            {profile.invoices.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun document lié.</p>
            ) : (
              <ul className="divide-y divide-border">
                {profile.invoices.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between gap-3 py-2.5">
                    <Link
                      href={withTenant(`/admin/factures/${inv.id}`, tenantParam)}
                      className="min-w-0 text-sm text-foreground hover:underline"
                    >
                      <span className="font-medium">
                        {inv.documentType === "credit_note" ? "Avoir" : "Facture"}
                        {inv.number ? ` ${inv.number}` : ""}
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {inv.day ? formatDateShort(inv.day) : "—"} · {financialStatusLabel(inv.status)}
                      </span>
                    </Link>
                    <span className="shrink-0 text-sm font-medium text-foreground">
                      {formatPrice(inv.documentType === "credit_note" ? -Math.abs(inv.totalCents) : inv.totalCents)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Photos des demandes associées (routes/autorisations existantes) */}
          <QuoteAttachmentsGallery tenantSlug={tenantSlug} attachments={profile.photos} />
        </div>

        <div className="space-y-6">
          {/* Véhicules connus (lecture seule, reconstruits des snapshots) */}
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Véhicules connus
            </h2>
            {profile.vehicles.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun véhicule connu.</p>
            ) : (
              <ul className="space-y-3">
                {profile.vehicles.map((v, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <Car className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{vehicleLabel(v)}</p>
                      <p className="text-xs text-muted-foreground">
                        {[v.type, v.plate].map((x) => (x ?? "").trim()).filter(Boolean).join(" · ") || "—"}
                        {v.lastDate ? ` · ${formatDateShort(v.lastDate)}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Notes internes : uniquement pour une fiche manuelle existante */}
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Notes internes
            </h2>
            {profile.hasManualRecord ? (
              profile.notes && profile.notes.trim() ? (
                <p className="whitespace-pre-wrap text-sm text-foreground">{profile.notes}</p>
              ) : (
                <p className="text-sm text-muted-foreground">Aucune note pour l&apos;instant.</p>
              )
            ) : (
              <p className="text-sm text-muted-foreground text-pretty">
                Aucune fiche client n&apos;existe encore pour ce contact. Les notes internes seront
                disponibles après création d&apos;une fiche.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground text-pretty">{label}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function TimelineStatus({ entry }: { entry: TimelineEntry }) {
  if (!entry.status) return null
  if (entry.kind === "booking" || entry.kind === "completed") {
    return <StatusBadge status={entry.status} />
  }
  if (entry.kind === "request" || entry.kind === "request_decision") {
    return <CustomRequestStatusBadge status={entry.status} />
  }
  return (
    <span className="inline-flex h-6 items-center rounded-full bg-muted px-2.5 text-xs font-medium text-muted-foreground">
      {FINANCIAL_STATUS_LABEL[entry.status] ?? entry.status}
    </span>
  )
}

function TimelineRow({ entry, tenantParam }: { entry: TimelineEntry; tenantParam: string | null }) {
  const inner = (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted/40">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">{entry.label}</span>
          <TimelineStatus entry={entry} />
        </div>
        <p className="text-xs text-muted-foreground">
          {entry.day ? formatDateShort(entry.day) : "—"}
          {entry.vehicle ? ` · ${entry.vehicle}` : ""}
        </p>
      </div>
      {entry.amountCents != null && (
        <span className="shrink-0 text-sm font-medium text-foreground">{formatPrice(entry.amountCents)}</span>
      )}
    </div>
  )
  if (!entry.href) return <li>{inner}</li>
  return (
    <li>
      <Link href={withTenant(entry.href, tenantParam)} className="block">
        {inner}
      </Link>
    </li>
  )
}
