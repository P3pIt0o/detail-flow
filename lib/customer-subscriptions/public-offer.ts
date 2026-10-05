import "server-only"
import { and, asc, eq, inArray } from "drizzle-orm"
import { companies, maintenancePlans, services } from "@/lib/db/schema"
import { getCustomerSubscriptionCapacity, type Executor } from "./engine"
import { computePrepaidTotalCents } from "./contract"
import { formatCommitmentFr, formatIntervalFr, formatMoney } from "./contract-summary"
import { validatePlanConfig, type ValidatedPlanConfig } from "./plan-validation"
import { isPlanPubliclyAccessible, parsePublicMode, type PlanPublicAccess } from "./public-mode"

/**
 * Vue PUBLIQUE des formules d'un tenant. Fail-closed : toute condition non
 * remplie (mode désactivé, tenant suspendu/archivé, feature coupée, capacité
 * atteinte, Stripe non prêt en mode direct, formule invalide) → aucune offre.
 *
 * N'expose JAMAIS : commission, compte Stripe, IDs internes autres que planId,
 * nombre d'abonnés, statuts internes.
 */
export type PublicPlanView = {
  id: number
  name: string
  description: string | null
  priceLabel: string
  intervalLabel: string
  includedLabel: string
  commitmentLabel: string
  renewalLabel: string
  stopRuleLabel: string
  noticeLabel: string | null
  initialCleaningLabel: string | null
  paymentOptions: { mode: "recurring" | "prepaid"; label: string }[]
}

export type PublicOffer = {
  mode: "request" | "direct"
  plans: PublicPlanView[]
}

function renewalLabel(mode: ValidatedPlanConfig["renewalMode"]): string {
  if (mode === "same_term") return "Renouvellement automatique pour une durée identique"
  if (mode === "none") return "Pas de renouvellement : la formule s'arrête à la fin de l'engagement"
  return "Se poursuit sans engagement après la période initiale"
}

function stopRuleLabel(plan: ValidatedPlanConfig): string {
  if (!plan.allowRecurringPayment && plan.allowPrepaidPayment) return "Arrêt à la fin de la période prépayée"
  if (plan.commitmentUnit === "none") return "Résiliable : arrêt à la prochaine échéance"
  return "Arrêt possible à la fin de l'engagement"
}

export function toPublicPlanView(
  id: number,
  plan: ValidatedPlanConfig,
  names: { included: string | null; initial: string | null },
): PublicPlanView {
  const interval = { unit: plan.billingIntervalUnit, count: plan.billingIntervalCount }
  const intervalFr = formatIntervalFr(interval)
  const price = formatMoney(plan.priceCents, plan.currency)
  const options: PublicPlanView["paymentOptions"] = []
  if (plan.allowRecurringPayment) options.push({ mode: "recurring", label: `Paiement ${intervalFr} — ${price}` })
  if (plan.allowPrepaidPayment && plan.prepaidBillingCycles) {
    const total = formatMoney(computePrepaidTotalCents(plan.priceCents, plan.prepaidBillingCycles), plan.currency)
    options.push({ mode: "prepaid", label: `Paiement unique de ${total} pour ${plan.prepaidBillingCycles} périodes` })
  }
  const uses = plan.includedUsesPerCycle
  return {
    id,
    name: plan.name,
    description: plan.description,
    priceLabel: price,
    intervalLabel: intervalFr,
    includedLabel: `${uses > 1 ? `${uses} × ` : ""}${names.included ?? "Prestation incluse"} par période`,
    commitmentLabel: formatCommitmentFr(plan.commitmentUnit, plan.commitmentCount),
    renewalLabel: renewalLabel(plan.renewalMode),
    stopRuleLabel: stopRuleLabel(plan),
    noticeLabel: plan.renewalNoticeDays ? `Rappel ${plan.renewalNoticeDays} jours avant le renouvellement` : null,
    initialCleaningLabel: plan.initialCleaningRequired
      ? `Nettoyage initial requis avant l'activation${names.initial ? ` (${names.initial})` : ""}`
      : null,
    paymentOptions: options,
  }
}

