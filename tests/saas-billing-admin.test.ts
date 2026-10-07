import { readFileSync } from "node:fs"
import { join } from "node:path"
import type Stripe from "stripe"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  buildSaasAdminUrls,
  describeSaasStatusBadges,
  openSaasAdminPortal,
  parseSaasAdminCheckoutPlan,
  shouldPollSubscriptionReturn,
  startSaasAdminCheckout,
  RETURN_POLL_INTERVAL_MS,
  RETURN_POLL_MAX_ATTEMPTS,
} from "@/lib/billing/saas-admin"
import type { SubscriptionCheckoutStripeClient } from "@/lib/billing/subscription-checkout"
import {
  describeSubscriptionReturnState,
  type CompanyBillingState,
  type SubscriptionPlan,
  type SubscriptionStore,
} from "@/lib/billing/subscription-core"
import type { SubscriptionPortalDeps } from "@/lib/billing/subscription-portal"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const PRICE_IDS: Record<SubscriptionPlan, string> = {
  PRO: "price_pro_test",
  BUSINESS: "price_business_test",
  ENTERPRISE: "price_enterprise_test",
}
const AMOUNTS: Record<SubscriptionPlan, number> = { PRO: 1990, BUSINESS: 3490, ENTERPRISE: 5990 }
const LOOKUP: Record<SubscriptionPlan, string> = {
  PRO: "detailflow_independant_monthly",
  BUSINESS: "detailflow_performance_monthly",
  ENTERPRISE: "detailflow_equipe_monthly",
}
const ENV = {
  STRIPE_PRICE_INDEPENDANT_MONTHLY: PRICE_IDS.PRO,
  STRIPE_PRICE_PERFORMANCE_MONTHLY: PRICE_IDS.BUSINESS,
  STRIPE_PRICE_EQUIPE_MONTHLY: PRICE_IDS.ENTERPRISE,
}

function priceFor(plan: SubscriptionPlan): Stripe.Price {
  const meta = { app: "detailflow", billing_type: "subscription", license_plan: plan }
  return {
    id: PRICE_IDS[plan],
    object: "price",
    active: true,
    type: "recurring",
    currency: "eur",
    unit_amount: AMOUNTS[plan],
    lookup_key: LOOKUP[plan],
    recurring: { interval: "month", interval_count: 1 },
    metadata: meta,
    product: { id: `prod_${plan}`, object: "product", active: true, metadata: meta },
  } as unknown as Stripe.Price
}

const A = { id: 11, slug: "autocare" }
const B = { id: 22, slug: "detailflow" }

function company(id: number, overrides: Partial<CompanyBillingState> = {}): CompanyBillingState {
  return {
    id,
    billingMode: "free",
    licensePlan: "FREE",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    subscriptionStatus: null,
    subscriptionPriceId: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    continuousSubscriptionStartedAt: null,
    subscriptionCanceledAt: null,
    subscriptionStartedAt: null,
    ...overrides,
  }
}

function memoryStore(initial: CompanyBillingState[]) {
  const companies = new Map(initial.map((c) => [c.id, { ...c }]))
  const reads: number[] = []
  const store = {
    async getCompany(id: number) {
      reads.push(id)
      const c = companies.get(id)
      return c ? { ...c } : null
    },
    async findCompanyBySubscriptionId() {
      return null
    },
    async hasLifetimeLicense() {
      return false
    },
    async setStripeCustomerIdIfNull(id: number, customerId: string) {
      const c = companies.get(id)
      if (!c) return null
      c.stripeCustomerId ??= customerId
      return c.stripeCustomerId
    },
  } as unknown as SubscriptionStore
  return { store, reads, companies }
}

function checkoutStripe(price: (id: string) => Stripe.Price, customerCompanyId = String(A.id)) {
  const created: Stripe.Checkout.SessionCreateParams[] = []
  const raw = {
    prices: { retrieve: vi.fn(async (id: string) => price(id)) },
    customers: {
      create: vi.fn(async () => ({ id: `cus_${customerCompanyId}` })),
      retrieve: vi.fn(async (id: string) => ({ id, metadata: { company_id: customerCompanyId } })),
    },
    checkout: {
      sessions: {
        list: vi.fn(async () => ({ data: [] })),
        expire: vi.fn(),
        create: vi.fn(async (params: Stripe.Checkout.SessionCreateParams) => {
          created.push(params)
          return { id: "cs_1", url: "https://checkout.stripe.test/cs_1" }
        }),
      },
    },
  }
  return { stripe: raw as unknown as SubscriptionCheckoutStripeClient, raw, created }
}

