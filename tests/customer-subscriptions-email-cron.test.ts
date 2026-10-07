import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const drain = vi.fn()
const sendEmail = vi.fn()
const sendReminderEmail = vi.fn()
const sendSms = vi.fn()
const cleanupOrphanQuotePhotos = vi.fn()

vi.mock("@/lib/db", () => ({ db: { __db: true } }))
vi.mock("@/lib/customer-subscriptions/notifications", () => ({ drainCustomerSubscriptionOutbox: drain }))
vi.mock("@/lib/email/send", () => ({ sendEmail }))
vi.mock("@/lib/email/notifications", () => ({ sendReminderEmail }))
vi.mock("@/lib/sms/send", () => ({ sendSms }))
vi.mock("@/lib/quote-photos/server", () => ({ cleanupOrphanQuotePhotos }))

const URL = "https://www.detailflow.fr/api/cron/customer-subscription-emails"
const call = async (headers: Record<string, string> = {}) => {
  const { GET } = await import("@/app/api/cron/customer-subscription-emails/route")
  return GET(new Request(URL, { headers }))
}

describe("cron /api/cron/customer-subscription-emails", () => {
  const original = process.env.CRON_SECRET
  beforeEach(() => {
    vi.clearAllMocks()
    drain.mockResolvedValue({ sent: 2, failed: 1, skipped: 3 })
  })
  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = original
  })

  it("CRON_SECRET configuré + Authorization absent → 401, drain non appelé", async () => {
    process.env.CRON_SECRET = "s3cret"
    const res = await call()
    expect(res.status).toBe(401)
    expect(drain).not.toHaveBeenCalled()
  })

  it("mauvais Authorization → 401", async () => {
    process.env.CRON_SECRET = "s3cret"
    const res = await call({ authorization: "Bearer wrong" })
    expect(res.status).toBe(401)
    expect(drain).not.toHaveBeenCalled()
  })

  it("bon Authorization → drain appelé avec db, limit 100, JSON sent/failed/skipped", async () => {
    process.env.CRON_SECRET = "s3cret"
    const res = await call({ authorization: "Bearer s3cret" })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, sent: 2, failed: 1, skipped: 3 })
    expect(drain).toHaveBeenCalledTimes(1)
    const [dbArg, sender, now, opts] = drain.mock.calls[0]
    expect(dbArg).toEqual({ __db: true })
    expect(now).toBeInstanceOf(Date)
    expect(opts).toEqual({ limit: 100 })
    await sender({ to: "a@b.fr" })
    expect(sendEmail).toHaveBeenCalledWith({ to: "a@b.fr" })
  })

  it("CRON_SECRET absent → fail-closed 503, aucun traitement", async () => {
    delete process.env.CRON_SECRET
    const res = await call({ authorization: "Bearer anything" })
    expect(res.status).toBe(503)
    expect(drain).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it("aucune logique Booking / SMS / photos appelée", async () => {
    process.env.CRON_SECRET = "s3cret"
    await call({ authorization: "Bearer s3cret" })
    expect(sendReminderEmail).not.toHaveBeenCalled()
    expect(sendSms).not.toHaveBeenCalled()
    expect(cleanupOrphanQuotePhotos).not.toHaveBeenCalled()
    const src = readFileSync(join(process.cwd(), "app/api/cron/customer-subscription-emails/route.ts"), "utf8")
    const imports = src.split("\n").filter((line) => line.startsWith("import "))
    expect(imports).toHaveLength(5)
    for (const line of imports) expect(line).not.toMatch(/bookings|sms|stripe|quote-photos|reminder|schema/i)
  })

  it("échec du drain → 500 sans fuite d'erreur", async () => {
    process.env.CRON_SECRET = "s3cret"
    drain.mockRejectedValueOnce(new Error("db down"))
    const res = await call({ authorization: "Bearer s3cret" })
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ ok: false })
  })

  it("vercel.json conserve le cron reminders quotidien et ajoute le cron emails */5", () => {
    const cfg = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8"))
    expect(cfg.crons).toContainEqual({ path: "/api/cron/reminders", schedule: "0 9 * * *" })
    expect(cfg.crons).toContainEqual({ path: "/api/cron/customer-subscription-emails", schedule: "*/5 * * * *" })
  })
})
