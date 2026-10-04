import { tenantPathUrl } from "@/lib/tenant-shared"
import { escapeHtml, safeHref } from "./html"
import { assertValidPlanConfig } from "./plan-validation"

export function buildRequestPlanSummary(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== "object") throw new Error("INVALID_REQUEST_SNAPSHOT")
  const plan = assertValidPlanConfig(snapshot)
  const names = snapshot as Record<string, unknown>
  return {
    planName: plan.name,
    serviceName: typeof names.includedServiceName === "string" ? names.includedServiceName : "—",
    uses: plan.includedUsesPerCycle,
    price: formatMoney(plan.priceCents, plan.currency),
    frequency: formatIntervalFr({ unit: plan.billingIntervalUnit, count: plan.billingIntervalCount }),
    commitment: formatCommitmentFr(plan.commitmentUnit, plan.commitmentCount),
    renewal: formatRenewalFr(plan.renewalMode, false),
    notice: plan.renewalNoticeDays == null ? null : `${plan.renewalNoticeDays} jours avant l'échéance`,
    payment: [
      plan.allowRecurringPayment ? "Prélèvement récurrent" : null,
      plan.allowPrepaidPayment ? `Paiement à l'avance pour ${plan.prepaidBillingCycles} périodes` : null,
    ].filter(Boolean).join(" ou "),
    initialCleaning: plan.initialCleaningRequired
      ? (typeof names.initialServiceName === "string" ? names.initialServiceName : "Nettoyage initial requis") : null,
  }
}

export function requestAdminDestination(requestId: number, slug?: string | null, rootDomain?: string): string | null {
  if (!Number.isSafeInteger(requestId) || requestId <= 0) return null
  return professionalAdminDestination("/admin/abonnements-clients?vue=a-traiter", slug, rootDomain)
}

export function professionalAdminDestination(path: string, slug?: string | null, rootDomain?: string): string | null {
  if (!slug || !rootDomain || !/^\/admin\/abonnements-clients(?:\?|\/|$)/.test(path)) return null
  const destination = tenantPathUrl(path, slug, rootDomain)
  return safeHref(destination) === "#" ? null : destination
}
import {
  formatCommitmentFr,
  formatDateFr,
  formatIntervalFr,
  formatMoney,
  formatRenewalFr,
  type SubscriptionContractSummary,
} from "./contract-summary"
import type { CustomerSubscriptionEmailType } from "./email-outbox"

/**
 * Rendu des emails abonnements. Toutes les valeurs tenant/client passent par
 * escapeHtml ; les URLs passent par safeHref (construites côté serveur).
 * Aucune commission DetailFlow ni frais Stripe ne sont jamais rendus.
 */
export type EmailContext = {
  businessName: string
  customerName?: string | null
  vehicleLabel?: string | null
  summary?: SubscriptionContractSummary | null
  requestSummary?: ReturnType<typeof buildRequestPlanSummary> | null
  requestedAt?: Date | null
  cancellationMessage?: string | null
  contractualEndAt?: Date | null
  manageUrl?: string | null
  ctaUrl?: string | null
  timeZone?: string
  payload?: Record<string, unknown>
}

type Rendered = { subject: string; html: string }
type Row = [label: string, value: string]

const money = (cents: unknown, currency = "eur") => (typeof cents === "number" ? formatMoney(cents, currency) : "—")
const date = (v: unknown, tz?: string) => (v ? formatDateFr(new Date(String(v)), tz) : "—")

