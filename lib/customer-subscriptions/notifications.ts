import { and, asc, eq, gt, inArray, isNotNull, isNull } from "drizzle-orm"
import { expireStaleSubscriptionRequests } from "./requests"
import { companies, maintenanceSubscriptionRequests, maintenanceSubscriptions, maintenanceSubscriptionVehicles, settings } from "@/lib/db/schema"
import { tenantPublicPathUrl } from "@/lib/tenant-shared"
import type { Executor } from "./engine"
import { buildSubscriptionContractSummary, computeNextBillingAt, type ContractSubscriptionInput } from "./contract-summary"
import {
  claimDueEmails,
  dedupeKeys,
  enqueueCustomerSubscriptionEmail,
  markEmailFailed,
  markEmailSent,
  markEmailSkipped,
  type OutboxRow,
} from "./email-outbox"
import { buildRequestPlanSummary, requestAdminDestination, renderCustomerSubscriptionEmail } from "./emails"
import { CUSTOMER_MANAGE_PATH, MANAGE_LINK_TTL_SECONDS, signCustomerAccess } from "./customer-access"
import { addBillingInterval, type BillingInterval } from "./dates"

/**
 * Rappels avant échéance / renouvellement + envoi de l'outbox. Appelé depuis le
 * cron existant (/api/cron/reminders) dans un try/catch isolé : une panne ici
 * n'empêche jamais les rappels Booking/SMS.
 *
 * Idempotence : chaque rappel a une dedupeKey liée à la frontière réelle
 * (billing_notice:<id>:<boundary>, renewal_notice:<id>:<termEndsAt>) → cron
 * rejoué ou workers concurrents = un seul email. Aucun envoi rétroactif : un
 * rappel n'est planifié que si la frontière est encore à venir.
 */
export const DEFAULT_NOTICE_DAYS = 7
const DAY = 24 * 3600 * 1000

export type EmailSender = (args: {
  to: string
  subject: string
  html: string
  fromName?: string
  replyTo?: string
}) => Promise<{ ok: boolean; id?: string; error?: string; skipped?: boolean }>

const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/
export const isValidEmail = (v: unknown): v is string => typeof v === "string" && v.length <= 254 && EMAIL_RE.test(v)

/** Garde commune client/pro : hors Production, aucun vrai email sauf opt-in explicite. */
export function customerEmailsAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.VERCEL_ENV === "production") return true
  return env.CUSTOMER_SUBSCRIPTIONS_PREVIEW_EMAILS === "1"
}

type NoticePlan = { type: "billing_notice" | "renewal_notice" | "commitment_ending_notice" | "term_ending_notice"; dedupeKey: string; boundary: Date; payload: Record<string, unknown> }

/**
 * Distingue FACTURATION et RENOUVELLEMENT d'engagement (pur, testable).
 * Retourne au plus un rappel : celui de la prochaine frontière à venir dont la
 * fenêtre de rappel est ouverte.
 */
export function planUpcomingNotice(sub: ContractSubscriptionInput & { renewalNoticeSentAt: Date | null }, now: Date): NoticePlan | null {
  if (!["active", "cancel_scheduled"].includes(sub.status)) return null
  const noticeMs = (sub.renewalNoticeDaysSnapshot ?? DEFAULT_NOTICE_DAYS) * DAY
  const interval: BillingInterval = { unit: sub.billingIntervalUnitSnapshot as BillingInterval["unit"], count: sub.billingIntervalCountSnapshot }
  const inWindow = (d: Date) => d.getTime() > now.getTime() && d.getTime() - noticeMs <= now.getTime()
  const termEnd = sub.currentTermEndsAt
  const hasCommitment = sub.commitmentUnitSnapshot !== "none"
  const nextBillingAt = computeNextBillingAt(sub, now)

  if (termEnd && inWindow(termEnd) && sub.cancelAt == null) {
    if (sub.renewalModeSnapshot === "none" || sub.renewalOptOutAt) {
      return { type: "term_ending_notice", dedupeKey: `term_ending:${sub.id}:${termEnd.toISOString()}`, boundary: termEnd, payload: { endsAt: termEnd.toISOString() } }
    }
    if (hasCommitment && sub.renewalModeSnapshot === "same_term" && sub.renewalNoticeSentAt == null) {
      return { type: "renewal_notice", dedupeKey: dedupeKeys.renewalNotice(sub.id, termEnd), boundary: termEnd, payload: { termEndsAt: termEnd.toISOString(), nextBillingAt: nextBillingAt?.toISOString() ?? null } }
    }
    if (hasCommitment && sub.renewalModeSnapshot === "open_ended" && termEnd.getTime() === sub.currentTermEndsAt?.getTime() && sub.currentTermStartedAt) {
      return { type: "commitment_ending_notice", dedupeKey: `commitment_ending:${sub.id}:${termEnd.toISOString()}`, boundary: termEnd, payload: { termEndsAt: termEnd.toISOString(), nextBillingAt: nextBillingAt?.toISOString() ?? null } }
    }
  }
  if (sub.paymentMode === "recurring" && nextBillingAt && inWindow(nextBillingAt)) {
    // Une frontière qui coïncide avec un renouvellement d'engagement est couverte par le rappel ci-dessus.
    if (termEnd && termEnd.getTime() === nextBillingAt.getTime() && hasCommitment) return null
    return {
      type: "billing_notice",
      dedupeKey: dedupeKeys.billingNotice(sub.id, nextBillingAt),
      boundary: nextBillingAt,
      payload: { boundary: nextBillingAt.toISOString(), coversUntil: addBillingInterval(nextBillingAt, interval).toISOString(), amountCents: sub.priceCentsSnapshot },
    }
  }
  return null
}

