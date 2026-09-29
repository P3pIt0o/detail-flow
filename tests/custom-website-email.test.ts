import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { SendResult } from "@/lib/email/send"

/**
 * On isole l'envoi de la demande « site personnalisé » du provider réel :
 * `sendEmail` est espionné. Aucun email n'est réellement émis pendant les tests.
 */
const sendEmail = vi.fn<(args: unknown) => Promise<SendResult>>()
vi.mock("@/lib/email/send", () => ({ sendEmail: (args: unknown) => sendEmail(args) }))

import {
  sendCustomWebsiteRequest,
  resolveInternalRecipients,
  interpretSendResult,
  CUSTOM_WEBSITE_ERROR_MESSAGE,
} from "@/lib/email/custom-website"

const BASE_INPUT = {
  companyName: "Garage Test",
  city: "Lyon",
  currentSite: "https://exemple.fr",
  instagram: "@garage_test",
  needs: "Un site vitrine avec réservation.",
  features: "Galerie avant/après",
  contactName: "Alex Pro",
  contactEmail: "alex@garage-test.fr",
  contactPhone: "0600000000",
  tenantSlug: "garage-test",
}

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  sendEmail.mockReset()
  process.env.SUPER_ADMIN_EMAILS = "admin@detailflow.fr"
  process.env.EMAIL_FROM = "DetailFlow <contact@detailflow.fr>"
})

afterEach(() => {
  process.env.SUPER_ADMIN_EMAILS = ORIGINAL_ENV.SUPER_ADMIN_EMAILS
  process.env.EMAIL_FROM = ORIGINAL_ENV.EMAIL_FROM
})

describe("resolveInternalRecipients", () => {
  const envOf = (v: Record<string, string>): NodeJS.ProcessEnv => v as unknown as NodeJS.ProcessEnv

  it("utilise SUPER_ADMIN_EMAILS quand présent (liste multi-adresses)", () => {
    const env = envOf({ SUPER_ADMIN_EMAILS: "a@x.fr, b@x.fr", EMAIL_FROM: "DetailFlow <contact@x.fr>" })
    expect(resolveInternalRecipients(env)).toEqual(["a@x.fr", "b@x.fr"])
  })

  it("retombe sur l'adresse d'EMAIL_FROM si SUPER_ADMIN_EMAILS est vide", () => {
    const env = envOf({ SUPER_ADMIN_EMAILS: "", EMAIL_FROM: "DetailFlow <contact@detailflow.fr>" })
    expect(resolveInternalRecipients(env)).toEqual(["contact@detailflow.fr"])
  })

  it("renvoie une liste vide si aucune config d'adresse n'existe", () => {
    const env = envOf({ SUPER_ADMIN_EMAILS: "", EMAIL_FROM: "" })
    expect(resolveInternalRecipients(env)).toEqual([])
  })
})

describe("sendCustomWebsiteRequest", () => {
  it("appelle sendEmail exactement une fois, avec les bonnes données", async () => {
    sendEmail.mockResolvedValue({ ok: true, id: "email_123" })

    const res = await sendCustomWebsiteRequest(BASE_INPUT)

    expect(sendEmail).toHaveBeenCalledTimes(1)
    const args = sendEmail.mock.calls[0][0] as {
      to: string[]
      subject: string
      html: string
      replyTo: string
    }
    expect(args.to).toEqual(["admin@detailflow.fr"])
    expect(args.replyTo).toBe(BASE_INPUT.contactEmail)
    expect(args.subject).toContain(BASE_INPUT.companyName)
    // Les données du formulaire sont bien véhiculées dans le corps de l'email.
    expect(args.html).toContain("Garage Test")
    expect(args.html).toContain("Lyon")
    expect(args.html).toContain("Un site vitrine avec réservation.")
    expect(res.ok).toBe(true)
  })

  it("succès Resend → résultat ok (confirmation possible)", async () => {
    sendEmail.mockResolvedValue({ ok: true, id: "email_ok" })
    const res = await sendCustomWebsiteRequest(BASE_INPUT)
    expect(res.ok).toBe(true)
  })

  it("erreur Resend → échec propagé (ok=false, non skipped)", async () => {
    sendEmail.mockResolvedValue({ ok: false, error: "Domain is not verified" })
    const res = await sendCustomWebsiteRequest(BASE_INPUT)
    expect(res.ok).toBe(false)
    expect(res.skipped).not.toBe(true)
  })

  it("aucun destinataire configuré → skipped, sendEmail JAMAIS appelé", async () => {
    process.env.SUPER_ADMIN_EMAILS = ""
    process.env.EMAIL_FROM = ""
    const res = await sendCustomWebsiteRequest(BASE_INPUT)
    expect(sendEmail).not.toHaveBeenCalled()
    expect(res.ok).toBe(false)
    expect(res.skipped).toBe(true)
  })

  it("SUPER_ADMIN_EMAILS absent mais EMAIL_FROM présent → envoi vers l'adresse de repli", async () => {
    process.env.SUPER_ADMIN_EMAILS = ""
    sendEmail.mockResolvedValue({ ok: true, id: "email_fb" })
    const res = await sendCustomWebsiteRequest(BASE_INPUT)
    expect(sendEmail).toHaveBeenCalledTimes(1)
    const args = sendEmail.mock.calls[0][0] as { to: string[] }
    expect(args.to).toEqual(["contact@detailflow.fr"])
    expect(res.ok).toBe(true)
  })
})

describe("interpretSendResult (point 7 : pas de fausse confirmation)", () => {
  it("succès Resend → ok", () => {
    expect(interpretSendResult({ ok: true, id: "x" })).toEqual({ ok: true })
  })

  it("erreur provider → échec contrôlé avec message générique", () => {
    expect(interpretSendResult({ ok: false, error: "500 boom" })).toEqual({
      ok: false,
      error: CUSTOM_WEBSITE_ERROR_MESSAGE,
    })
  })

  it("skipped (infra non configurée) → échec, jamais de confirmation", () => {
    expect(interpretSendResult({ ok: false, skipped: true, error: "no recipient" })).toEqual({
      ok: false,
      error: CUSTOM_WEBSITE_ERROR_MESSAGE,
    })
  })

  it("le message d'erreur n'expose aucun détail technique", () => {
    const out = interpretSendResult({ ok: false, error: "RESEND_API_KEY invalid xyz" })
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.error).toBe(CUSTOM_WEBSITE_ERROR_MESSAGE)
      expect(out.error).not.toContain("RESEND")
      expect(out.error).not.toContain("xyz")
    }
  })
})
