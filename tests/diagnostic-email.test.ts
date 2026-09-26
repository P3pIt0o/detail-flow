import { describe, it, expect, vi, beforeEach } from "vitest"
import type { DiagnosticData } from "@/lib/diagnostic/schema"

// On isole l'infra Resend : `sendEmail` est mocké pour capturer l'appel sans
// réseau. Le test vérifie le destinataire fixe, le sujet, le replyTo et le
// contenu clé de l'email, ainsi que la transmission d'un échec provider.
const sendEmail = vi.fn()
vi.mock("@/lib/email/send", () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
}))

import {
  sendDiagnosticRequest,
  interpretDiagnosticResult,
  DIAGNOSTIC_RECIPIENT,
} from "@/lib/email/diagnostic"

const data: DiagnosticData = {
  hasSite: "oui",
  siteUrl: "https://spiritacs.com",
  hasDomain: "oui",
  domain: "spiritacs.com",
  booking: "logiciel",
  bookingTool: "Planity",
  goals: ["site_pro", "visibilite_google"],
  features: ["reservation", "seo_local"],
  identity: "logo_couleurs",
  companyName: "Spirit ACS",
  firstName: "Corentin",
  email: "corentin@spiritacs.com",
  phone: "06 99 90 13 03",
  comment: "Projet ambitieux",
}

beforeEach(() => {
  sendEmail.mockReset()
})

describe("sendDiagnosticRequest", () => {
  it("envoie à contact@detailflow.fr avec le bon sujet, replyTo et contenu", async () => {
    sendEmail.mockResolvedValue({ ok: true, id: "eml_1" })
    const res = await sendDiagnosticRequest(data)

    expect(res.ok).toBe(true)
    expect(sendEmail).toHaveBeenCalledTimes(1)
    const arg = sendEmail.mock.calls[0][0]
    expect(arg.to).toBe(DIAGNOSTIC_RECIPIENT)
    expect(arg.to).toBe("contact@detailflow.fr")
    expect(arg.replyTo).toBe("corentin@spiritacs.com")
    expect(arg.subject).toContain("Spirit ACS")
    // Le corps HTML doit refléter les données saisies.
    expect(arg.html).toContain("spiritacs.com")
    expect(arg.html).toContain("Planity")
    expect(arg.html).toContain("SEO local")
    expect(arg.html).toContain("corentin@spiritacs.com")
  })

  it("propage un échec provider sans jeter", async () => {
    sendEmail.mockResolvedValue({ ok: false, error: "boom" })
    const res = await sendDiagnosticRequest(data)
    expect(res.ok).toBe(false)
  })
})

describe("interpretDiagnosticResult", () => {
  it("succès uniquement si l'envoi est confirmé", () => {
    expect(interpretDiagnosticResult({ ok: true }).ok).toBe(true)
    expect(interpretDiagnosticResult({ ok: false, error: "x" }).ok).toBe(false)
    // Un envoi ignoré (infra non configurée) n'est PAS un succès.
    expect(interpretDiagnosticResult({ ok: false, skipped: true }).ok).toBe(false)
  })
})
