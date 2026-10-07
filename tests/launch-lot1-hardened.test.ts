import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { rejectUnauthorizedCron } from "@/lib/cron/auth"
import { BillingOriginError, resolveBillingOrigin } from "@/lib/billing/billing-origin"
import { BOOKING_RATE_LIMIT_ID, BOOKING_RATE_LIMITED_MESSAGE, isBookingRateLimited } from "@/lib/booking/rate-limit"
import { SAAS_ADMIN_CHECKOUT_PLANS, SAAS_ADMIN_DISPLAY_PLANS, buildSaasAdminUrls } from "@/lib/billing/saas-admin"
import { COMMISSION_RULES } from "@/lib/billing/commercial-rules"
import { PLAN_MATRIX } from "@/lib/licensing/registry"
import { ALL_COMMERCIAL_PLANS, PRICING_COPY, getSelfServePlans } from "@/lib/pricing/plans"
import { DESIRED_PLANS, parseDesiredPlan } from "@/lib/pricing/desired-plan"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("A — self-service : seul PRO est achetable", () => {
  it("SAAS_ADMIN_CHECKOUT_PLANS = [PRO]", () => expect([...SAAS_ADMIN_CHECKOUT_PLANS]).toEqual(["PRO"]))
  it("Performance et Équipe restent affichées sur /admin/abonnement", () =>
    expect([...SAAS_ADMIN_DISPLAY_PLANS]).toEqual(["PRO", "BUSINESS", "ENTERPRISE"]))
  it("la page abonnement : bouton actif seulement pour un plan achetable, aucun prix codé en dur", () => {
    const page = code("app/admin/(dashboard)/abonnement/page.tsx")
    expect(page).toMatch(/isSaasAdminCheckoutPlan\(/)
    expect(page).toMatch(/Bientôt disponible/)
    expect(page).not.toMatch(/19[.,]90|34[.,]90|59[.,]90|1990|3490|5990/)
  })
  it("SaasCheckoutButton consomme SaasAdminCheckoutPlan", () => {
    expect(read("components/admin/saas-billing/billing-buttons.tsx")).toMatch(/SaasAdminCheckoutPlan/)
  })
  it("BUSINESS / ENTERPRISE restent mappés côté Billing (webhook, abonnements existants)", () => {
    const config = read("lib/billing/config.ts")
    expect(config).toMatch(/STRIPE_PRICE_PERFORMANCE_MONTHLY/)
    expect(config).toMatch(/STRIPE_PRICE_EQUIPE_MONTHLY/)
    expect(config).toMatch(/BUSINESS/)
    expect(config).toMatch(/ENTERPRISE/)
  })
})

describe("C/D — marketing + intention", () => {
  it("seuls starter et pro sont self_serve", () =>
    expect(getSelfServePlans().map((p) => p.id)).toEqual(["starter", "pro"]))
  it("Performance et Équipe : coming_soon, aucun href", () => {
    for (const id of ["ultime", "entreprise"]) {
      const plan = ALL_COMMERCIAL_PLANS.find((p) => p.id === id)
      expect(plan?.availability).toBe("coming_soon")
      expect(plan?.cta.href).toBeNull()
    }
  })
  it("trialHeadline ne parle que d'Indépendant", () => {
    expect(PRICING_COPY.trialHeadline).toMatch(/Indépendant/)
    expect(PRICING_COPY.trialHeadline).not.toMatch(/Performance/)
  })
  it("DESIRED_PLANS = [PRO] ; BUSINESS/ENTERPRISE => null", () => {
    expect([...DESIRED_PLANS]).toEqual(["PRO"])
    expect(parseDesiredPlan("BUSINESS")).toBeNull()
    expect(parseDesiredPlan("ENTERPRISE")).toBeNull()
  })
  it("aucun lien public plan=BUSINESS / plan=ENTERPRISE", () => {
    for (const f of ["lib/pricing/plans.ts", "components/marketing/v4/pricing-data.ts", "components/marketing/v4/pricing.tsx"]) {
      expect(read(f)).not.toMatch(/plan=(BUSINESS|ENTERPRISE)/)
    }
  })
  it("la grille ne promet ni liste d'attente ni limite véhicules", () => {
    const data = read("components/marketing/v4/pricing-data.ts")
    expect(data).not.toMatch(/Liste d'attente/)
    expect(data).not.toMatch(/Jusqu'à 5 véhicules/)
  })
})

describe("E/F/G — backend inchangé", () => {
  it("FREE conserve ses features et limites", () => {
    expect(PLAN_MATRIX.FREE.features.website).toBe(true)
    expect(PLAN_MATRIX.FREE.features.online_booking).toBe(true)
    expect(PLAN_MATRIX.FREE.features.online_payments).toBe(true)
    expect(PLAN_MATRIX.FREE.features.customer_subscriptions).toBe(true)
    expect(PLAN_MATRIX.FREE.limits.maxCustomers).toBe(5)
    expect(PLAN_MATRIX.FREE.limits.maxQuotesPerMonth).toBe(3)
    expect(PLAN_MATRIX.FREE.limits.maxInvoicesPerMonth).toBe(3)
  })
  it("PRO : online_payments + limites illimitées", () => {
    expect(PLAN_MATRIX.PRO.features.online_payments).toBe(true)
    expect(PLAN_MATRIX.PRO.limits.maxCustomers).toBeNull()
    expect(PLAN_MATRIX.PRO.limits.maxQuotesPerMonth).toBeNull()
    expect(PLAN_MATRIX.PRO.limits.maxInvoicesPerMonth).toBeNull()
  })
  it("commercial-rules inchangé", () => {
    expect(COMMISSION_RULES.FREE).toEqual({ feeBps: 200, monthlyFeeCapCents: 1990 })
    expect(COMMISSION_RULES.PRO).toEqual({ feeBps: 100, monthlyFeeCapCents: 500 })
  })
})

describe("H — crons fail-closed", () => {
  const req = (auth?: string) =>
    new Request("https://x.test/api/cron/reminders", { headers: auth ? { authorization: auth } : {} })

  it("CRON_SECRET absent => 503", async () => {
    vi.stubEnv("CRON_SECRET", "")
    const res = rejectUnauthorizedCron(req("Bearer anything"))
    expect(res?.status).toBe(503)
    expect(JSON.stringify(await res?.json())).not.toMatch(/anything/)
  })
  it("Authorization absent => 401", () => {
    vi.stubEnv("CRON_SECRET", "s3cr3t")
    expect(rejectUnauthorizedCron(req())?.status).toBe(401)
  })
  it("mauvais Bearer => 401, secret jamais renvoyé", async () => {
    vi.stubEnv("CRON_SECRET", "s3cr3t")
    const res = rejectUnauthorizedCron(req("Bearer nope"))
    expect(res?.status).toBe(401)
    expect(JSON.stringify(await res?.json())).not.toMatch(/s3cr3t/)
  })
  it("bon Bearer => traitement autorisé", () => {
    vi.stubEnv("CRON_SECRET", "s3cr3t")
    expect(rejectUnauthorizedCron(req("Bearer s3cr3t"))).toBeNull()
  })

  function cronRoutes(dir = "app/api/cron"): string[] {
    return readdirSync(join(process.cwd(), dir)).flatMap((e) => {
      const p = `${dir}/${e}`
      if (statSync(join(process.cwd(), p)).isDirectory()) return cronRoutes(p)
      return e === "route.ts" ? [p] : []
    })
  }
  it("toutes les routes app/api/cron/** utilisent la garde AVANT tout traitement", () => {
    const routes = cronRoutes()
    expect(routes.length).toBeGreaterThanOrEqual(3)
    for (const r of routes) {
      const src = code(r)
      expect(src, r).toMatch(/rejectUnauthorizedCron\(/)
      expect(src, r).not.toMatch(/if\s*\(\s*secret\s*\)/)
      const guard = src.indexOf("rejectUnauthorizedCron(")
      for (const op of ["db.", "sql`", "send"]) {
        const idx = src.indexOf(op, src.indexOf("export async function"))
        if (idx !== -1) expect(guard, `${r} ${op}`).toBeLessThan(idx)
      }
    }
  })
  it("la route sms-test reste fail-closed", () => {
    expect(code("app/api/admin/sms-test/route.ts")).toMatch(/!secret/)
  })
  it(".env.example documente CRON_SECRET / NOTIFICATIONS_ENABLED sans valeur", () => {
    const env = read(".env.example")
    expect(env).toMatch(/^CRON_SECRET=""$/m)
    expect(env).toMatch(/^NOTIFICATIONS_ENABLED=""$/m)
  })
  it("le cron notifications n'est pas planifié dans vercel.json", () => {
    let vercel = ""
    try {
      vercel = read("vercel.json")
    } catch {
      vercel = ""
    }
    expect(vercel).not.toMatch(/\/api\/cron\/notifications/)
  })
})

describe("I — rate limit réservation", () => {
  const h = new Headers()
  const prod = { NODE_ENV: "production", VERCEL_ENV: "production" }
  const preview = { NODE_ENV: "production", VERCEL_ENV: "preview" }
  const local = { NODE_ENV: "development" }

  it("ID dédié booking-create", () => expect(BOOKING_RATE_LIMIT_ID).toBe("booking-create"))
  it("réservation normale => continue", async () => {
    const check = vi.fn().mockResolvedValue({ rateLimited: false })
    expect(await isBookingRateLimited(h, { check, env: prod })).toBe(false)
    expect(check).toHaveBeenCalledWith("booking-create", { headers: h })
  })
  it("rate limited => refusé", async () => {
    expect(await isBookingRateLimited(h, { check: async () => ({ rateLimited: true }), env: prod })).toBe(true)
  })
  it("règle absente / firewall indisponible en prod => fail closed", async () => {
    expect(await isBookingRateLimited(h, { check: async () => ({ rateLimited: false, error: "not-found" }), env: prod })).toBe(true)
    expect(await isBookingRateLimited(h, { check: async () => { throw new Error("down") }, env: prod })).toBe(true)
  })
  it.each(["unknown", "unavailable", "rate-limit-error", "x"])(
    "prod : toute erreur firewall (%s) + rateLimited=false => refusé",
    async (error) => {
      expect(await isBookingRateLimited(h, { check: async () => ({ rateLimited: false, error }), env: prod })).toBe(true)
    },
  )
  it("preview / local : erreur inattendue => réservation possible", async () => {
    for (const env of [preview, local]) {
      expect(await isBookingRateLimited(h, { check: async () => ({ rateLimited: false, error: "unknown" }), env })).toBe(false)
    }
  })
  it("preview / local : règle absente => réservation possible", async () => {
    for (const env of [preview, local]) {
      expect(await isBookingRateLimited(h, { check: async () => ({ rateLimited: false, error: "not-found" }), env })).toBe(false)
      expect(await isBookingRateLimited(h, { check: async () => { throw new Error("down") }, env })).toBe(false)
    }
  })
  it("message générique (aucun quota / IP / fournisseur)", () => {
    expect(BOOKING_RATE_LIMITED_MESSAGE).not.toMatch(/\d+\s*(requ|min)|IP|firewall|vercel|booking-create/i)
  })

  const actions = code("app/(site)/reservation/actions.ts")
  const fnBody = (name: string) => {
    const start = actions.indexOf(`export async function ${name}(`)
    const next = actions.indexOf("export async function", start + 10)
    return actions.slice(start, next === -1 ? undefined : next)
  }
  it("createBookingAction : anti-abus après résolution tenant, avant toute écriture DB", () => {
    const body = fnBody("createBookingAction")
    const rl = body.indexOf("isBookingRateLimited(")
    expect(rl).toBeGreaterThan(body.indexOf("resolvePublicRequestTenant()"))
    for (const op of ["db.transaction", ".insert(", "pg_advisory_xact_lock", "computeQuote", "stripe"]) {
      const idx = body.indexOf(op)
      if (idx !== -1) expect(rl, op).toBeLessThan(idx)
    }
  })
  it.each(["getQuoteAction", "getAvailabilityAction", "getAvailabilityRangeAction", "computeTravelAction", "validatePromoCodeAction"])(
    "%s n'est pas rate-limité",
    (name) => {
      const body = fnBody(name)
      if (body.length > 0) expect(body).not.toMatch(/isBookingRateLimited|checkRateLimit/)
    },
  )
})

describe("K — origine Stripe Billing", () => {
  it("prod normale => https://www.detailflow.fr", () => {
    expect(
      resolveBillingOrigin({ NODE_ENV: "production", VERCEL_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://www.detailflow.fr" }),
    ).toBe("https://www.detailflow.fr")
  })
  it("Host / x-forwarded-host jamais lus par l'action", () => {
    const src = code("app/admin/(dashboard)/abonnement/actions.ts")
    expect(src).not.toMatch(/x-forwarded-host|headers\(\)/)
    expect(code("lib/billing/billing-origin.ts")).not.toMatch(/x-forwarded|headers\(/)
  })
  it.each(["javascript:alert(1)", "data:text/html,x", "http://evil.example", "https://u:p@evil.example", "https://www.detailflow.fr/path", "https://www.detailflow.fr\r\nX: y", "", undefined])(
    "prod : %s refusé => aucun Checkout (BillingOriginError)",
    (url) => {
      expect(() =>
        resolveBillingOrigin({ NODE_ENV: "production", VERCEL_ENV: "production", NEXT_PUBLIC_SITE_URL: url }),
      ).toThrow(BillingOriginError)
    },
  )
  it("localhost autorisé uniquement hors production", () => {
    expect(resolveBillingOrigin({ NODE_ENV: "development" })).toBe("http://localhost:3000")
    expect(() =>
      resolveBillingOrigin({ NODE_ENV: "production", VERCEL_ENV: "production", NEXT_PUBLIC_SITE_URL: "http://localhost:3000" }),
    ).toThrow(BillingOriginError)
  })
  it("preview : origine Vercel contrôlée", () => {
    expect(resolveBillingOrigin({ NODE_ENV: "production", VERCEL_ENV: "preview", VERCEL_URL: "detail-flow-abc.vercel.app" })).toBe(
      "https://detail-flow-abc.vercel.app",
    )
  })
  it("tenant A => tenant=A, jamais tenant=B", () => {
    const urls = buildSaasAdminUrls("autocare")
    for (const u of Object.values(urls)) {
      expect(u).toContain("tenant=autocare")
      expect(u).not.toContain("tenant=detailflow")
    }
  })
})
