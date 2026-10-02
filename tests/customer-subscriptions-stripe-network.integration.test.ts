/**
 * Test d'intégration OPTIONNEL — vrai SDK Stripe, compte Connect TEST.
 *
 * Variables dédiées OBLIGATOIRES (aucun fallback STRIPE_SECRET_KEY / DATABASE_URL / POSTGRES_URL) :
 *   CUSTOMER_SUBSCRIPTIONS_STRIPE_TEST_SECRET_KEY   (sk_test_… uniquement)
 *   CUSTOMER_SUBSCRIPTIONS_STRIPE_TEST_ACCOUNT_ID   (acct_… compte connecté TEST)
 *   CUSTOMER_SUBSCRIPTIONS_TEST_DATABASE_URL        (branche jetable ; ni main/prod/production)
 * Variable absente → SKIP. Variable présente mais dangereuse → ÉCHEC.
 *
 * Aucune écriture DB. Côté Stripe TEST : crée des Checkout Sessions (expirées en fin
 * de test), un Customer, un Product et une Subscription payée par pm_card_visa
 * (annulée en fin de test) afin d'observer la forme RÉELLE d'une Invoice.
 *
 * Webhook Connect TEST (endpoint unique /api/payments/webhook, event.account obligatoire
 * pour customer_subscription) — événements à écouter au minimum :
 *   checkout.session.completed, checkout.session.async_payment_succeeded,
 *   checkout.session.expired, invoice.created, invoice.paid, invoice.payment_failed,
 *   customer.subscription.updated, customer.subscription.deleted
 */
import { afterAll, describe, expect, it } from "vitest"
import Stripe from "stripe"
import {
  buildCheckoutSessionParams,
  invoiceChargedFeeCents,
  invoiceMetadata,
  invoicePaymentIntentId,
  invoicePeriod,
  invoiceSubscriptionId,
  type InvoiceLike,
} from "@/lib/customer-subscriptions/stripe-mapping"
import { computePlatformFeeAmountCents } from "@/lib/customer-subscriptions/contract"

export const CUSTOMER_SUBSCRIPTIONS_WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.expired",
  "invoice.created",
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
] as const

const KEY = process.env.CUSTOMER_SUBSCRIPTIONS_STRIPE_TEST_SECRET_KEY
const ACCOUNT = process.env.CUSTOMER_SUBSCRIPTIONS_STRIPE_TEST_ACCOUNT_ID
const DB_URL = process.env.CUSTOMER_SUBSCRIPTIONS_TEST_DATABASE_URL
const RETURN = process.env.CUSTOMER_SUBSCRIPTIONS_STRIPE_TEST_RETURN_URL ?? "https://example.com/abonnement/retour?session_id={CHECKOUT_SESSION_ID}"

export function assertSafeStripeNetworkConfig(cfg: { key?: string; account?: string; dbUrl?: string }) {
  if (!cfg.key || !cfg.account || !cfg.dbUrl) throw new Error("Variables Stripe TEST dédiées absentes.")
  if (cfg.key.startsWith("sk_live_") || cfg.key.startsWith("rk_live_")) throw new Error("Clé live refusée.")
  if (!cfg.key.startsWith("sk_test_")) throw new Error("Clé sk_test_ exigée.")
  if (!cfg.account.startsWith("acct_")) throw new Error("Compte Connect acct_ exigé.")
  if (/(^|[^a-z])(main|prod|production)([^a-z]|$)/i.test(cfg.dbUrl)) throw new Error("DB refusée : évoque main/prod/production.")
  for (const name of ["DATABASE_URL", "NEON_DATABASE_URL", "NEON_DATABASE_URL_UNPOOLED", "POSTGRES_URL", "NEON_POSTGRES_URL"]) {
    if (process.env[name] && process.env[name] === cfg.dbUrl) throw new Error(`DB refusée : identique à ${name}.`)
  }
  return { key: cfg.key, account: cfg.account }
}