function rowsHtml(rows: Row[]): string {
  return rows
    .map(
      ([l, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#555;vertical-align:top">${escapeHtml(l)}</td><td style="padding:6px 0;color:#111;font-weight:600">${escapeHtml(v)}</td></tr>`,
    )
    .join("")
}

function layout(input: { title: string; intro?: string[]; rows?: Row[]; rowsTitle?: string; cta?: { label: string; url: string } | null; after?: string[]; businessName: string }): string {
  const p = (t: string) => `<p style="margin:0 0 12px;line-height:1.5">${escapeHtml(t)}</p>`
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif;color:#111">
<div style="max-width:560px;margin:0 auto;padding:24px"><div style="background:#fff;border-radius:8px;padding:24px">
<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(input.title)}</h1>
${(input.intro ?? []).map(p).join("")}
${input.rows?.length ? `${input.rowsTitle ? `<h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.04em;color:#555;margin:16px 0 8px">${escapeHtml(input.rowsTitle)}</h2>` : ""}<table role="presentation" style="border-collapse:collapse;width:100%;font-size:14px">${rowsHtml(input.rows)}</table>` : ""}
${input.cta ? `<p style="margin:24px 0 8px"><a href="${safeHref(input.cta.url)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600">${escapeHtml(input.cta.label)}</a></p>` : ""}
${(input.after ?? []).map(p).join("")}
</div><p style="font-size:12px;color:#777;text-align:center;margin:16px 0 0">${escapeHtml(input.businessName)}</p></div></body></html>`
}

/** Récapitulatif contractuel depuis les SNAPSHOTS du contrat (jamais la formule courante). */
export function contractRows(s: SubscriptionContractSummary, ctx: Pick<EmailContext, "vehicleLabel" | "timeZone">): Row[] {
  const tz = ctx.timeZone
  const rows: Row[] = [["Formule", s.planName]]
  if (ctx.vehicleLabel) rows.push(["Véhicule", ctx.vehicleLabel])
  if (s.includedServiceName) rows.push(["Prestation incluse", s.includedServiceName])
  rows.push(["Prestations incluses", `${s.usesPerCycle} par période`])
  rows.push(["Prix", `${formatMoney(s.price.amountCents, s.price.currency)} ${formatIntervalFr(s.interval)}`])
  rows.push(["À payer aujourd'hui", formatMoney(s.dueToday.amountCents, s.price.currency)])
  rows.push([
    "Paiements suivants",
    s.followingPaymentCents != null ? `${formatMoney(s.followingPaymentCents, s.price.currency)} ${formatIntervalFr(s.interval)}` : "Aucun prélèvement automatique",
  ])
  rows.push(["Engagement", formatCommitmentFr(s.commitment.unit, s.commitment.count)])
  if (s.commitment.endsAt) rows.push(["Fin d'engagement", formatDateFr(s.commitment.endsAt, tz)])
  rows.push(["Renouvellement", formatRenewalFr(s.renewal.mode, s.renewal.optedOut)])
  if (s.renewal.noticeDays) rows.push(["Rappel", `${s.renewal.noticeDays} jours avant l'échéance`])
  if (s.initialCleaning.required) {
    rows.push(["Nettoyage initial", `${s.initialCleaning.serviceName ?? "Nettoyage initial"}${s.initialCleaning.priceCents != null ? ` — ${formatMoney(s.initialCleaning.priceCents, s.price.currency)}` : ""}`])
  }
  rows.push(["Arrêt", stopRuleFr(s, tz)])
  return rows
}

export function stopRuleFr(s: SubscriptionContractSummary, tz?: string): string {
  switch (s.stop.kind) {
    case "end_of_prepaid_period":
      return `Réglée jusqu'au ${formatDateFr(s.stop.prepaidUntil, tz)}, sans renouvellement automatique`
    case "ends_automatically":
      return `Se termine automatiquement le ${formatDateFr(s.stop.endsAt, tz)}`
    case "end_of_commitment":
      return `Possible à la fin de l'engagement (${formatDateFr(s.stop.commitmentEndsAt, tz)})`
    default:
      return "Possible à chaque échéance"
  }
}

export function renderCustomerSubscriptionEmail(type: CustomerSubscriptionEmailType, ctx: EmailContext): Rendered {
  const s = ctx.summary ?? null
  const tz = ctx.timeZone
  const pl = ctx.payload ?? {}
  const cur = s?.price.currency ?? "eur"
  const manage = ctx.manageUrl ? { label: "Gérer mon abonnement", url: ctx.manageUrl } : null
  const base = { businessName: ctx.businessName }
  const contract = s ? contractRows(s, ctx) : []

  const r = ctx.requestSummary
  const requestRows: Row[] = r ? [
    ["Formule", r.planName], ["Véhicule", ctx.vehicleLabel ?? "—"],
    ["Prestation incluse", r.serviceName], ["Nombre d'utilisations", `${r.uses} par période`],
    ["Prix au moment de la demande", r.price], ["Fréquence", r.frequency],
    ["Engagement", r.commitment], ["Renouvellement", r.renewal], ["Modes de paiement proposés", r.payment],
    ...(r.notice ? [["Rappel", r.notice] as Row] : []),
    ...(r.initialCleaning ? [["Nettoyage initial", r.initialCleaning] as Row] : []),
  ] : []
  switch (type) {
    case "request_received":
      return { subject: "Votre demande d'abonnement est bien reçue", html: layout({ ...base, title: "Votre demande est bien reçue", rows: requestRows, after: ["Aucun paiement n'a été effectué.", "Votre demande doit d'abord être validée par le professionnel.", "Cette demande n'est pas encore un contrat."] }) }
    case "request_received_pro":
      return { subject: "Nouvelle demande d'abonnement", html: layout({ ...base, title: "Nouvelle demande d'abonnement", rows: [["Client", ctx.customerName ?? "—"], ...requestRows, ["Date de demande", formatDateFr(ctx.requestedAt, tz)]], cta: ctx.ctaUrl ? { label: "Voir la demande", url: ctx.ctaUrl } : null }) }
    case "request_accepted":
      return {
        subject: "Votre demande a été acceptée",
        html: layout({
          ...base,
          title: "Votre demande a été acceptée",
          intro: [...(pl.planChangedSinceRequest === true ? ["Les conditions de cette formule ont été mises à jour depuis votre demande. Vérifiez attentivement le récapitulatif ci-dessous avant de continuer."] : []), "Voici les conditions de la formule que vous êtes sur le point d'activer."],
          rows: contract,
          cta: ctx.ctaUrl ? { label: "Finaliser mon abonnement", url: ctx.ctaUrl } : null,
          after: ["Vous pourrez vérifier une dernière fois ces informations avant le paiement."],
        }),
      }
    case "request_rejected": {
      const msg = typeof pl.customerMessage === "string" && pl.customerMessage.trim() ? [pl.customerMessage.trim()] : []
      return { subject: "Votre demande d'abonnement", html: layout({ ...base, title: "Votre demande d'abonnement n'a pas été retenue.", intro: msg }) }
    }
    case "initial_cleaning_paid":
      return {
        subject: "Votre nettoyage initial est réglé",
        html: layout({
          ...base,
          title: "Votre nettoyage initial est réglé",
          rows: [
            ["Montant payé", money(pl.amountCents, cur)],
            ["Prestation", s?.initialCleaning.serviceName ?? "Nettoyage initial"],
            ["Professionnel", ctx.businessName],
          ],
          after: ["Votre formule d'entretien n'est pas encore active : elle pourra être activée après la réalisation du nettoyage initial."],
        }),
      }
    case "initial_cleaning_to_do_pro":
      return { subject: "Nettoyage initial à réaliser", html: layout({ ...base, title: "Nettoyage initial à réaliser", rows: [["Client", ctx.customerName ?? "—"], ["Véhicule", ctx.vehicleLabel ?? "—"], ["Prestation", s?.initialCleaning.serviceName ?? "—"]], cta: ctx.ctaUrl ? { label: "Ouvrir l'abonnement", url: ctx.ctaUrl } : null }) }
    case "initial_cleaning_done":
      return { subject: "Votre nettoyage initial est terminé", html: layout({ ...base, title: "Votre nettoyage initial est terminé", intro: ["Vous pouvez maintenant activer votre formule d'entretien."], cta: ctx.ctaUrl ? { label: "Activer ma formule", url: ctx.ctaUrl } : null }) }
    case "subscription_activated":
      return {
        subject: "Votre abonnement est maintenant actif",
        html: layout({
          ...base,
          title: "Votre abonnement est maintenant actif",
          rowsTitle: "Récapitulatif de votre formule",
          rows: [...contract, ["Date d'activation", formatDateFr(s?.activatedAt, tz)], ["Prochaine échéance", formatDateFr(s?.nextBillingAt, tz)]],
          cta: manage,
          after: ["Conservez cet email : il récapitule les principales modalités de votre formule."],
        }),
      }
    case "subscription_activated_pro":
      return { subject: "Nouvel abonnement actif", html: layout({ ...base, title: "Nouvel abonnement actif", rows: s ? [["Formule", s.planName]] : [], cta: ctx.ctaUrl ? { label: "Voir l'abonnement", url: ctx.ctaUrl } : null }) }
    case "payment_succeeded":
      return {
        subject: "Paiement reçu",
        html: layout({
          ...base,
          title: "Paiement reçu",
          rows: [
            ["Montant payé", money(pl.amountCents, cur)],
            ["Formule", s?.planName ?? "—"],
            ["Date", date(pl.paidAt, tz)],
            ...(pl.periodStart && pl.periodEnd ? ([["Période couverte", `${date(pl.periodStart, tz)} – ${date(pl.periodEnd, tz)}`]] as Row[]) : []),
            ["Prochaine échéance", formatDateFr(s?.nextBillingAt, tz)],
            ...(s?.nextBillingAt && s.followingPaymentCents != null ? ([["Montant de la prochaine échéance", formatMoney(s.followingPaymentCents, cur)]] as Row[]) : []),
          ],
          cta: manage,
          after: ctx.manageUrl ? ["Retrouvez les modalités de votre formule dans votre espace."] : [],
        }),
      }
    case "payment_failed":
      return {
        subject: "Votre paiement n'a pas pu être effectué",
        html: layout({
          ...base,
          title: "Votre paiement n'a pas pu être effectué",
          rows: [["Formule", s?.planName ?? "—"], ["Montant concerné", money(pl.amountCents, cur)], ["Date", date(pl.failedAt, tz)]],
          intro: ["Tant que le paiement n'est pas régularisé, aucune nouvelle prestation ne peut être utilisée. Une nouvelle tentative pourra être effectuée automatiquement."],
          cta: ctx.ctaUrl ? { label: "Régulariser mon paiement", url: ctx.ctaUrl } : manage,
        }),
      }
    case "payment_failed_pro":
      return { subject: "Paiement d'abonnement à traiter", html: layout({ ...base, title: "Paiement d'abonnement à traiter", rows: [["Formule", s?.planName ?? "—"], ["Montant", money(pl.amountCents, cur)]], cta: ctx.ctaUrl ? { label: "Voir l'abonnement", url: ctx.ctaUrl } : null }) }
    case "payment_action_required":
      return {
        subject: "Une confirmation est nécessaire pour votre paiement",
        html: layout({ ...base, title: "Une confirmation est nécessaire pour votre paiement", intro: ["Votre banque demande une confirmation. Tant qu'elle n'est pas effectuée, le paiement n'est pas encaissé."], rows: [["Formule", s?.planName ?? "—"], ["Montant", money(pl.amountCents, cur)]], cta: ctx.ctaUrl ? { label: "Confirmer mon paiement", url: ctx.ctaUrl } : manage }),
      }
    case "billing_notice":
      return {
        subject: "Votre prochaine échéance",
        html: layout({
          ...base,
          title: "Votre prochaine échéance",
          intro: [`${money(pl.amountCents, cur)} prévue le ${date(pl.boundary, tz)}.`, ...(pl.coversUntil ? [`Cette échéance couvre la période du ${date(pl.boundary, tz)} au ${date(pl.coversUntil, tz)}.`] : [])],
          cta: manage,
        }),
      }
    case "renewal_notice":
      return {
        subject: "Votre formule arrive à son renouvellement",
        html: layout({
          ...base,
          title: "Votre formule arrive à son renouvellement",
          rows: [
            ["Date du renouvellement", date(pl.termEndsAt, tz)],
            ["Montant", s ? `${formatMoney(s.price.amountCents, cur)} ${formatIntervalFr(s.interval)}` : "—"],
            ["Durée du nouveau terme", s ? formatCommitmentFr(s.commitment.unit, s.commitment.count).replace("Engagement : ", "") : "—"],
            ["Prochain prélèvement", date(pl.nextBillingAt, tz)],
            ["Demander le non-renouvellement avant le", date(pl.termEndsAt, tz)],
          ],
          intro: ["Vous pouvez choisir de ne pas renouveler depuis votre espace. Une confirmation vous sera demandée."],
          cta: manage,
        }),
      }
    case "commitment_ending_notice":
      return {
        subject: "Votre période d'engagement se termine bientôt",
        html: layout({
          ...base,
          title: "Votre période d'engagement se termine bientôt",
          intro: [`Votre engagement se termine le ${date(pl.termEndsAt, tz)}. Votre formule continuera ensuite sans nouvel engagement.`],
          rows: s ? [["Prochaine échéance", date(pl.nextBillingAt, tz)], ["Prix", `${formatMoney(s.price.amountCents, cur)} ${formatIntervalFr(s.interval)}`]] : [],
          cta: manage,
        }),
      }
    case "term_ending_notice":
      return {
        subject: "Votre formule arrive à son terme",
        html: layout({
          ...base,
          title: "Votre formule arrive à son terme",
          intro: [`Date de fin : ${date(pl.endsAt, tz)}.`, "Aucun renouvellement automatique n'est prévu.", ...(s?.paymentMode === "prepaid" ? ["Aucun nouveau prélèvement automatique ne sera effectué."] : [])],
          cta: manage,
        }),
      }
    case "renewal_opt_out_confirmed":
      return {
        subject: "Votre non-renouvellement est enregistré",
        html: layout({
          ...base,
          title: "Votre non-renouvellement est enregistré.",
          intro: [
            `Votre formule restera active jusqu'au ${date(pl.endsAt, tz)}.`,
            "Après cette date, elle ne sera pas renouvelée.",
            ...(pl.lastPaymentAt ? [`Une dernière échéance de ${money(pl.lastPaymentCents, cur)} reste prévue le ${date(pl.lastPaymentAt, tz)}.`] : []),
          ],
          cta: manage,
        }),
      }
    case "renewal_opt_out_pro":
      return { subject: "Non-renouvellement demandé", html: layout({ ...base, title: "Un client ne renouvellera pas sa formule", rows: [["Formule", s?.planName ?? "—"], ["Fin", date(pl.endsAt, tz)]] }) }
    case "renewal_opt_out_revoked":
      return { subject: "Votre abonnement continue", html: layout({ ...base, title: "Votre abonnement continue", intro: [`Votre abonnement continuera après le ${date(pl.termEndsAt, tz)}.`], cta: manage }) }
    case "cancellation_scheduled":
      return {
        subject: "Votre abonnement prendra fin",
        html: layout({
          ...base,
          title: `Votre abonnement prendra fin le ${date(pl.cancelAt, tz)}.`,
          intro: [
            `Vos prestations restent disponibles jusqu'au ${date(pl.cancelAt, tz)}.`,
            ...(pl.lastPaymentAt ? [`Une dernière échéance de ${money(pl.lastPaymentCents, cur)} reste prévue le ${date(pl.lastPaymentAt, tz)}.`] : ["Aucun prélèvement n'est prévu après cette date."]),
          ],
          rows: s ? [["Formule", s.planName], ["Prix", `${formatMoney(s.price.amountCents, cur)} ${formatIntervalFr(s.interval)}`]] : [],
          cta: manage,
        }),
      }
    case "subscription_ended":
      return { subject: "Votre abonnement est terminé", html: layout({ ...base, title: "Votre abonnement est terminé", rows: [["Formule", s?.planName ?? "—"], ["Date de fin", date(pl.endedAt, tz)]], after: ["Aucun prélèvement ne sera plus effectué pour cette formule."] }) }
    case "early_cancellation_requested_pro":
      return { subject: "Demande de fin anticipée", html: layout({ ...base, title: "Demande de fin anticipée", intro: ["Un client demande à arrêter sa formule avant la date prévue."], rows: [["Client", ctx.customerName ?? "—"], ["Véhicule", ctx.vehicleLabel ?? "—"], ["Formule", s?.planName ?? "—"], ["Date de fin contractuelle", formatDateFr(ctx.contractualEndAt, tz)], ["Date de la demande", formatDateFr(ctx.requestedAt, tz)], ...(ctx.cancellationMessage ? [["Message du client", ctx.cancellationMessage] as Row] : [])], after: ["Aucune modification automatique n'a été effectuée."], cta: ctx.ctaUrl ? { label: "Traiter la demande", url: ctx.ctaUrl } : null }) }
    case "early_cancellation_decided": {
      const msg = typeof pl.customerMessage === "string" && pl.customerMessage.trim() ? [pl.customerMessage.trim()] : []
      if (pl.decision === "approved") {
        return {
          subject: "Votre demande d'arrêt anticipé a été acceptée",
          html: layout({
            ...base,
            title: "Votre demande d'arrêt anticipé a été acceptée",
            intro: [
              ...(pl.cancelAt ? [`Votre abonnement prendra fin le ${date(pl.cancelAt, tz)}. Vos prestations restent disponibles jusqu'à cette date.`] : []),
              ...(pl.lastPaymentAt ? [`Une dernière échéance de ${money(pl.lastPaymentCents, cur)} reste prévue le ${date(pl.lastPaymentAt, tz)}.`] : ["Aucun prélèvement n'est prévu après cette date."]),
              ...msg,
            ],
            rows: s ? [["Formule", s.planName]] : [],
            after: ["Cette décision n'entraîne aucun remboursement automatique."],
            cta: manage,
          }),
        }
      }
      return { subject: "Votre demande d'arrêt anticipé", html: layout({ ...base, title: "Votre demande d'arrêt anticipé n'a pas été retenue", intro: [...msg, "Votre abonnement continue aux conditions prévues."], cta: manage }) }
    }
    case "refund_succeeded":
      return {
        subject: "Remboursement effectué",
        html: layout({
          ...base,
          title: "Remboursement effectué",
          rows: [["Montant remboursé", money(pl.amountCents, cur)], ["Date", date(pl.refundedAt, tz)], ["Formule", s?.planName ?? "—"], ["Type", pl.full ? "Remboursement total" : "Remboursement partiel"]],
          after: ["Ce remboursement ne modifie pas à lui seul votre formule."],
        }),
      }
  }
}