/** Disponibilité tenant (mode + statut + licence/capacité + Stripe si direct). */
async function resolveOfferMode(db: Executor, companyId: number): Promise<"request" | "direct" | null> {
  const [company] = await db
    .select({
      status: companies.status,
      mode: companies.customerSubscriptionPublicMode,
      stripeAccountId: companies.stripeAccountId,
      chargesEnabled: companies.stripeChargesEnabled,
      paymentsEnabled: companies.paymentsEnabled,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1)
  if (!company || company.status === "ARCHIVED" || company.status === "SUSPENDED") return null
  const mode = parsePublicMode(company.mode)
  if (mode === "disabled") return null
  const capacity = await getCustomerSubscriptionCapacity(db, companyId)
  if (!capacity.creationAllowed) return null
  if (mode === "direct" && (!company.stripeAccountId || !company.chargesEnabled || !company.paymentsEnabled)) return null
  return mode
}

async function serviceNames(db: Executor, companyId: number, ids: number[]): Promise<Map<number, string>> {
  if (!ids.length) return new Map()
  const rows = await db
    .select({ id: services.id, name: services.name })
    .from(services)
    .where(and(eq(services.companyId, companyId), inArray(services.id, ids)))
  return new Map(rows.map((r) => [r.id, r.name]))
}

async function buildViews(
  db: Executor,
  companyId: number,
  rows: (typeof maintenancePlans.$inferSelect)[],
  mode: "request" | "direct",
  access: PlanPublicAccess,
): Promise<PublicPlanView[]> {
  const valid: { id: number; plan: ValidatedPlanConfig }[] = []
  for (const row of rows) {
    if (!isPlanPubliclyAccessible(mode, row, access)) continue
    const r = validatePlanConfig(row)
    if (!r.ok || r.value.includedServiceId == null) continue
    valid.push({ id: row.id, plan: r.value })
  }
  const ids = new Set<number>()
  for (const { plan } of valid) {
    if (plan.includedServiceId != null) ids.add(plan.includedServiceId)
    if (plan.initialServiceId != null) ids.add(plan.initialServiceId)
  }
  const names = await serviceNames(db, companyId, [...ids])
  return valid
    .filter(({ plan }) => names.has(plan.includedServiceId as number))
    .map(({ id, plan }) =>
      toPublicPlanView(id, plan, {
        included: names.get(plan.includedServiceId as number) ?? null,
        initial: plan.initialServiceId != null ? names.get(plan.initialServiceId) ?? null : null,
      }),
    )
}

/** Liste publique (formules `public` uniquement). null = section masquée. */
export async function loadPublicOffer(db: Executor, companyId: number | null | undefined): Promise<PublicOffer | null> {
  if (!companyId) return null
  try {
    const mode = await resolveOfferMode(db, companyId)
    if (!mode) return null
    const rows = await db
      .select()
      .from(maintenancePlans)
      .where(and(eq(maintenancePlans.companyId, companyId), eq(maintenancePlans.status, "active"), eq(maintenancePlans.visibility, "public")))
      .orderBy(asc(maintenancePlans.priceCents), asc(maintenancePlans.id))
    const plans = await buildViews(db, companyId, rows, mode, "listing")
    return plans.length ? { mode, plans } : null
  } catch {
    // Table/colonne absente avant migration, ou erreur DB : section masquée.
    return null
  }
}

/** Formule par lien direct (`public` ou `unlisted`). null = 404 générique. */
export async function loadPublicPlan(
  db: Executor,
  companyId: number | null | undefined,
  planId: unknown,
): Promise<{ mode: "request" | "direct"; plan: PublicPlanView } | null> {
  const id = typeof planId === "string" && /^\d{1,9}$/.test(planId) ? Number(planId) : typeof planId === "number" ? planId : NaN
  if (!companyId || !Number.isInteger(id) || id <= 0) return null
  try {
    const mode = await resolveOfferMode(db, companyId)
    if (!mode) return null
    const rows = await db
      .select()
      .from(maintenancePlans)
      .where(and(eq(maintenancePlans.id, id), eq(maintenancePlans.companyId, companyId)))
      .limit(1)
    const [plan] = await buildViews(db, companyId, rows, mode, "direct_link")
    return plan ? { mode, plan } : null
  } catch {
    return null
  }
}