export async function scheduleUpcomingNotices(db: Executor, now: Date, opts: { pageSize?: number; maxPages?: number } = {}): Promise<number> {
  const pageSize = opts.pageSize ?? 200
  let lastId = 0
  let enqueued = 0
  for (let page = 0; page < (opts.maxPages ?? 50); page++) {
    const rows = await db
      .select()
      .from(maintenanceSubscriptions)
      .where(and(inArray(maintenanceSubscriptions.status, ["active", "cancel_scheduled"]), isNotNull(maintenanceSubscriptions.billingAnchorAt), gt(maintenanceSubscriptions.id, lastId)))
      .orderBy(asc(maintenanceSubscriptions.id))
      .limit(pageSize)
    if (rows.length === 0) break
    for (const sub of rows) {
      const plan = planUpcomingNotice(sub as never, now)
      if (!plan) continue
      const r = await enqueueCustomerSubscriptionEmail(db, { companyId: sub.companyId, subscriptionId: sub.id, type: plan.type, recipientRole: "client", dedupeKey: plan.dedupeKey, payload: plan.payload }, now)
      if (r.enqueued) enqueued++
    }
    lastId = rows[rows.length - 1].id
    if (rows.length < pageSize) break
  }
  return enqueued
}

async function resolveRecipient(db: Executor, row: OutboxRow) {
  const [company] = await db.select({ id: companies.id, slug: companies.slug }).from(companies).where(eq(companies.id, row.companyId))
  const [set] = await db.select({ businessName: settings.businessName, businessEmail: settings.businessEmail }).from(settings).where(eq(settings.companyId, row.companyId))
  if (!company) return null
  const sub = row.subscriptionId
    ? (await db.select().from(maintenanceSubscriptions).where(and(eq(maintenanceSubscriptions.id, row.subscriptionId), eq(maintenanceSubscriptions.companyId, row.companyId))))[0] ?? null
    : null
  const vehicle = sub
    ? (
        await db
          .select()
          .from(maintenanceSubscriptionVehicles)
          .where(and(eq(maintenanceSubscriptionVehicles.subscriptionId, sub.id), eq(maintenanceSubscriptionVehicles.companyId, row.companyId), isNull(maintenanceSubscriptionVehicles.activeUntil)))
      )[0] ?? null
    : null
  // Emails de demande : destinataire et message relus depuis la demande (tenant strict), jamais stockés dans le payload outbox.
  const request = row.requestId
    ? (
        await db
          .select({
            planSnapshot: maintenanceSubscriptionRequests.planSnapshot,
            createdAt: maintenanceSubscriptionRequests.createdAt,
            customerEmail: maintenanceSubscriptionRequests.customerEmail,
            customerName: maintenanceSubscriptionRequests.customerName,
            vehicleBrand: maintenanceSubscriptionRequests.vehicleBrand,
            vehicleModel: maintenanceSubscriptionRequests.vehicleModel,
            customerDecisionMessage: maintenanceSubscriptionRequests.customerDecisionMessage,
          })
          .from(maintenanceSubscriptionRequests)
          .where(and(eq(maintenanceSubscriptionRequests.id, row.requestId), eq(maintenanceSubscriptionRequests.companyId, row.companyId)))
      )[0] ?? null
    : null
  const payload = { ...((row.payload ?? {}) as Record<string, unknown>) }
  if (row.type === "request_rejected" && request?.customerDecisionMessage) payload.customerMessage = request.customerDecisionMessage
  const legacyEmail = typeof payload.requestEmail === "string" ? payload.requestEmail : undefined
  delete payload.requestEmail
  const to = row.recipientRole === "professional" ? set?.businessEmail : (sub?.customerEmail ?? request?.customerEmail ?? legacyEmail)
  return { company, settings: set ?? null, sub, vehicle, request, to, payload }
}

