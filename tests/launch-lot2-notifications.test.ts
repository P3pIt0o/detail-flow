import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const dbCalls: string[] = []
vi.mock("@/lib/db", () => {
  const handler: ProxyHandler<object> = {
    get(_t, prop) {
      dbCalls.push(String(prop))
      throw new Error("db must not be touched")
    },
  }
  return { db: new Proxy({}, handler) }
})

const sendEmailMock = vi.fn()
vi.mock("@/lib/email/send", () => ({ sendEmail: (...a: unknown[]) => sendEmailMock(...a) }))

const recordReviewOptOut = vi.fn()
vi.mock("@/lib/notifications/opt-out-store", () => ({
  recordReviewOptOut: (...a: unknown[]) => recordReviewOptOut(...a),
  isReviewOptedOut: vi.fn(async () => false),
  checkReviewOptOut: vi.fn(async () => "not_opted_out"),
  optOutTableExists: vi.fn(async () => false),
}))

const settingsStore = { cols: false, outbox: false }
vi.mock("@/lib/notifications/settings-store", () => ({
  notificationsSchemaReady: vi.fn(async () => settingsStore.cols && settingsStore.outbox),
  lotDColumnsExist: vi.fn(async () => settingsStore.cols),
  notificationOutboxExists: vi.fn(async () => settingsStore.outbox),
  getLotDSettings: vi.fn(),
}))
vi.mock("@/lib/notifications/completion", () => ({ completedAtColumnExists: vi.fn(async () => true) }))
vi.mock("@/lib/licensing/enforce", () => ({ canUseFeature: vi.fn(async () => true) }))
vi.mock("@/lib/notifications/review-resolver", () => ({ resolveTenantReviewLink: vi.fn(async () => null) }))

import { processClientEmailReminders } from "@/lib/notifications/client-reminders"
import { notificationsRuntimeEnabled, isValidNotificationEmail } from "@/lib/notifications/runtime"
import {
  checkProReminderActivation,
  checkReviewRequestActivation,
  PRO_EMAIL_REQUIRED_MESSAGE,
  REVIEW_LINK_REQUIRED_MESSAGE,
  RUNTIME_DISABLED_MESSAGE,
} from "@/lib/notifications/activation"
import { validateGoogleReviewLink } from "@/lib/notifications/review-link"
import { makeOptOutToken, verifyOptOutToken } from "@/lib/notifications/opt-out-token"
import { sendWindowState, MAX_SEND_LATENESS_MS } from "@/lib/notifications/schedule"
import { PLAN_MATRIX } from "@/lib/licensing/registry"

const root = process.cwd()
const src = (p: string) => readFileSync(join(root, p), "utf8")

const ENV_KEYS = ["NOTIFICATIONS_ENABLED", "CRON_SECRET", "BETTER_AUTH_SECRET"] as const
const saved: Record<string, string | undefined> = {}
beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k]
  dbCalls.length = 0
  sendEmailMock.mockReset()
  recordReviewOptOut.mockReset()
  settingsStore.cols = false
  settingsStore.outbox = false
})
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

