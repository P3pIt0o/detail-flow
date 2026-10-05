/**
 * LIEN DE PAIEMENT CLIENT (/abonnement-entretien/[token]).
 *
 * INVARIANTS :
 *  - le token brut EST l'autorisation : contrat résolu UNIQUEMENT par
 *    manageTokenHash (SHA-256), jamais par un subscriptionId navigateur ;
 *  - le tenant résolu serveur (hôte / ?tenant=) doit être celui du contrat ;
 *  - rotateManageToken() remplace le hash → l'ancien lien est refusé ;
 *  - aucun rôle admin simulé : on passe par startSubscriptionCheckoutAsCustomer ;
 *  - le token brut n'est jamais stocké ni journalisé.
 */
import { and, eq } from "drizzle-orm"
import { companies, maintenanceSubscriptions, settings } from "@/lib/db/schema"
import { tenantPublicPathUrl } from "@/lib/tenant-shared"
import { buildSubscriptionContractSummary, formatIntervalFr, formatMoney } from "./contract-summary"
import type { CustomerSessionProof, Executor } from "./engine"
import { CustomerSubscriptionError } from "./errors"
import { previewDeploymentHost } from "./return-url"
import { escapeHtml, safeHref } from "./html"
import { hashManageToken, verifyManageToken } from "./manage-token"
import { customerEmailsAllowed, isValidEmail, type EmailSender } from "./notifications"
import { startSubscriptionCheckoutAsCustomer, type CustomerSubscriptionStripePort, type StartCheckoutResult } from "./payments"
import type { ReturnUrlContext } from "./return-url"
import { isTerminalStatus } from "./statuses"
import { resolveCheckoutKind } from "./stripe-mapping"

type SubscriptionRow = typeof maintenanceSubscriptions.$inferSelect

export const PAYMENT_LINK_BASE_PATH = "/abonnement-entretien"
export const PAYMENT_LINK_EMAIL_SUBJECT = "Votre abonnement d’entretien est prêt"
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/

export class PaymentLinkInvalidError extends Error {
  constructor() {
    super("PAYMENT_LINK_INVALID")
  }
}

export const isWellFormedManageToken = (t: unknown): t is string => typeof t === "string" && TOKEN_RE.test(t)

export function buildPaymentLinkUrl(
  slug: string,
  token: string,
  rootDomain: string | undefined = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "www.detailflow.fr",
  previewHost: string | null = previewDeploymentHost(),
): string {
  if (previewHost) return `https://${previewHost}${PAYMENT_LINK_BASE_PATH}/${token}?tenant=${encodeURIComponent(slug)}`
  return tenantPublicPathUrl(`${PAYMENT_LINK_BASE_PATH}/${token}`, slug, rootDomain)
}

/** Résolution par hash + contrôle du tenant serveur. Null = lien invalide (cause jamais révélée). */
export async function findSubscriptionByManageToken(db: Executor, token: unknown, resolvedCompanyId: number | null): Promise<SubscriptionRow | null> {
  if (resolvedCompanyId == null || !isWellFormedManageToken(token)) return null
  const [row] = await db
    .select()
    .from(maintenanceSubscriptions)
    .where(eq(maintenanceSubscriptions.manageTokenHash, hashManageToken(token)))
    .limit(1)
  if (!row?.manageTokenHash || !verifyManageToken(token, row.manageTokenHash)) return null
  if (row.companyId !== resolvedCompanyId) return null
  return row
}

export type PaymentLinkView =
  | { state: "invalid" }
  | { state: "active" | "ended" | "unavailable"; planName: string }
  | {
      state: "payable"
      step: "initial_cleaning" | "subscription"
      planName: string
      priceLabel: string
      intervalLabel: string
      dueTodayCents: number
      followingPaymentCents: number | null
      currency: string
    }

export async function loadPaymentLinkView(db: Executor, token: unknown, resolvedCompanyId: number | null): Promise<PaymentLinkView> {
  const row = await findSubscriptionByManageToken(db, token, resolvedCompanyId)
  if (!row) return { state: "invalid" }
  const planName = row.planNameSnapshot
  const kind = resolveCheckoutKind(row)
  if (kind) {
    const s = buildSubscriptionContractSummary(row)
    return {
      state: "payable",
      step: kind === "initial_cleaning" ? "initial_cleaning" : "subscription",
      planName,
      priceLabel: formatMoney(row.priceCentsSnapshot, row.currency),
      intervalLabel: formatIntervalFr({ unit: row.billingIntervalUnitSnapshot as "month" | "week", count: row.billingIntervalCountSnapshot }),
      dueTodayCents: s.dueToday.amountCents,
      followingPaymentCents: s.followingPaymentCents,
      currency: s.price.currency,
    }
  }
  if (row.status === "active") return { state: "active", planName }
  if (isTerminalStatus(row.status)) return { state: "ended", planName }
  return { state: "unavailable", planName }
}