const priceById = (id: string) => priceFor((Object.keys(PRICE_IDS) as SubscriptionPlan[]).find((p) => PRICE_IDS[p] === id)!)
const ORIGIN = "https://preview.test"
const owner = (tenant = A) => ({ role: "OWNER", tenant })

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "log").mockImplementation(() => {})
})

describe("Checkout SaaS admin", () => {
  it.each(["PRO"] as const)("1-2. OWNER tenant A + %s => Checkout du tenant A", async (plan) => {
    const { store } = memoryStore([company(A.id), company(B.id)])
    const { stripe, created, raw } = checkoutStripe(priceById)
    const result = await startSaasAdminCheckout({ member: owner(), plan, origin: ORIGIN }, { stripe, store, env: ENV })
    expect(result.url).toContain("checkout.stripe.test")
    expect(created).toHaveLength(1)
    expect(created[0].line_items).toEqual([{ price: PRICE_IDS[plan], quantity: 1 }])
    expect(created[0].client_reference_id ?? created[0].metadata?.company_id).toBe(String(A.id))
    expect(created[0].success_url).toBe(`${ORIGIN}/admin/abonnement/retour?tenant=autocare`)
    expect(created[0].cancel_url).toBe(`${ORIGIN}/admin/abonnement?annule=1&tenant=autocare`)
    expect(raw.prices.retrieve).toHaveBeenCalledWith(PRICE_IDS[plan], expect.anything())
  })

  it.each(["FREE", "BUSINESS", "ENTERPRISE", "FOUNDER", "GOLD", "pro", "", null, undefined, 3, { plan: "PRO" }])(
    "3-5. formule %s refusée AVANT tout appel Stripe",
    async (plan) => {
      const { store, reads } = memoryStore([company(A.id)])
      const { stripe, raw } = checkoutStripe(priceById)
      await expect(
        startSaasAdminCheckout({ member: owner(), plan, origin: ORIGIN }, { stripe, store, env: ENV }),
      ).rejects.toMatchObject({ code: "PLAN_NOT_SUBSCRIBABLE" })
      expect(raw.prices.retrieve).not.toHaveBeenCalled()
      expect(raw.customers.create).not.toHaveBeenCalled()
      expect(raw.checkout.sessions.create).not.toHaveBeenCalled()
      expect(reads).toHaveLength(0)
    },
  )

  it("parseSaasAdminCheckoutPlan n'accepte que PRO (phase de lancement)", () => {
    expect(parseSaasAdminCheckoutPlan("PRO")).toBe("PRO")
    expect(() => parseSaasAdminCheckoutPlan("BUSINESS")).toThrow()
    expect(() => parseSaasAdminCheckoutPlan("ENTERPRISE")).toThrow()
    expect(() => parseSaasAdminCheckoutPlan("pro")).toThrow()
  })

  it.each(["ADMIN", "EMPLOYEE", "MEMBER"])("6. rôle %s refusé avant Stripe", async (role) => {
    const { store } = memoryStore([company(A.id)])
    const { stripe, raw } = checkoutStripe(priceById)
    await expect(
      startSaasAdminCheckout({ member: { role, tenant: A }, plan: "PRO", origin: ORIGIN }, { stripe, store, env: ENV }),
    ).rejects.toMatchObject({ code: "NOT_OWNER" })
    expect(raw.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it("7. aucun companyId / priceId / customerId navigateur n'est accepté par l'action", () => {
    const src = read("app/admin/(dashboard)/abonnement/actions.ts")
    expect(src).not.toMatch(/FormData|formData/)
    expect(src).not.toMatch(/companyId|priceId|customerId|stripeCustomerId|licensePlan/)
    expect(src).toMatch(/startSaasCheckoutAction\(plan: string\)/)
    expect(src).toMatch(/requireCompanyMember\(\["OWNER"\]\)/)
    expect(src).not.toMatch(/assertPreviewTestGuards|isLifetimePreviewTestEnabled|detailflow_environment_guard/)
    const core = read("lib/billing/saas-admin.ts")
    expect(core).toMatch(/companyId: input\.member\.tenant\.id/)
  })

  it("8. tenant A ne peut pas utiliser le Customer Stripe du tenant B", async () => {
    const { store } = memoryStore([company(A.id, { stripeCustomerId: "cus_B" })])
    const { stripe, raw } = checkoutStripe(priceById, String(B.id))
    await expect(
      startSaasAdminCheckout({ member: owner(), plan: "PRO", origin: ORIGIN }, { stripe, store, env: ENV }),
    ).rejects.toMatchObject({ code: "CUSTOMER_MISMATCH" })
    expect(raw.checkout.sessions.create).not.toHaveBeenCalled()
  })
})

describe("Customer Portal SaaS admin", () => {
  function portalStripe(customerCompanyId: string) {
    const sessions: Array<{ customer: string; return_url: string }> = []
    const raw = {
      customers: { retrieve: vi.fn(async (id: string) => ({ id, metadata: { company_id: customerCompanyId } })) },
      billingPortal: {
        sessions: {
          create: vi.fn(async (params: { customer: string; return_url: string }) => {
            sessions.push(params)
            return { url: "https://billing.stripe.test/p" }
          }),
        },
      },
    }
    return { stripe: raw as unknown as SubscriptionPortalDeps["stripe"], raw, sessions }
  }

  it("9. le portail conserve le tenant A dans return_url", async () => {
    const { store } = memoryStore([company(A.id, { stripeCustomerId: "cus_A" })])
    const { stripe, sessions } = portalStripe(String(A.id))
    await openSaasAdminPortal({ member: owner(), origin: ORIGIN }, { stripe, store })
    expect(sessions).toHaveLength(1)
    expect(sessions[0].customer).toBe("cus_A")
    expect(sessions[0].return_url).toBe(`${ORIGIN}/admin/abonnement?tenant=autocare`)
  })

  it("8bis. portail refusé si le Customer appartient au tenant B", async () => {
    const { store } = memoryStore([company(A.id, { stripeCustomerId: "cus_B" })])
    const { stripe, raw } = portalStripe(String(B.id))
    await expect(openSaasAdminPortal({ member: owner(), origin: ORIGIN }, { stripe, store })).rejects.toThrow()
    expect(raw.billingPortal.sessions.create).not.toHaveBeenCalled()
  })

  it("portail refusé pour un non-OWNER", async () => {
    const { store } = memoryStore([company(A.id, { stripeCustomerId: "cus_A" })])
    const { stripe, raw } = portalStripe(String(A.id))
    await expect(
      openSaasAdminPortal({ member: { role: "ADMIN", tenant: A }, origin: ORIGIN }, { stripe, store }),
    ).rejects.toMatchObject({ code: "NOT_OWNER" })
    expect(raw.customers.retrieve).not.toHaveBeenCalled()
  })
})

describe("Page retour", () => {
  const returnPage = read("app/admin/(dashboard)/abonnement/retour/page.tsx")
  const poller = read("components/admin/saas-billing/return-poller.tsx")

  it("10. lit uniquement la DB du tenant serveur", () => {
    expect(returnPage).toMatch(/createPgSubscriptionStore\(\)\.getCompany\(member\.tenant\.id\)/)
    expect(returnPage).toMatch(/describeSubscriptionReturnState/)
    expect(returnPage).not.toMatch(/searchParams|session_id|getStripe|stripe\./)
  })

  it("11. état pending => polling", () => {
    const { state } = describeSubscriptionReturnState(company(A.id))
    expect(state).toBe("pending")
    expect(shouldPollSubscriptionReturn(state)).toBe(true)
    expect(RETURN_POLL_INTERVAL_MS).toBe(2500)
    expect(RETURN_POLL_MAX_ATTEMPTS).toBe(12)
    expect(poller).toMatch(/router\.refresh\(\)/)
    expect(poller).toMatch(/clearInterval/)
    expect(poller).not.toMatch(/from ["'][^"']*stripe|getStripe|fetch\(/i)
    expect(returnPage).toMatch(/Confirmation de votre abonnement en cours…/)
  })

  it("12. état active => plus de polling", () => {
    const { state } = describeSubscriptionReturnState(
      company(A.id, { stripeSubscriptionId: "sub_1", subscriptionStatus: "active" }),
    )
    expect(state).toBe("active")
    expect(shouldPollSubscriptionReturn(state)).toBe(false)
  })

  it("13. état trialing => essai affiché", () => {
    const c = company(A.id, { stripeSubscriptionId: "sub_1", subscriptionStatus: "trialing" })
    expect(describeSubscriptionReturnState(c).state).toBe("trial_active")
    expect(shouldPollSubscriptionReturn("trial_active")).toBe(false)
    expect(describeSaasStatusBadges(c).map((b) => b.label)).toContain("Essai gratuit")
  })

  it("14. aucune activation de licence depuis la page retour / la page abonnement", () => {
    for (const src of [returnPage, read("app/admin/(dashboard)/abonnement/page.tsx")]) {
      expect(src).not.toMatch(/applySubscriptionState|licensePlan:\s*["']|update\(companies\)|db\./)
    }
  })
})

describe("Isolation et séparation", () => {
  it("15. aucun import Stripe Connect / abonnements clients dans le Billing admin", () => {
    const files = [
      "lib/billing/saas-admin.ts",
      "app/admin/(dashboard)/abonnement/actions.ts",
      "app/admin/(dashboard)/abonnement/page.tsx",
      "app/admin/(dashboard)/abonnement/retour/page.tsx",
      "components/admin/saas-billing/billing-buttons.tsx",
      "components/admin/saas-billing/return-poller.tsx",
    ]
    for (const f of files) {
      const src = read(f)
      const imports = src.match(/from\s+["'][^"']+["']/g) ?? []
      for (const imp of imports) {
        expect(imp).not.toMatch(/customer-subscriptions|payments\/webhook|connect/i)
      }
      expect(src).not.toMatch(/stripeAccountId|application_fee/)
      expect(src).not.toMatch(/assertPreviewTestGuards|isLifetimePreviewTestEnabled/)
    }
  })

  it("la page charge l'état depuis le tenant serveur uniquement", () => {
    const page = read("app/admin/(dashboard)/abonnement/page.tsx")
    expect(page).toMatch(/createPgSubscriptionStore\(\)\.getCompany\(member\.tenant\.id\)/)
    expect(page).toMatch(/requireCompanyMember\(\)/)
    expect(page).not.toMatch(/searchParams\)?\.?\s*\.?tenant|companyId/)
  })

  it("aucun prix codé en dur dans la nouvelle UI", () => {
    const page = read("app/admin/(dashboard)/abonnement/page.tsx")
    expect(page).not.toMatch(/19[,.]90|34[,.]90|1990|3490/)
  })

  it("liens internes conservent le tenant (A et B)", () => {
    expect(buildSaasAdminUrls("autocare")).toEqual({
      page: "/admin/abonnement?tenant=autocare",
      success: "/admin/abonnement/retour?tenant=autocare",
      cancel: "/admin/abonnement?annule=1&tenant=autocare",
      portalReturn: "/admin/abonnement?tenant=autocare",
    })
    expect(buildSaasAdminUrls("detailflow").page).toBe("/admin/abonnement?tenant=detailflow")
    const returnPage = read("app/admin/(dashboard)/abonnement/retour/page.tsx")
    expect(returnPage).not.toMatch(/href="\/admin/)
  })

  it("menu : « Mon abonnement » dans Réglages, « Abonnements clients » conservé", () => {
    const nav = read("lib/admin/nav.ts")
    expect(nav).toMatch(/href: "\/admin\/abonnement", label: "Mon abonnement"/)
    expect(nav).toMatch(/"\/admin\/abonnement": "reglages"/)
    expect(nav).toMatch(/Abonnements clients/)
    for (const f of ["components/admin/admin-shell.tsx", "components/admin/admin-sidebar.tsx"]) {
      expect(read(f)).toMatch(/pathname\.startsWith\(`\$\{href\}\/`\)/)
    }
  })

  it("badges : résiliation programmée, past_due, paused", () => {
    expect(describeSaasStatusBadges({ subscriptionStatus: "active", cancelAtPeriodEnd: true }).map((b) => b.label)).toEqual([
      "Actif",
      "Résiliation programmée",
    ])
    expect(describeSaasStatusBadges({ subscriptionStatus: "past_due", cancelAtPeriodEnd: false })[0].label).toBe(
      "Paiement à régulariser",
    )
    expect(describeSaasStatusBadges({ subscriptionStatus: "paused", cancelAtPeriodEnd: false })[0].label).toBe("En pause")
  })
})