/* ------------------------------- Licence -------------------------------- */
describe("Licence (PLAN_MATRIX)", () => {
  const features = (plan: keyof typeof PLAN_MATRIX) =>
    Object.entries(PLAN_MATRIX[plan].features as Record<string, boolean | undefined>)
      .filter(([, on]) => on === true)
      .map(([k]) => k)
  it("FREE n'a ni email_reminders ni review_requests", () => {
    expect(features("FREE")).not.toContain("email_reminders")
    expect(features("FREE")).not.toContain("review_requests")
  })
  it("PRO possède les deux", () => {
    expect(features("PRO")).toContain("email_reminders")
    expect(features("PRO")).toContain("review_requests")
  })
  it("aucune comparaison de plan en dur dans le code notifications", () => {
    for (const f of [
      "lib/notifications/outbox.ts",
      "lib/notifications/client-reminders.ts",
      "app/api/cron/reminders/route.ts",
      "app/admin/(dashboard)/parametres/notifications-actions.ts",
    ]) {
      expect(src(f)).not.toMatch(/plan\s*===\s*["']PRO["']/)
    }
  })
})

/* ------------------------- Rappel client historique ------------------------- */
describe("Rappel email client historique (/api/cron/reminders)", () => {
  function setup(opts: { licensed: Record<number, boolean>; sendOk?: boolean }) {
    const marked: Array<[number, number]> = []
    const canUseFeature = vi.fn(async (companyId: number) => opts.licensed[companyId] ?? false)
    const sendReminder = vi.fn(async () => opts.sendOk ?? true)
    return {
      marked,
      canUseFeature,
      sendReminder,
      run: (due: Array<{ id: number; companyId: number }>) =>
        processClientEmailReminders({
          listDue: async () => due,
          canUseFeature,
          sendReminder,
          markSent: async (id, companyId) => {
            marked.push([id, companyId])
          },
        }),
    }
  }

  it("FREE (sans droit) => aucun email, aucun reminderSentAt", async () => {
    const t = setup({ licensed: { 1: false } })
    const r = await t.run([{ id: 10, companyId: 1 }])
    expect(t.sendReminder).not.toHaveBeenCalled()
    expect(t.marked).toEqual([])
    expect(r.skippedUnlicensed).toBe(1)
  })
  it("PRO => email envoyé puis reminderSentAt posé", async () => {
    const t = setup({ licensed: { 2: true } })
    const r = await t.run([{ id: 20, companyId: 2 }])
    expect(t.sendReminder).toHaveBeenCalledWith(20)
    expect(t.marked).toEqual([[20, 2]])
    expect(r.sent).toBe(1)
  })
  it("échec email => reminderSentAt reste null", async () => {
    const t = setup({ licensed: { 2: true }, sendOk: false })
    const r = await t.run([{ id: 21, companyId: 2 }])
    expect(t.marked).toEqual([])
    expect(r.failed).toBe(1)
  })
  it("exception d'envoi => traitée comme échec, rien posé", async () => {
    const t = setup({ licensed: { 2: true } })
    t.sendReminder.mockRejectedValueOnce(new Error("boom"))
    await t.run([{ id: 22, companyId: 2 }])
    expect(t.marked).toEqual([])
  })
  it("licence évaluée une seule fois par companyId, sans cross-tenant", async () => {
    const t = setup({ licensed: { 1: false, 2: true } })
    await t.run([
      { id: 1, companyId: 1 },
      { id: 2, companyId: 2 },
      { id: 3, companyId: 1 },
      { id: 4, companyId: 2 },
    ])
    expect(t.canUseFeature).toHaveBeenCalledTimes(2)
    expect(t.marked).toEqual([
      [2, 2],
      [4, 2],
    ])
  })
  it("le cron historique est branché sur la garde et scope l'update par companyId", () => {
    const s = src("app/api/cron/reminders/route.ts")
    expect(s).toContain("processClientEmailReminders")
    expect(s).toMatch(/eq\(bookings\.companyId, companyId\)/)
    expect(s).toMatch(/isNull\(bookings\.reminderSentAt\)/)
  })
})

/* ------------------------------ Flag global ------------------------------ */
describe("Flag global NOTIFICATIONS_ENABLED (fail-closed)", () => {
  it("seule la valeur exacte 'true' active", () => {
    expect(notificationsRuntimeEnabled({})).toBe(false)
    expect(notificationsRuntimeEnabled({ NOTIFICATIONS_ENABLED: "false" })).toBe(false)
    expect(notificationsRuntimeEnabled({ NOTIFICATIONS_ENABLED: "TRUE" })).toBe(false)
    expect(notificationsRuntimeEnabled({ NOTIFICATIONS_ENABLED: "1" })).toBe(false)
    expect(notificationsRuntimeEnabled({ NOTIFICATIONS_ENABLED: "true" })).toBe(true)
  })

  it.each([undefined, "false"])("flag=%s => ran=false disabled, aucun accès DB, aucun email", async (v) => {
    if (v === undefined) delete process.env.NOTIFICATIONS_ENABLED
    else process.env.NOTIFICATIONS_ENABLED = v
    const { processDueNotifications } = await import("@/lib/notifications/outbox")
    const r = await processDueNotifications(new Date())
    expect(r).toMatchObject({ ran: false, reason: "disabled" })
    expect(dbCalls).toEqual([])
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it("flag=true + migration absente => migration_pending, aucun email", async () => {
    process.env.NOTIFICATIONS_ENABLED = "true"
    const { processDueNotifications } = await import("@/lib/notifications/outbox")
    const r = await processDueNotifications(new Date())
    expect(r).toMatchObject({ ran: false, reason: "migration_pending" })
    expect(dbCalls).toEqual([])
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it("fonctions d'envoi : 2e barrière, jamais d'état 'simulated'", async () => {
    delete process.env.NOTIFICATIONS_ENABLED
    const { sendProReminderEmail, sendReviewRequestEmail } = await import("@/lib/email/notifications")
    const a = await sendProReminderEmail(1)
    const b = await sendReviewRequestEmail(1, { reviewUrl: "https://g.page/x", optOutUrl: "https://x/y" })
    expect(a.state).toBe("failed")
    expect(b.state).toBe("failed")
    expect(dbCalls).toEqual([])
    expect(sendEmailMock).not.toHaveBeenCalled()
    expect(src("lib/email/notifications.ts")).not.toMatch(/state:\s*"simulated"/)
  })
})

/* ------------------------------ Cron route ------------------------------ */
describe("Route /api/cron/notifications", () => {
  const call = async (auth?: string) => {
    const { GET } = await import("@/app/api/cron/notifications/route")
    const headers = auth ? { authorization: auth } : undefined
    return GET(new Request("https://example.test/api/cron/notifications", { headers }))
  }
  it("CRON_SECRET absent => 503", async () => {
    delete process.env.CRON_SECRET
    expect((await call("Bearer x")).status).toBe(503)
  })
  it("Authorization absente => 401", async () => {
    process.env.CRON_SECRET = "s3cret-value-123"
    expect((await call()).status).toBe(401)
  })
  it("mauvais secret => 401", async () => {
    process.env.CRON_SECRET = "s3cret-value-123"
    expect((await call("Bearer nope")).status).toBe(401)
  })
  it("bon secret + flag off => 200 no-op disabled, sans accès DB", async () => {
    process.env.CRON_SECRET = "s3cret-value-123"
    delete process.env.NOTIFICATIONS_ENABLED
    const res = await call("Bearer s3cret-value-123")
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ran: false, reason: "disabled" })
    expect(dbCalls).toEqual([])
  })
  it("bon secret + flag on + migration absente => 200 migration_pending", async () => {
    process.env.CRON_SECRET = "s3cret-value-123"
    process.env.NOTIFICATIONS_ENABLED = "true"
    const res = await call("Bearer s3cret-value-123")
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ran: false, reason: "migration_pending" })
  })
  it("vercel.json : nouveau cron 15 min, crons existants inchangés", () => {
    const cfg = JSON.parse(src("vercel.json")) as { crons: Array<{ path: string; schedule: string }> }
    expect(cfg.crons).toEqual([
      { path: "/api/cron/reminders", schedule: "0 9 * * *" },
      { path: "/api/cron/customer-subscription-emails", schedule: "*/5 * * * *" },
      { path: "/api/cron/notifications", schedule: "*/15 * * * *" },
    ])
  })
})

/* ------------------------------ Activation ------------------------------ */
describe("Activation des réglages", () => {
  const base = { enabled: true, alreadyEnabled: false, runtimeEnabled: true, licensed: true }
  it("désactiver est toujours permis", () => {
    expect(checkProReminderActivation({ ...base, enabled: false, licensed: false, runtimeEnabled: false, businessEmail: null }).ok).toBe(true)
  })
  it("rappel pro sans email pro valide => refusé avec message clair", () => {
    const r = checkProReminderActivation({ ...base, businessEmail: "pas-un-email" })
    expect(r).toEqual({ ok: false, reason: "no_pro_email", error: PRO_EMAIL_REQUIRED_MESSAGE })
  })
  it("rappel pro sans droit => locked", () => {
    expect(checkProReminderActivation({ ...base, licensed: false, businessEmail: "pro@garage.fr" })).toMatchObject({ reason: "locked" })
  })
  it("rappel pro OK avec PRO + email valide", () => {
    expect(checkProReminderActivation({ ...base, businessEmail: "pro@garage.fr" }).ok).toBe(true)
  })
  it("flag off => nouvelle activation refusée, réglage déjà actif conservable", () => {
    expect(checkProReminderActivation({ ...base, runtimeEnabled: false, businessEmail: "pro@garage.fr" })).toEqual({
      ok: false,
      reason: "runtime_disabled",
      error: RUNTIME_DISABLED_MESSAGE,
    })
    expect(checkProReminderActivation({ ...base, runtimeEnabled: false, alreadyEnabled: true, businessEmail: "pro@garage.fr" }).ok).toBe(true)
  })
  it("avis sans lien => refusé", () => {
    expect(checkReviewRequestActivation({ ...base, placeId: null, manualLink: null })).toEqual({
      ok: false,
      reason: "no_review_link",
      error: REVIEW_LINK_REQUIRED_MESSAGE,
    })
  })
  it("avis avec Place ID existant ou lien Google valide => accepté", () => {
    expect(checkReviewRequestActivation({ ...base, placeId: "ChIJabc", manualLink: null }).ok).toBe(true)
    expect(checkReviewRequestActivation({ ...base, placeId: null, manualLink: "https://g.page/r/abc/review" }).ok).toBe(true)
  })
  it("avis avec lien externe => refusé", () => {
    expect(checkReviewRequestActivation({ ...base, placeId: null, manualLink: "https://evil.com/review" }).ok).toBe(false)
  })
  it("l'UI ne reçoit qu'un booléen, jamais le nom de la variable", () => {
    const ui = src("components/admin/settings/notifications-settings.tsx")
    expect(ui).not.toContain("NOTIFICATIONS_ENABLED")
    expect(ui).toContain("runtimeEnabled")
    expect(ui).toContain("Les automatisations sont en cours d&apos;activation.")
  })
})

/* --------------------------- Validation lien Google --------------------------- */
describe("Validation du lien Google", () => {
  it.each([
    "javascript:alert(1)",
    "data:text/html,hi",
    "http://g.page/r/abc",
    "https://google.evil.com/x",
    "https://mygoogle.com/x",
    "https://user@g.page/r/abc",
    "https://user:pass@search.google.com/local/writereview?placeid=x",
    "https://search.google.com:8443/local/writereview?placeid=x",
    "https://evil.com@g.page/r/abc",
  ])("refuse %s", (url) => {
    expect(validateGoogleReviewLink(url).ok).toBe(false)
  })
  it.each([
    "https://g.page/r/abc/review",
    "https://search.google.com/local/writereview?placeid=ChIJabc",
    "https://maps.app.goo.gl/abc",
    "https://search.google.com:443/local/writereview?placeid=x",
  ])("accepte %s", (url) => {
    expect(validateGoogleReviewLink(url).ok).toBe(true)
  })
  it("aucun fetch réseau dans la validation", () => {
    expect(src("lib/notifications/review-link.ts")).not.toMatch(/\bfetch\(/)
  })
})

/* --------------------------- Destinataires --------------------------- */
describe("Validation destinataire", () => {
  it("email invalide refusé avant tout appel fournisseur", () => {
    expect(isValidNotificationEmail(null)).toBe(false)
    expect(isValidNotificationEmail("a@b")).toBe(false)
    expect(isValidNotificationEmail("john doe@x.fr")).toBe(false)
    expect(isValidNotificationEmail("client@exemple.fr")).toBe(true)
  })
})

/* ------------------------------ Opt-out ------------------------------ */
describe("Désinscription demande d'avis", () => {
  const SECRET = "test-secret-for-hmac-0123456789"
  const url = (c: number, e: string, t: string) =>
    `https://example.test/api/notifications/review-opt-out?c=${c}&e=${encodeURIComponent(e)}&t=${t}`

  it("token lié au tenant et à l'email", () => {
    const t = makeOptOutToken(1, "a@x.fr", SECRET)
    expect(verifyOptOutToken(1, "a@x.fr", t, SECRET)).toBe(true)
    expect(verifyOptOutToken(2, "a@x.fr", t, SECRET)).toBe(false)
    expect(verifyOptOutToken(1, "b@x.fr", t, SECRET)).toBe(false)
  })

  it("GET valide => page de confirmation, aucune écriture, aucun token/email dans la page", async () => {
    process.env.BETTER_AUTH_SECRET = SECRET
    const t = makeOptOutToken(1, "a@x.fr", SECRET)
    const { GET } = await import("@/app/api/notifications/review-opt-out/route")
    const res = await GET(new Request(url(1, "a@x.fr", t)))
    const html = await res.text()
    expect(res.status).toBe(200)
    expect(html).toContain("Ne plus recevoir les demandes d’avis")
    expect(html).toContain('method="post"')
    expect(html).not.toContain(t)
    expect(html).not.toContain("a@x.fr")
    expect(html).not.toMatch(/<script|<img|<link/i)
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(res.headers.get("referrer-policy")).toBe("no-referrer")
    expect(recordReviewOptOut).not.toHaveBeenCalled()
  })

  it("GET invalide => 400, aucune écriture", async () => {
    process.env.BETTER_AUTH_SECRET = SECRET
    const { GET } = await import("@/app/api/notifications/review-opt-out/route")
    const res = await GET(new Request(url(1, "a@x.fr", "A".repeat(32))))
    expect(res.status).toBe(400)
    expect(recordReviewOptOut).not.toHaveBeenCalled()
  })

  it("POST token valide => opt-out enregistré pour le bon tenant/email", async () => {
    process.env.BETTER_AUTH_SECRET = SECRET
    recordReviewOptOut.mockResolvedValue({ ok: true, alreadyOptedOut: false })
    const t = makeOptOutToken(7, "A@X.fr", SECRET)
    const { POST } = await import("@/app/api/notifications/review-opt-out/route")
    const res = await POST(new Request(url(7, "A@X.fr", t), { method: "POST" }))
    expect(res.status).toBe(200)
    expect(await res.text()).toContain("Votre préférence a bien été enregistrée.")
    expect(recordReviewOptOut).toHaveBeenCalledWith(7, "a@x.fr")
  })

  it("POST répété => même réponse (idempotent, ne révèle rien)", async () => {
    process.env.BETTER_AUTH_SECRET = SECRET
    const t = makeOptOutToken(7, "a@x.fr", SECRET)
    const { POST } = await import("@/app/api/notifications/review-opt-out/route")
    recordReviewOptOut.mockResolvedValueOnce({ ok: true, alreadyOptedOut: false })
    const first = await (await POST(new Request(url(7, "a@x.fr", t), { method: "POST" }))).text()
    recordReviewOptOut.mockResolvedValueOnce({ ok: true, alreadyOptedOut: true })
    const second = await (await POST(new Request(url(7, "a@x.fr", t), { method: "POST" }))).text()
    expect(second).toBe(first)
  })

  it.each([
    ["token tenant A utilisé pour tenant B", 2, "a@x.fr"],
    ["token email A utilisé pour email B", 1, "b@x.fr"],
  ])("POST %s => refus, aucune écriture", async (_l, c, e) => {
    process.env.BETTER_AUTH_SECRET = SECRET
    const tA = makeOptOutToken(1, "a@x.fr", SECRET)
    const { POST } = await import("@/app/api/notifications/review-opt-out/route")
    const res = await POST(new Request(url(c as number, e as string, tA), { method: "POST" }))
    expect(res.status).toBe(400)
    expect(recordReviewOptOut).not.toHaveBeenCalled()
  })

  it("secret absent => refus, aucune écriture", async () => {
    delete process.env.BETTER_AUTH_SECRET
    const t = makeOptOutToken(1, "a@x.fr", SECRET)
    const { POST } = await import("@/app/api/notifications/review-opt-out/route")
    const res = await POST(new Request(url(1, "a@x.fr", t), { method: "POST" }))
    expect(res.status).toBe(400)
    expect(recordReviewOptOut).not.toHaveBeenCalled()
  })

  it("aucun log dans la route d'opt-out", () => {
    expect(src("app/api/notifications/review-opt-out/route.ts")).not.toMatch(/console\./)
  })
})

/* ------------------- Éligibilité, anti-rétroactif, anti-doublon ------------------- */
describe("Éligibilité / fenêtre / concurrence (outbox)", () => {
  const outbox = src("lib/notifications/outbox.ts")
  it("demande d'avis uniquement si completed + completed_at non null", () => {
    expect(outbox).toContain("status = 'completed' AND completed_at IS NOT NULL")
  })
  it("rappel pro uniquement pour bookings confirmés", () => {
    expect(outbox).toContain("status = 'confirmed'")
  })
  it("fenêtre manquée => missed (jamais de rattrapage)", () => {
    const sendAt = new Date("2026-07-10T10:00:00Z")
    expect(sendWindowState(new Date(sendAt.getTime() - 1000), sendAt)).toBe("early")
    expect(sendWindowState(sendAt, sendAt)).toBe("due")
    expect(sendWindowState(new Date(sendAt.getTime() + MAX_SEND_LATENESS_MS + 1), sendAt)).toBe("missed")
  })
  it("claim atomique : états terminaux et 'sending' jamais réclamés", () => {
    expect(outbox).toMatch(/NOT IN \('sent', 'simulated', 'sending', 'invalid', 'skipped'\)/)
  })
  it("logs du cron sans email ni lien complet", () => {
    const lines = outbox.split("\n").filter((l) => l.includes("console."))
    for (const l of lines) expect(l).not.toMatch(/recipient|email|reviewUrl|optOutUrl/i)
  })
})
