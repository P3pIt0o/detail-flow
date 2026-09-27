import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { isLifetimePreviewTestEnabled } from "@/lib/billing/lifetime-preview-test"

const DIR = resolve(__dirname, "../app/admin/(dashboard)/abonnement/lifetime/test")
const pageSrc = readFileSync(resolve(DIR, "page.tsx"), "utf8")
const buttonSrc = readFileSync(resolve(DIR, "test-checkout-button.tsx"), "utf8")

const notFoundMock = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND")
})
const requireMemberMock = vi.fn(async (_roles: string[]) => ({ role: "OWNER", tenant: { id: 1, slug: "acme" }, isSuperAdmin: false }))

vi.mock("next/navigation", () => ({ notFound: () => notFoundMock() }))
vi.mock("@/lib/admin", () => ({ requireCompanyMember: (roles: string[]) => requireMemberMock(roles) }))
vi.mock("@/app/admin/(dashboard)/abonnement/lifetime/actions", () => ({ startLifetimeSingleCheckout: vi.fn() }))
vi.mock("../app/admin/(dashboard)/abonnement/lifetime/actions", () => ({ startLifetimeSingleCheckout: vi.fn() }))

describe("isLifetimePreviewTestEnabled", () => {
  it("n'autorise que preview", () => {
    expect(isLifetimePreviewTestEnabled("preview")).toBe(true)
    expect(isLifetimePreviewTestEnabled("production")).toBe(false)
    expect(isLifetimePreviewTestEnabled("development")).toBe(false)
    expect(isLifetimePreviewTestEnabled(undefined)).toBe(false)
    expect(isLifetimePreviewTestEnabled("")).toBe(false)
  })
})

describe("page /admin/abonnement/lifetime/test", () => {
  const original = process.env.VERCEL_ENV
  beforeEach(() => {
    notFoundMock.mockClear()
    requireMemberMock.mockClear()
    process.env.VERCEL_ENV = original
  })

  async function render() {
    const mod = await import("../app/admin/(dashboard)/abonnement/lifetime/test/page")
    return mod.default()
  }

  it("VERCEL_ENV=production → notFound, avant toute auth", async () => {
    process.env.VERCEL_ENV = "production"
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND")
    expect(notFoundMock).toHaveBeenCalledTimes(1)
    expect(requireMemberMock).not.toHaveBeenCalled()
  })

  it("VERCEL_ENV absent → notFound", async () => {
    delete process.env.VERCEL_ENV
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND")
  })

  it("OWNER en Preview → page rendue, rôle OWNER exigé", async () => {
    process.env.VERCEL_ENV = "preview"
    const el = await render()
    expect(el).toBeTruthy()
    expect(notFoundMock).not.toHaveBeenCalled()
    expect(requireMemberMock).toHaveBeenCalledWith(["OWNER"])
  })

  it("affiche les libellés imposés", () => {
    expect(pageSrc).toContain("Test Lifetime — Preview")
    expect(pageSrc).toContain("Ce paiement utilise Stripe TEST et la base Preview isolée.")
    expect(pageSrc).toContain("ENVIRONNEMENT TEST — aucun paiement réel")
    expect(buttonSrc).toContain("Lancer le Checkout TEST — 1 290 €")
  })
})

describe("bouton client", () => {
  it("réutilise l'action S3A existante, sans argument", () => {
    expect(buttonSrc).toMatch(/import \{ startLifetimeSingleCheckout \} from "\.\.\/actions"/)
    expect(buttonSrc).toContain("startLifetimeSingleCheckout()")
    expect(buttonSrc).not.toMatch(/startLifetimeSingleCheckout\([^)]/)
  })

  it("ne transmet aucune donnée sensible depuis le navigateur", () => {
    for (const forbidden of ["companyId", "allocationId", "priceId", "price_", "129000", "amount", "role:", "licensePlan", "fetch("]) {
      expect(buttonSrc).not.toContain(forbidden)
    }
  })

  it("redirige vers result.url et affiche result.error", () => {
    expect(buttonSrc).toContain("window.location.assign(result.url)")
    expect(buttonSrc).toContain("setError(result.error)")
  })

  it("ne crée ni Checkout ni client Stripe dans la page", () => {
    for (const src of [pageSrc, buttonSrc]) {
      expect(src).not.toContain("stripe")
      expect(src).not.toContain("createLifetimeSingleCheckout")
      expect(src).not.toContain("activateLifetimeSlot")
    }
  })
})
