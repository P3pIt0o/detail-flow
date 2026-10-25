import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import { BOOKING_RATE_LIMIT_ID, PROMO_RATE_LIMIT_ID, isPromoRateLimited } from "@/lib/booking/rate-limit"
import { bookingCta, canConfirmBooking, codeNotAppliedMessage, promoRejectionMessage } from "@/lib/booking/v2"

/**
 * L24 — limite de débit des codes promo publics (règle Vercel Firewall `booking-promo`) :
 * jamais bloquante pour un devis, jamais de confirmation sur un code non vérifié (règle L23).
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
const actions = code("app/(site)/reservation/actions.ts")
const fnBody = (name: string) => {
  const start = actions.indexOf(`export async function ${name}(`)
  const next = actions.indexOf("export async function", start + 1)
  return actions.slice(start, next === -1 ? undefined : next)
}

describe("1. isPromoRateLimited", () => {
  const h = new Headers()
  it("règle distincte booking-promo", async () => {
    expect(PROMO_RATE_LIMIT_ID).toBe("booking-promo")
    expect(PROMO_RATE_LIMIT_ID).not.toBe(BOOKING_RATE_LIMIT_ID)
    const check = vi.fn(async () => ({ rateLimited: false }))
    expect(await isPromoRateLimited(h, { check })).toBe(false)
    expect(check).toHaveBeenCalledWith("booking-promo", { headers: h })
  })
  it("limite atteinte : rateLimited ou blocked", async () => {
    expect(await isPromoRateLimited(h, { check: async () => ({ rateLimited: true }) })).toBe(true)
    expect(await isPromoRateLimited(h, { check: async () => ({ rateLimited: false, error: "blocked" }) })).toBe(true)
  })
  it.each(["not-found", "unknown", "rate-limit-error"])("limite indisponible (%s) => on laisse passer, même en production", async (error) => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("VERCEL_ENV", "production")
    expect(await isPromoRateLimited(h, { check: async () => ({ rateLimited: false, error }) })).toBe(false)
    vi.unstubAllEnvs()
  })
  it("exception => on laisse passer", async () => {
    expect(await isPromoRateLimited(h, { check: async () => { throw new Error("down") } })).toBe(false)
  })
})

describe("2. Messages client", () => {
  it("aperçu limité : message générique validé", () => {
    const m = promoRejectionMessage("rate_limited")
    expect(m).toBe("Impossible de vérifier ce code pour le moment. Merci de réessayer dans un instant.")
    expect(m).not.toMatch(/\d|IP|firewall|vercel|booking-promo/i)
  })
  it("récapitulatif : code non vérifié", () => {
    const m = codeNotAppliedMessage("ETE10", "unverified")
    expect(m).toBe("Le code ETE10 n'a pas pu être vérifié, réessayez dans un instant.")
    expect(m.replace("ETE10", "")).not.toMatch(/\d|IP|firewall|vercel|booking-promo/i)
  })
})

describe("3. Branchements serveur (structure du source)", () => {
  it("validatePromoCodeAction : limite après le tenant, avant catalogue et code", () => {
    const body = fnBody("validatePromoCodeAction")
    const rl = body.indexOf("isPromoRateLimited(")
    expect(rl).toBeGreaterThan(body.indexOf("resolveRequestTenant()"))
    for (const op of ["getSettings(", "buildQuote(", "getPromotionData(", "validatePromoCode("]) expect(rl, op).toBeLessThan(body.indexOf(op))
    expect(body).toMatch(/isPromoRateLimited\([^\n]*\)\s*return \{ ok: false, reason: "rate_limited" \}/)
  })
  it("getQuoteAction : limite seulement si un code est fourni, avant validatePromoCode", () => {
    const body = fnBody("getQuoteAction")
    const branch = body.indexOf("if (code && tenant)")
    const rl = body.indexOf("isPromoRateLimited(")
    expect(branch).toBeGreaterThan(-1)
    expect(rl).toBeGreaterThan(branch)
    expect(rl).toBeLessThan(body.indexOf("validatePromoCode("))
    expect(body.match(/isPromoRateLimited\(/g)).toHaveLength(1)
    expect(body).toContain('codeStatus = "unverified"')
  })
  it("le code affiché est normalisé comme côté serveur", () => {
    const body = fnBody("getQuoteAction")
    expect(body).toContain("normalizePromoCode(code)")
    expect(body).not.toContain("code.toUpperCase()")
  })
  it("createBookingAction garde sa règle booking-create", () => {
    const body = fnBody("createBookingAction")
    expect(body).toContain("isBookingRateLimited(")
    expect(body).not.toContain("isPromoRateLimited(")
  })
})

describe("4. Récapitulatif : pas de confirmation sur un code non vérifié", () => {
  const status = (s: string) => ({ status: "ok" as const, pricing: { code: { code: "ETE10", status: s, discountCents: 0 } } })
  const base = { step: 3, stepValid: false, contactValid: true, online: false }
  it("unverified => confirmation impossible, bouton Recalculer le prix", () => {
    expect(canConfirmBooking(true, status("unverified"))).toBe(false)
    expect(bookingCta({ ...base, pricing: status("unverified") })).toEqual({ action: "retry", label: "Recalculer le prix", disabled: false })
  })
  it.each(["applied", "invalid", "rejected_not_combinable", "rejected_no_eligible_amount"])("%s => confirmation normale", (s) => {
    expect(canConfirmBooking(true, status(s))).toBe(true)
    expect(bookingCta({ ...base, stepValid: true, pricing: status(s) })).toEqual({ action: "submit", label: "Confirmer", disabled: false })
  })
  it("sans code => confirmation normale", () => {
    expect(canConfirmBooking(true, { status: "ok", pricing: { code: null } })).toBe(true)
  })
  it("le composant affiche l'indication du code non vérifié", () => {
    expect(read("components/booking-v2/booking-v2.tsx")).toContain("isPromoUnverified(pricing)")
  })
})

describe("5. Suggestions : même repli de prix que buildQuote", () => {
  it("prix du type de véhicule puis basePriceCents", () => {
    expect(fnBody("getQuoteAction")).toMatch(/x\.vehicleTypeId === t\)\?\.priceCents \?\? svc\.basePriceCents/)
    expect(code("lib/booking/pricing.ts")).toMatch(/priceRow\?\.priceCents \?\? service\.basePriceCents/)
  })
})
