import { describe, it, expect, vi } from "vitest"
import { runSubmitDiagnostic, type DiagnosticDeps } from "@/app/marketing/diagnostic/actions"
import { DIAGNOSTIC_ERROR_MESSAGE } from "@/lib/email/diagnostic"
import type { SendResult } from "@/lib/email/send"
import { DIAGNOSTIC_RATE_LIMITED_MESSAGE, type RateLimitDecision } from "@/lib/diagnostic/rate-limit"

/**
 * Tests d'orchestration anti-abus de la Server Action diagnostic.
 * Les dépendances (rate limit, envoi, headers) sont injectées : aucun réseau,
 * aucune Firewall, aucun Resend réel n'est appelé.
 */

/** Payload valide minimal accepté par validateDiagnostic. */
const validPayload = {
  companyName: "Garage Test",
  firstName: "Thomas",
  email: "thomas@example.com",
  phone: "0600000000",
  projectType: "site-vitrine",
  goal: "Avoir un site professionnel",
  budget: "1000-2000",
  deadline: "1-3-mois",
}

function makeDeps(overrides: Partial<DiagnosticDeps> = {}): {
  deps: DiagnosticDeps
  send: ReturnType<typeof vi.fn>
  checkRateLimit: ReturnType<typeof vi.fn>
} {
  const send = vi.fn(async (): Promise<SendResult> => ({ ok: true }))
  const checkRateLimit = vi.fn(async (): Promise<RateLimitDecision> => ({ limited: false }))
  const deps: DiagnosticDeps = {
    send: send as unknown as DiagnosticDeps["send"],
    checkRateLimit: checkRateLimit as unknown as DiagnosticDeps["checkRateLimit"],
    getHeaders: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }),
    ...overrides,
  }
  return { deps, send, checkRateLimit }
}

describe("diagnostic anti-abuse orchestration", () => {
  it("honeypot rempli → aucun email, succès neutre", async () => {
    const { deps, send } = makeDeps()
    const res = await runSubmitDiagnostic({ ...validPayload, website: "http://bot.example" }, deps)
    expect(res).toEqual({ ok: true })
    expect(send).not.toHaveBeenCalled()
  })

  it("payload invalide → aucun email, erreurs de champ", async () => {
    const { deps, send } = makeDeps()
    const res = await runSubmitDiagnostic({ website: "" }, deps)
    expect(res.ok).toBe(false)
    expect(send).not.toHaveBeenCalled()
    if (!res.ok) expect(res.fieldErrors).toBeDefined()
  })

  it("soumission normale → un seul email", async () => {
    const { deps, send } = makeDeps()
    const res = await runSubmitDiagnostic({ ...validPayload }, deps)
    expect(res).toEqual({ ok: true })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it("rate limit dépassé → pas d'email, message générique, flag rateLimited", async () => {
    const { deps, send } = makeDeps({
      checkRateLimit: vi.fn(async (): Promise<RateLimitDecision> => ({ limited: true, reason: "quota" })),
    })
    const res = await runSubmitDiagnostic({ ...validPayload }, deps)
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toBe(DIAGNOSTIC_RATE_LIMITED_MESSAGE)
      expect(res.rateLimited).toBe(true)
      // Le message ne révèle ni le seuil ni l'IP ni le mécanisme.
      expect(res.error).not.toMatch(/\d/)
      expect(res.error.toLowerCase()).not.toContain("ip")
    }
    expect(send).not.toHaveBeenCalled()
  })

  it("règle Firewall absente en production (fail-closed) → pas d'email", async () => {
    const { deps, send } = makeDeps({
      checkRateLimit: vi.fn(async (): Promise<RateLimitDecision> => ({ limited: true, reason: "config" })),
    })
    const res = await runSubmitDiagnostic({ ...validPayload }, deps)
    expect(res.ok).toBe(false)
    expect(send).not.toHaveBeenCalled()
  })

  it("le rate limit est vérifié AVANT l'envoi et reçoit les headers", async () => {
    const { deps, checkRateLimit, send } = makeDeps()
    await runSubmitDiagnostic({ ...validPayload }, deps)
    expect(checkRateLimit).toHaveBeenCalledTimes(1)
    const headersArg = checkRateLimit.mock.calls[0][0] as Headers
    expect(headersArg.get("x-forwarded-for")).toBe("203.0.113.9")
    expect(send).toHaveBeenCalledTimes(1)
  })

  it("erreur Resend → pas de faux succès (échec contrôlé)", async () => {
    const { deps } = makeDeps({
      send: vi.fn(async (): Promise<SendResult> => ({ ok: false, error: "provider down" })) as unknown as DiagnosticDeps["send"],
    })
    const res = await runSubmitDiagnostic({ ...validPayload }, deps)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe(DIAGNOSTIC_ERROR_MESSAGE)
  })

  it("envoi 'skipped' (infra non configurée) → pas de faux succès", async () => {
    const { deps } = makeDeps({
      send: vi.fn(async (): Promise<SendResult> => ({ ok: false, skipped: true })) as unknown as DiagnosticDeps["send"],
    })
    const res = await runSubmitDiagnostic({ ...validPayload }, deps)
    expect(res.ok).toBe(false)
  })
})