const configured = Boolean(KEY && ACCOUNT && DB_URL)

describe("garde-fous config réseau (toujours exécuté)", () => {
  it("refuse live, exige sk_test_, refuse DB main/prod", () => {
    const ok = { key: "sk_test_x", account: "acct_x", dbUrl: "postgres://u@ep-preview-1.neon.tech/db" }
    expect(assertSafeStripeNetworkConfig(ok).key).toBe("sk_test_x")
    expect(() => assertSafeStripeNetworkConfig({ ...ok, key: "sk_live_x" })).toThrow(/live/)
    expect(() => assertSafeStripeNetworkConfig({ ...ok, key: "pk_test_x" })).toThrow(/sk_test_/)
    for (const bad of ["postgres://u@h/main", "postgres://u@prod.h/db", "postgres://u@h/db?env=production"]) {
      expect(() => assertSafeStripeNetworkConfig({ ...ok, dbUrl: bad })).toThrow(/main\/prod/)
    }
    expect(() => assertSafeStripeNetworkConfig({ ...ok, key: undefined })).toThrow(/absentes/)
  })

  it("événements webhook documentés", () => {
    expect(CUSTOMER_SUBSCRIPTIONS_WEBHOOK_EVENTS).toHaveLength(8)
  })
})

describe.skipIf(!configured)("Stripe Connect TEST — réseau réel", () => {
  const { key, account } = configured ? assertSafeStripeNetworkConfig({ key: KEY, account: ACCOUNT, dbUrl: DB_URL }) : { key: "", account: "" }
  // Le callback d'un describe ignoré s'exécute quand même : aucun client sans clé.
  const stripe = (configured ? new Stripe(key) : null) as Stripe
  const opts = { stripeAccount: account }
  const run = `df_net_${Date.now().toString(36)}`
  const sessionsToExpire: string[] = []
  const subscriptionsToCancel: string[] = []

  const contract = (over: Record<string, unknown> = {}) =>
    ({
      id: 999_001,
      companyId: 999_001,
      status: "pending_payment",
      paymentMode: "recurring",
      currency: "EUR",
      priceCentsSnapshot: 8900,
      billingIntervalUnitSnapshot: "month",
      billingIntervalCountSnapshot: 1,
      planNameSnapshot: "Entretien Premium (test réseau)",
      customerEmail: `${run}@example.com`,
      externalCustomerId: null,
      prepaidBillingCyclesSnapshot: null,
      initialCleaningRequiredSnapshot: false,
      initialServiceNameSnapshot: null,
      initialServicePriceCentsSnapshot: null,
      ...over,
    }) as any // eslint-disable-line @typescript-eslint/no-explicit-any

  async function create(params: Record<string, unknown>, label: string) {
    const s = await stripe.checkout.sessions.create(params as Stripe.Checkout.SessionCreateParams, { ...opts, idempotencyKey: `${run}:${label}` })
    sessionsToExpire.push(s.id)
    return s
  }

  afterAll(async () => {
    for (const id of sessionsToExpire) await stripe.checkout.sessions.expire(id, {}, opts).catch(() => undefined)
    for (const id of subscriptionsToCancel) await stripe.subscriptions.cancel(id, {}, opts).catch(() => undefined)
  })

  it.each([
    ["month", 1, 700, 7],
    ["week", 4, 700, 7],
    ["month", 1, 300, 3],
    ["week", 4, 0, null],
  ] as const)("recurring %s × %d, %d bps : accepté par Stripe sur le compte connecté", async (unit, count, bps, percent) => {
    const { params } = buildCheckoutSessionParams(contract({ billingIntervalUnitSnapshot: unit, billingIntervalCountSnapshot: count }), "recurring", bps, RETURN)
    if (percent == null) expect(params.subscription_data).not.toHaveProperty("application_fee_percent")
    else expect(params.subscription_data.application_fee_percent).toBe(percent)
    const s = await create(params, `rec:${unit}:${count}:${bps}`)
    const got = await stripe.checkout.sessions.retrieve(s.id, { expand: ["line_items.data.price"] }, opts)
    expect(got.mode).toBe("subscription")
    expect(got.metadata?.detailflowModule).toBe("customer_subscription")
    expect(got.line_items?.data[0].price?.recurring).toMatchObject({ interval: unit, interval_count: count })
    expect(got.line_items?.data[0].price?.unit_amount).toBe(8900)
  })

  it("prepaid : mode payment, application_fee_amount accepté", async () => {
    const built = buildCheckoutSessionParams(contract({ paymentMode: "prepaid", prepaidBillingCyclesSnapshot: 6 }), "prepaid", 700, RETURN)
    expect(built.params.payment_intent_data.application_fee_amount).toBe(built.platformFeeAmountCents)
    const s = await create(built.params, "prepaid")
    const got = await stripe.checkout.sessions.retrieve(s.id, {}, opts)
    expect(got.mode).toBe("payment")
    expect(got.amount_total).toBe(8900 * 6)
  })

  it("initial_cleaning : mode payment, AUCUN application_fee_amount (tenant PRO)", async () => {
    const built = buildCheckoutSessionParams(
      contract({ status: "pending_initial_cleaning", initialCleaningRequiredSnapshot: true, initialServiceNameSnapshot: "Nettoyage initial", initialServicePriceCentsSnapshot: 12000 }),
      "initial_cleaning",
      300,
      RETURN,
    )
    expect(built.platformFeeAmountCents).toBe(0)
    expect(built.params.payment_intent_data).not.toHaveProperty("application_fee_amount")
    const s = await create(built.params, "initial")
    const got = await stripe.checkout.sessions.retrieve(s.id, {}, opts)
    expect(got.amount_total).toBe(12000)
    expect(got.metadata?.detailflowPlatformFeeBps).toBe("0")
  })

  it("forme RÉELLE d'une Invoice payée : helpers de mapping compatibles", async () => {
    const customer = await stripe.customers.create({ email: `${run}@example.com`, payment_method: "pm_card_visa", invoice_settings: { default_payment_method: "pm_card_visa" } }, opts)
    const product = await stripe.products.create({ name: `${run} entretien` }, opts)
    const meta = { detailflowModule: "customer_subscription", maintenanceSubscriptionId: "999001", companyId: "999001" }
    const sub = await stripe.subscriptions.create(
      {
        customer: customer.id,
        items: [{ price_data: { currency: "eur", unit_amount: 8900, product: product.id, recurring: { interval: "week", interval_count: 4 } } }],
        application_fee_percent: 7,
        metadata: meta,
        expand: ["latest_invoice.payments"],
      },
      opts,
    )
    subscriptionsToCancel.push(sub.id)
    const inv = sub.latest_invoice as Stripe.Invoice
    const full = await stripe.invoices.retrieve(inv.id!, { expand: ["payments"] }, opts)
    const like = full as unknown as InvoiceLike

    expect(full.status).toBe("paid")
    expect(invoiceSubscriptionId(like)).toBe(sub.id)
    expect(invoiceMetadata(like)).toMatchObject(meta)
    expect(invoicePaymentIntentId(like)).toMatch(/^pi_/)
    const period = invoicePeriod(like)
    expect(period).not.toBeNull()
    // Forme observée consignée (clés seulement, aucune donnée client).
    console.log("[customer-subscriptions:network] invoice keys:", Object.keys(full).sort().join(","))
    expect(invoiceChargedFeeCents(like, full.amount_paid, 700)).toBe(computePlatformFeeAmountCents(8900, 700))
    const subNow = await stripe.subscriptions.retrieve(sub.id, {}, opts)
    expect(subNow.application_fee_percent).toBe(7)
  })
})
