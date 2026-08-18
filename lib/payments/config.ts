import "server-only"
import { db } from "@/lib/db"
import { platformSettings, companies, payments } from "@/lib/db/schema"
import { eq, sql, desc } from "drizzle-orm"

/**
 * Commission plateforme DetailFlow.
 *
 * Ordre de résolution (extensible) :
 *   1. override tenant (companies.platformFeeBps)
 *   2. [futur] commission liée au plan (FREE/PRO/FOUNDER/BETA)
 *   3. commission globale (platform_settings.defaultPlatformFeeBps)
 *
 * Exprimée en points de base (bps) : 300 = 3,00 %.
 */

const DEFAULT_FALLBACK_BPS = 300

/** Lit la commission globale (crée la ligne id=1 si absente). */
export async function getDefaultPlatformFeeBps(): Promise<number> {
  const [row] = await db
    .select({ bps: platformSettings.defaultPlatformFeeBps })
    .from(platformSettings)
    .where(eq(platformSettings.id, 1))
    .limit(1)
  return row?.bps ?? DEFAULT_FALLBACK_BPS
}

/**
 * Résout le taux applicable à un tenant. Le taux du plan sera inséré ici plus
 * tard entre l'override et la commission globale, sans changer les appelants.
 */
export function resolvePlatformFeeBps(
  company: { platformFeeBps: number | null },
  defaultBps: number,
): number {
  if (company.platformFeeBps != null) return company.platformFeeBps
  // TODO(plans) : commission liée au plan si défini.
  return defaultBps
}

export type TenantPaymentConfig = {
  connected: boolean
  chargesEnabled: boolean
  detailsSubmitted: boolean
  paymentsEnabled: boolean
  paymentMode: "none" | "deposit" | "full"
  feeBps: number
  /** Commission en pourcentage lisible (ex. "3" ou "2.5"). */
  feePercent: string
}

/**
 * Charge la config paiement d'un tenant + résout sa commission applicable.
 * Utilisé par la page Paramètres → Paiements. Scopé par companyId (isolation).
 */
export async function getTenantPaymentConfig(companyId: number): Promise<TenantPaymentConfig> {
  const [defaultBps, [row]] = await Promise.all([
    getDefaultPlatformFeeBps(),
    db
      .select({
        stripeAccountId: companies.stripeAccountId,
        stripeChargesEnabled: companies.stripeChargesEnabled,
        stripeDetailsSubmitted: companies.stripeDetailsSubmitted,
        paymentsEnabled: companies.paymentsEnabled,
        paymentMode: companies.paymentMode,
        platformFeeBps: companies.platformFeeBps,
      })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1),
  ])

  const feeBps = resolvePlatformFeeBps({ platformFeeBps: row?.platformFeeBps ?? null }, defaultBps)
  const mode = (row?.paymentMode as "none" | "deposit" | "full") ?? "none"
  return {
    connected: Boolean(row?.stripeAccountId),
    chargesEnabled: Boolean(row?.stripeChargesEnabled),
    detailsSubmitted: Boolean(row?.stripeDetailsSubmitted),
    paymentsEnabled: Boolean(row?.paymentsEnabled),
    paymentMode: ["none", "deposit", "full"].includes(mode) ? mode : "none",
    feeBps,
    feePercent: formatBpsPercent(feeBps),
  }
}

/** Convertit des bps en pourcentage lisible sans zéros superflus (300 → "3", 250 → "2.5"). */
export function formatBpsPercent(bps: number): string {
  return (bps / 100).toFixed(2).replace(/\.?0+$/, "")
}

export type PlatformPaymentsRow = {
  companyId: number
  companyName: string
  slug: string
  connected: boolean
  chargesEnabled: boolean
  paymentsEnabled: boolean
  feeBps: number
  paidCount: number
  grossCents: number
  commissionCents: number
}

export type PlatformPaymentsOverview = {
  defaultFeeBps: number
  totals: { grossCents: number; commissionCents: number; paidCount: number }
  rows: PlatformPaymentsRow[]
}

/**
 * Vue d'ensemble des paiements pour le Super Admin : agrège les paiements
 * ENCAISSÉS (status = 'paid') par entreprise + totaux plateforme. Vue globale
 * volontaire (super-admin) — ce n'est PAS une vue tenant.
 */
export async function getPlatformPaymentsOverview(): Promise<PlatformPaymentsOverview> {
  const defaultFeeBps = await getDefaultPlatformFeeBps()

  const rows = await db
    .select({
      companyId: companies.id,
      companyName: companies.name,
      slug: companies.slug,
      stripeAccountId: companies.stripeAccountId,
      stripeChargesEnabled: companies.stripeChargesEnabled,
      paymentsEnabled: companies.paymentsEnabled,
      platformFeeBps: companies.platformFeeBps,
      paidCount: sql<number>`count(${payments.id}) filter (where ${payments.status} = 'paid')`,
      grossCents: sql<number>`coalesce(sum(${payments.grossAmountCents}) filter (where ${payments.status} = 'paid'), 0)`,
      commissionCents: sql<number>`coalesce(sum(${payments.platformFeeAmountCents}) filter (where ${payments.status} = 'paid'), 0)`,
    })
    .from(companies)
    .leftJoin(payments, eq(payments.companyId, companies.id))
    .groupBy(
      companies.id,
      companies.name,
      companies.slug,
      companies.stripeAccountId,
      companies.stripeChargesEnabled,
      companies.paymentsEnabled,
      companies.platformFeeBps,
    )
    .orderBy(desc(sql`coalesce(sum(${payments.platformFeeAmountCents}) filter (where ${payments.status} = 'paid'), 0)`))

  const mapped: PlatformPaymentsRow[] = rows.map((r) => ({
    companyId: r.companyId,
    companyName: r.companyName,
    slug: r.slug,
    connected: Boolean(r.stripeAccountId),
    chargesEnabled: Boolean(r.stripeChargesEnabled),
    paymentsEnabled: Boolean(r.paymentsEnabled),
    feeBps: resolvePlatformFeeBps({ platformFeeBps: r.platformFeeBps ?? null }, defaultFeeBps),
    paidCount: Number(r.paidCount ?? 0),
    grossCents: Number(r.grossCents ?? 0),
    commissionCents: Number(r.commissionCents ?? 0),
  }))

  const totals = mapped.reduce(
    (acc, r) => ({
      grossCents: acc.grossCents + r.grossCents,
      commissionCents: acc.commissionCents + r.commissionCents,
      paidCount: acc.paidCount + r.paidCount,
    }),
    { grossCents: 0, commissionCents: 0, paidCount: 0 },
  )

  return { defaultFeeBps, totals, rows: mapped }
}

/** Met à jour la commission globale (Super Admin uniquement). */
export async function setDefaultPlatformFeeBps(bps: number): Promise<void> {
  const clamped = Math.max(0, Math.min(2000, Math.round(bps))) // borne 0–20 %
  await db
    .insert(platformSettings)
    .values({ id: 1, defaultPlatformFeeBps: clamped, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: platformSettings.id,
      set: { defaultPlatformFeeBps: clamped, updatedAt: new Date() },
    })
}