/** Checkout client autorisé par le seul token. Prix, compte, fee, retour : rechargés serveur par le moteur. */
export async function startCheckoutForManageToken(
  db: Executor,
  port: CustomerSubscriptionStripePort,
  input: { token: unknown; resolvedCompanyId: number | null; termsAccepted: unknown },
  returnUrlContext?: ReturnUrlContext,
  now: Date = new Date(),
): Promise<StartCheckoutResult & { connectedAccountId: string }> {
  const row = await findSubscriptionByManageToken(db, input.token, input.resolvedCompanyId)
  if (!row) throw new PaymentLinkInvalidError()
  if (input.termsAccepted !== true) throw new CustomerSubscriptionError("INVALID_PLAN", [{ field: "termsAccepted", code: "INVALID_PLAN" }])
  const proof = { companyId: row.companyId, subscriptionId: row.id } as CustomerSessionProof
  const result = await startSubscriptionCheckoutAsCustomer(db, port, proof, { termsAccepted: true }, { returnUrlContext }, now)
  const [fresh] = await db
    .select({ providerAccountId: maintenanceSubscriptions.providerAccountId })
    .from(maintenanceSubscriptions)
    .where(and(eq(maintenanceSubscriptions.id, row.id), eq(maintenanceSubscriptions.companyId, row.companyId)))
  if (!fresh?.providerAccountId) throw new CustomerSubscriptionError("STRIPE_NOT_CONNECTED")
  return { ...result, connectedAccountId: fresh.providerAccountId }
}

/* --------------------------------- Email ---------------------------------- */

export function renderPaymentLinkEmail(i: { customerName: string; businessName: string; planName: string; priceLabel: string; intervalLabel: string; url: string }) {
  const href = safeHref(i.url)
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 0;color:#6b7280;font-size:14px">${escapeHtml(label)}</td><td style="padding:6px 0;text-align:right;font-size:14px;font-weight:600;color:#111827">${escapeHtml(value)}</td></tr>`
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif;color:#111827">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<div style="background:#ffffff;border-radius:12px;padding:24px">
<p style="margin:0 0 16px;font-size:15px;line-height:1.5">Bonjour ${escapeHtml(i.customerName)},</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.5">Votre demande d’abonnement auprès de <strong>${escapeHtml(i.businessName)}</strong> a été acceptée.</p>
<table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 20px">${row("Formule", i.planName)}${row("Tarif", i.priceLabel)}${row("Fréquence", i.intervalLabel)}</table>
<p style="margin:0 0 20px;text-align:center"><a href="${escapeHtml(href)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:8px">Finaliser mon abonnement</a></p>
<p style="margin:0;font-size:13px;line-height:1.5;color:#6b7280">Ce lien est personnel : ne le transférez pas. Le paiement est sécurisé par Stripe.</p>
</div></div></body></html>`
  return { subject: PAYMENT_LINK_EMAIL_SUBJECT, html }
}

export type PaymentLinkEmailOutcome = "sent" | "failed" | "disabled" | "not_payable"

/** Échec = résultat, jamais une exception : le contrat créé n'est jamais affecté. */
export async function sendPaymentLinkEmail(
  db: Executor,
  send: EmailSender,
  input: { companyId: number; subscriptionId: number; manageToken: string },
  opts: { rootDomain?: string; emailsAllowed?: boolean } = {},
): Promise<PaymentLinkEmailOutcome> {
  try {
    const [sub] = await db
      .select()
      .from(maintenanceSubscriptions)
      .where(and(eq(maintenanceSubscriptions.id, input.subscriptionId), eq(maintenanceSubscriptions.companyId, input.companyId)))
    if (!sub || !sub.manageTokenHash || !verifyManageToken(input.manageToken, sub.manageTokenHash)) return "failed"
    if (!resolveCheckoutKind(sub)) return "not_payable"
    if (!isValidEmail(sub.customerEmail)) return "failed"
    if (!(opts.emailsAllowed ?? customerEmailsAllowed())) return "disabled"
    const [company] = await db.select({ slug: companies.slug }).from(companies).where(eq(companies.id, input.companyId))
    if (!company?.slug) return "failed"
    const [set] = await db
      .select({ businessName: settings.businessName, businessEmail: settings.businessEmail })
      .from(settings)
      .where(eq(settings.companyId, input.companyId))
    const businessName = set?.businessName?.trim() || "Votre professionnel"
    const url = buildPaymentLinkUrl(company.slug, input.manageToken, opts.rootDomain)
    const rendered = renderPaymentLinkEmail({
      customerName: sub.customerName,
      businessName,
      planName: sub.planNameSnapshot,
      priceLabel: formatMoney(sub.priceCentsSnapshot, sub.currency),
      intervalLabel: formatIntervalFr({ unit: sub.billingIntervalUnitSnapshot as "month" | "week", count: sub.billingIntervalCountSnapshot }),
      url,
    })
    const replyTo = isValidEmail(set?.businessEmail) ? set!.businessEmail! : undefined
    const res = await send({ to: sub.customerEmail, subject: rendered.subject, html: rendered.html, fromName: businessName, replyTo })
    return res.ok && !res.skipped ? "sent" : "failed"
  } catch {
    // Volontairement silencieux : aucune donnée (dont le token) n'est journalisée.
    return "failed"
  }
}
