import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, CalendarClock, ExternalLink } from "lucide-react"
import { requireCompanyMember } from "@/lib/admin"
import { canUseFeature } from "@/lib/licensing/enforce"
import { resolvePublicLink } from "@/lib/admin/public-link"
import { normalizePhone } from "@/lib/admin/client-crm"
import { getLeadDetail, isLeadsSchemaNotReady } from "@/lib/leads/server"
import { withTenant } from "@/lib/tenant-link"
import {
  LEAD_LOST_REASON_LABELS,
  isLeadLostReason,
  type LeadActivityType,
  type LeadStatus,
  type LeadSource,
} from "@/lib/leads/model"
import { LeadsInitializing } from "@/components/admin/leads/leads-initializing"
import { LeadStatusBadge, LeadSourceBadge } from "@/components/admin/leads/lead-badges"
import { LeadQuickActions } from "@/components/admin/leads/lead-quick-actions"
import { LeadStatusControls } from "@/components/admin/leads/lead-status-controls"
import { LeadFollowUpControls } from "@/components/admin/leads/lead-follow-up-controls"
import { LeadNoteForm } from "@/components/admin/leads/lead-note-form"
import { LeadDeleteButton } from "@/components/admin/leads/lead-delete-button"
import { LeadActivityList, type ActivityItemData } from "@/components/admin/leads/lead-activity-list"

export const metadata: Metadata = {
  title: "Prospect · DetailFlow",
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  )
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{value}</dd>
    </div>
  )
}

export default async function LeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  const leadId = Number(id)
  if (!Number.isInteger(leadId) || leadId <= 0) notFound()

  const sp = await searchParams
  const tenant = (Array.isArray(sp.tenant) ? sp.tenant[0] : sp.tenant) ?? null
  const backHref = withTenant("/admin/leads", tenant)

  const ctx = await requireCompanyMember()
  const companyId = ctx.tenant.id

  // Feature gate serveur : sans licence, la fiche n'est pas accessible (retour liste).
  const allowed = await canUseFeature(companyId, "leads_crm")
  if (!allowed) notFound()

  let detail: Awaited<ReturnType<typeof getLeadDetail>>
  try {
    detail = await getLeadDetail(companyId, leadId)
  } catch (error) {
    // Le module possède la licence mais la migration CRM n'est pas encore appliquée.
    if (isLeadsSchemaNotReady(error)) {
      return (
        <div className="flex flex-col gap-4">
          <Link
            href={backHref}
            className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Retour aux prospects
          </Link>
          <LeadsInitializing />
        </div>
      )
    }
    throw error
  }
  if (!detail) notFound()
  const { lead, activities } = detail

  const tz = ctx.tenant.timezone
  const dateFmt = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: tz,
  })
  const dayFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeZone: tz })

  const activityItems: ActivityItemData[] = activities.map((a) => ({
    id: a.id,
    type: a.type as LeadActivityType,
    message: a.message,
    metadata: (a.metadata as Record<string, unknown> | null) ?? null,
    createdAtLabel: dateFmt.format(a.createdAt),
  }))

  const vehicleParts = [lead.vehicleType, lead.vehicleBrand, lead.vehicleModel, lead.vehiclePlate].filter(Boolean)
  const vehicle = vehicleParts.length ? vehicleParts.join(" · ") : null

  const followUpLabel = lead.nextFollowUpAt ? dayFmt.format(lead.nextFollowUpAt) : null
  const whatsappDigits = lead.phone ? normalizePhone(lead.phone)?.replace(/^\+/, "") ?? null : null

  // Lien de réservation propre (jamais ?tenant=, jamais de donnée perso).
  const link = resolvePublicLink({
    slug: ctx.tenant.slug,
    intent: (ctx.tenant.onboardingIntent as never) ?? null,
    customSiteKey: ctx.tenant.customSiteKey,
    status: ctx.tenant.status,
    rootDomain: process.env.NEXT_PUBLIC_ROOT_DOMAIN,
  })

  const customRequestHref =
    lead.source === "CUSTOM_REQUEST" && lead.sourceExternalId
      ? withTenant(`/admin/demandes/${lead.sourceExternalId}`, tenant)
      : null
  const bookingHref = lead.linkedBookingId
    ? withTenant(`/admin/reservations/${lead.linkedBookingId}`, tenant)
    : null

  const lostReasonLabel = isLeadLostReason(lead.lostReason)
    ? LEAD_LOST_REASON_LABELS[lead.lostReason]
    : null

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-4 sm:p-6">
      <Link
        href={backHref}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Prospects
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">{lead.contactName}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <LeadStatusBadge status={lead.status as LeadStatus} />
            <LeadSourceBadge source={lead.source as LeadSource} />
            {lostReasonLabel ? (
              <span className="text-xs text-muted-foreground">Motif : {lostReasonLabel}</span>
            ) : null}
          </div>
        </div>
        <LeadDeleteButton leadId={lead.id} contactName={lead.contactName} />
      </header>

      <LeadQuickActions
        phone={lead.phone}
        whatsappDigits={whatsappDigits}
        email={lead.email}
        bookingUrl={link?.url ?? null}
      />

      <Section title="Statut">
        <LeadStatusControls leadId={lead.id} current={lead.status as LeadStatus} />
      </Section>

      <Section title="Relance">
        <LeadFollowUpControls leadId={lead.id} currentLabel={followUpLabel} />
      </Section>

      <Section title="Coordonnées">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Téléphone" value={lead.phone} />
          <Field label="Email" value={lead.email} />
        </dl>
      </Section>

      {vehicle || lead.serviceInterest || lead.internalSummary ? (
        <Section title="Véhicule &amp; besoin">
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Véhicule" value={vehicle} />
            <Field label="Prestation recherchée" value={lead.serviceInterest} />
          </dl>
          {lead.internalSummary ? (
            <p className="text-sm text-foreground whitespace-pre-wrap">{lead.internalSummary}</p>
          ) : null}
        </Section>
      ) : null}

      {customRequestHref || bookingHref ? (
        <Section title="Origine &amp; rendez-vous">
          <div className="flex flex-col gap-2">
            {customRequestHref ? (
              <Link
                href={customRequestHref}
                className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                <ExternalLink className="size-4" aria-hidden="true" />
                Voir la demande
              </Link>
            ) : null}
            {bookingHref ? (
              <Link
                href={bookingHref}
                className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                <CalendarClock className="size-4" aria-hidden="true" />
                Voir le rendez-vous
              </Link>
            ) : null}
          </div>
        </Section>
      ) : null}

      <Section title="Ajouter une note">
        <LeadNoteForm leadId={lead.id} />
      </Section>

      <Section title="Historique">
        <LeadActivityList activities={activityItems} />
      </Section>
    </div>
  )
}