export type DrainResult = { sent: number; failed: number; skipped: number }

export async function drainCustomerSubscriptionOutbox(db: Executor, send: EmailSender, now: Date, opts: { limit?: number; emailsAllowed?: boolean } = {}): Promise<DrainResult> {
  const out: DrainResult = { sent: 0, failed: 0, skipped: 0 }
  const allowed = process.env.VERCEL_ENV === "preview"
    ? customerEmailsAllowed() && opts.emailsAllowed !== false
    : opts.emailsAllowed ?? customerEmailsAllowed()
  const claimed = await claimDueEmails(db, now, opts.limit ?? 50)
  for (const row of claimed) {
    try {
      const r = await resolveRecipient(db, row)
      if (!r || !isValidEmail(r.to)) {
        await markEmailSkipped(db, row, "no_recipient", now)
        out.skipped++
        continue
      }
      if (!allowed) {
        await markEmailSkipped(db, row, "preview_guard", now)
        out.skipped++
        continue
      }
      const businessName = r.settings?.businessName?.trim() || "Votre professionnel"
      const summary = r.sub ? buildSubscriptionContractSummary(r.sub as never, now) : null
      let manageUrl: string | null = null
      if (r.sub?.manageTokenHash && r.company.slug && row.recipientRole === "client") {
        const token = signCustomerAccess({ companyId: row.companyId, subscriptionId: r.sub.id, purpose: "manage_link", manageTokenHash: r.sub.manageTokenHash, ttlSeconds: MANAGE_LINK_TTL_SECONDS }, now)
        const url = tenantPublicPathUrl(`${CUSTOMER_MANAGE_PATH}/acces?t=${encodeURIComponent(token)}`, r.company.slug, process.env.NEXT_PUBLIC_ROOT_DOMAIN)
        manageUrl = url.startsWith("/") ? null : url
      }
      const vehicleSource = r.vehicle ?? r.request
      const vehicleLabel = vehicleSource ? [vehicleSource.vehicleBrand, vehicleSource.vehicleModel].filter(Boolean).join(" ") : null
      // « Finaliser mon abonnement » = lien signé vers l'espace client (récapitulatif final avant paiement).
      const ctaUrl = row.type === "request_accepted" ? manageUrl : row.type === "request_received_pro" && row.requestId ? requestAdminDestination(row.requestId) : null
      const rendered = renderCustomerSubscriptionEmail(row.type as never, {
        businessName,
        customerName: r.sub?.customerName ?? r.request?.customerName ?? null,
        vehicleLabel,
        requestSummary: r.request && (row.type === "request_received" || row.type === "request_received_pro") ? buildRequestPlanSummary(r.request.planSnapshot) : null,
        requestedAt: r.request?.createdAt,
        summary,
        manageUrl,
        ctaUrl,
        payload: r.payload,
      })
      const replyTo = isValidEmail(r.settings?.businessEmail) ? r.settings!.businessEmail! : undefined
      const res = await send({ to: r.to, subject: rendered.subject, html: rendered.html, fromName: businessName, replyTo })
      if (res.ok) {
        await markEmailSent(db, row, res.id ?? null, now)
        // renewalNoticeSentAt n'est posé QU'APRÈS acceptation réelle par le fournisseur.
        if (row.type === "renewal_notice" && r.sub) {
          await db
            .update(maintenanceSubscriptions)
            .set({ renewalNoticeSentAt: now })
            .where(and(eq(maintenanceSubscriptions.id, r.sub.id), eq(maintenanceSubscriptions.companyId, row.companyId), isNull(maintenanceSubscriptions.renewalNoticeSentAt)))
        }
        out.sent++
      } else {
        await markEmailFailed(db, row, res.skipped ? "provider_unavailable" : "provider_error", now)
        out.failed++
      }
    } catch {
      await markEmailFailed(db, row, "processing_error", now)
      out.failed++
    }
  }
  return out
}

export async function processCustomerSubscriptionNotifications(db: Executor, send: EmailSender, now: Date = new Date()) {
  const expiredRequests = await expireStaleSubscriptionRequests(db, now)
  const scheduled = await scheduleUpcomingNotices(db, now)
  const drained = await drainCustomerSubscriptionOutbox(db, send, now)
  console.log("[customer-subscriptions] notifications", { scheduled, expiredRequests, ...drained })
  return { scheduled, expiredRequests, ...drained }
}
