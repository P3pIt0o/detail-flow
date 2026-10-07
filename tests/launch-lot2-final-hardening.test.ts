import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const dbState: { execute: (q: unknown) => Promise<unknown> } = {
  execute: async () => ({ rows: [], rowCount: 0 }),
}
const executeSpy = vi.fn((q: unknown) => dbState.execute(q))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({ db: { execute: (q: unknown) => executeSpy(q) } }))

const sendEmailMock = vi.fn()
vi.mock("@/lib/email/send", () => ({ sendEmail: (...a: unknown[]) => sendEmailMock(...a) }))

import {
  evaluateNotificationsSchema,
  LOTD_REQUIRED_COLUMNS,
  LOTD_REQUIRED_UNIQUE_INDEXES,
  type SchemaColumnRow,
  type SchemaIndexRow,
} from "@/lib/notifications/schema-requirements"
import {
  notificationsSchemaReady,
  saveReviewRequestSettings,
  saveProReminderSettings,
} from "@/lib/notifications/settings-store"
import { checkReviewOptOut, isReviewOptedOut } from "@/lib/notifications/opt-out-store"
import {
  emailInfrastructureReady,
  optOutInfrastructureReady,
  proReminderInfrastructureReady,
  reviewRequestInfrastructureReady,
} from "@/lib/notifications/runtime"
import { checkProReminderActivation, checkReviewRequestActivation } from "@/lib/notifications/activation"
import { reviewRequestEmail, type BookingEmailData } from "@/lib/email/templates"

const root = join(__dirname, "..")
const src = (p: string) => readFileSync(join(root, p), "utf8")

function fullColumns(): SchemaColumnRow[] {
  return Object.entries(LOTD_REQUIRED_COLUMNS).flatMap(([table_name, cols]) =>
    cols.map((column_name) => ({ table_name, column_name })),
  )
}
function fullIndexes(): SchemaIndexRow[] {
  return LOTD_REQUIRED_UNIQUE_INDEXES.map((indexname) => ({
    indexname,
    indexdef: `CREATE UNIQUE INDEX ${indexname} ON x (a)`,
  }))
}

const READY_ENV = {
  NOTIFICATIONS_ENABLED: "true",
  RESEND_API_KEY: "re_test",
  EMAIL_FROM: "DetailFlow <noreply@detailflow.fr>",
  BETTER_AUTH_SECRET: "s".repeat(32),
  NEXT_PUBLIC_SITE_URL: "https://detailflow.fr",
} as unknown as NodeJS.ProcessEnv

beforeEach(() => {
  executeSpy.mockClear()
  sendEmailMock.mockReset()
  dbState.execute = async () => ({ rows: [], rowCount: 0 })
})

describe("Schéma LOT D prêt (source unique)", () => {
  it("tout présent => true", () => {
    expect(evaluateNotificationsSchema(fullColumns(), fullIndexes())).toBe(true)
  })
  it("settings seules => false", () => {
    const cols = fullColumns().filter((c) => c.table_name === "settings")
    expect(evaluateNotificationsSchema(cols, fullIndexes())).toBe(false)
  })
  it("completed_at absent => false", () => {
    const cols = fullColumns().filter((c) => !(c.table_name === "bookings" && c.column_name === "completed_at"))
    expect(evaluateNotificationsSchema(cols, fullIndexes())).toBe(false)
  })
  it("outbox absente => false", () => {
    const cols = fullColumns().filter((c) => c.table_name !== "notification_outbox")
    expect(evaluateNotificationsSchema(cols, fullIndexes())).toBe(false)
  })
  it("outbox partielle (colonne manquante) => false", () => {
    const cols = fullColumns().filter((c) => !(c.table_name === "notification_outbox" && c.column_name === "attempts"))
    expect(evaluateNotificationsSchema(cols, fullIndexes())).toBe(false)
  })
  it("opt-out absente => false", () => {
    const cols = fullColumns().filter((c) => c.table_name !== "notification_opt_outs")
    expect(evaluateNotificationsSchema(cols, fullIndexes())).toBe(false)
  })
  it("index unique outbox absent => false", () => {
    const idx = fullIndexes().filter((i) => i.indexname !== "notification_outbox_dedup_idx")
    expect(evaluateNotificationsSchema(fullColumns(), idx)).toBe(false)
  })
  it("index opt-out absent => false", () => {
    const idx = fullIndexes().filter((i) => i.indexname !== "notification_opt_outs_uniq_idx")
    expect(evaluateNotificationsSchema(fullColumns(), idx)).toBe(false)
  })
  it("index présent mais non UNIQUE => false", () => {
    const idx = fullIndexes().map((i) => ({ ...i, indexdef: `CREATE INDEX ${i.indexname} ON x (a)` }))
    expect(evaluateNotificationsSchema(fullColumns(), idx)).toBe(false)
  })
  it("notificationsSchemaReady : exception DB => false", async () => {
    dbState.execute = async () => {
      throw new Error("boom")
    }
    await expect(notificationsSchemaReady()).resolves.toBe(false)
  })
  it("notificationsSchemaReady : DB complète => true", async () => {
    dbState.execute = async (q) => {
      const text = JSON.stringify(q)
      return text.includes("pg_indexes") ? { rows: fullIndexes() } : { rows: fullColumns() }
    }
    await expect(notificationsSchemaReady()).resolves.toBe(true)
  })
  it("le code LOT D n'utilise plus lotDColumnsExist comme preuve de disponibilité", () => {
    expect(src("lib/notifications/outbox.ts")).toContain("notificationsSchemaReady")
    expect(src("app/admin/(dashboard)/parametres/page.tsx")).toContain("notificationsSchemaReady()")
    expect(src("app/admin/(dashboard)/parametres/page.tsx")).not.toContain("lotDColumnsExist")
  })
})

describe("Infrastructure serveur (booléens uniquement)", () => {
  it("tout prêt => true", () => {
    expect(proReminderInfrastructureReady(READY_ENV)).toBe(true)
    expect(reviewRequestInfrastructureReady(READY_ENV)).toBe(true)
  })
  it("runtime off => false", () => {
    const env = { ...READY_ENV, NOTIFICATIONS_ENABLED: "false" }
    expect(proReminderInfrastructureReady(env)).toBe(false)
    expect(reviewRequestInfrastructureReady(env)).toBe(false)
  })
  it("fournisseur email incomplet => false", () => {
    expect(emailInfrastructureReady({ ...READY_ENV, RESEND_API_KEY: "" })).toBe(false)
    expect(emailInfrastructureReady({ ...READY_ENV, EMAIL_FROM: "pas-un-email" })).toBe(false)
    expect(proReminderInfrastructureReady({ ...READY_ENV, RESEND_API_KEY: "" })).toBe(false)
  })
  it("opt-out indisponible => avis refusé, rappel pro non impacté", () => {
    const env = { ...READY_ENV, BETTER_AUTH_SECRET: "" }
    expect(optOutInfrastructureReady(env)).toBe(false)
    expect(reviewRequestInfrastructureReady(env)).toBe(false)
    expect(proReminderInfrastructureReady(env)).toBe(true)
  })
  it("UI client : aucun nom de variable système", () => {
    const ui = src("components/admin/settings/notifications-settings.tsx")
    for (const v of ["RESEND_API_KEY", "BETTER_AUTH_SECRET", "EMAIL_FROM", "NOTIFICATIONS_ENABLED"]) {
      expect(ui).not.toContain(v)
    }
  })
})

describe("Activation / désactivation", () => {
  const base = { licensed: true, runtimeEnabled: true, alreadyEnabled: false }
  const link = { placeId: null, manualLink: "https://g.page/r/abc/review" }
  it("FREE => refus", () => {
    expect(checkProReminderActivation({ ...base, licensed: false, enabled: true, businessEmail: "a@b.fr" }).ok).toBe(false)
    expect(checkReviewRequestActivation({ ...base, licensed: false, enabled: true, ...link }).ok).toBe(false)
  })
  it("runtime/infrastructure off => nouvelle activation refusée", () => {
    expect(checkProReminderActivation({ ...base, runtimeEnabled: false, enabled: true, businessEmail: "a@b.fr" }).ok).toBe(false)
    expect(checkReviewRequestActivation({ ...base, runtimeEnabled: false, enabled: true, ...link }).ok).toBe(false)
  })
  it("lien externe / sans lien => activation avis refusée", () => {
    expect(checkReviewRequestActivation({ ...base, enabled: true, placeId: null, manualLink: "https://evil.com/x" }).ok).toBe(false)
    expect(checkReviewRequestActivation({ ...base, enabled: true, placeId: null, manualLink: null }).ok).toBe(false)
  })
  it("PRO + tout prêt => accepté", () => {
    expect(checkProReminderActivation({ ...base, enabled: true, businessEmail: "pro@garage.fr" }).ok).toBe(true)
    expect(checkReviewRequestActivation({ ...base, enabled: true, ...link }).ok).toBe(true)
  })
  it("actions serveur : runtime = flag + infrastructure email (+ opt-out pour avis)", () => {
    const a = src("app/admin/(dashboard)/parametres/notifications-actions.ts")
    expect(a).toContain("runtimeEnabled: proReminderInfrastructureReady()")
    expect(a).toContain("runtimeEnabled: reviewRequestInfrastructureReady()")
  })
  it("désactivation toujours possible (licence, runtime, email, lien)", () => {
    const worst = { licensed: false, runtimeEnabled: false, alreadyEnabled: true, enabled: false }
    expect(checkProReminderActivation({ ...worst, businessEmail: null }).ok).toBe(true)
    expect(checkReviewRequestActivation({ ...worst, placeId: null, manualLink: "javascript:x" }).ok).toBe(true)
  })
  it("saveReviewRequestSettings disabled + lien invalide => succès, lien et offset conservés", async () => {
    const queries: string[] = []
    dbState.execute = async (q) => {
      queries.push(JSON.stringify(q))
      return { rows: [{}, {}, {}, {}, {}], rowCount: 1 }
    }
    const r = await saveReviewRequestSettings(7, false, 48, "javascript:alert(1)")
    expect(r.ok).toBe(true)
    const update = queries.find((q) => q.includes("UPDATE settings")) ?? ""
    expect(update).toContain("review_request_enabled = false")
    expect(update).not.toContain("review_request_link")
    expect(update).not.toContain("review_request_offset_hours")
  })
  it("saveReviewRequestSettings disabled + lien null => succès", async () => {
    dbState.execute = async () => ({ rows: [{}, {}, {}, {}, {}], rowCount: 1 })
    expect((await saveReviewRequestSettings(7, false, 24, null)).ok).toBe(true)
  })
  it("saveReviewRequestSettings disabled + colonnes absentes => succès sans écriture", async () => {
    dbState.execute = async () => ({ rows: [], rowCount: 0 })
    expect((await saveReviewRequestSettings(7, false, 24, null)).ok).toBe(true)
  })
  it("saveReviewRequestSettings enabled + lien invalide => refus", async () => {
    dbState.execute = async () => ({ rows: [], rowCount: 1 })
    expect((await saveReviewRequestSettings(7, true, 24, "https://evil.com/review")).ok).toBe(false)
  })
  it("saveReviewRequestSettings enabled + schéma partiel => refus migration", async () => {
    dbState.execute = async () => ({ rows: [], rowCount: 1 })
    const r = await saveReviewRequestSettings(7, true, 24, "https://g.page/r/abc/review")
    expect(r).toMatchObject({ ok: false, migrationRequired: true })
  })
  it("saveProReminderSettings disabled => succès sans dépendre de l'email pro", async () => {
    dbState.execute = async () => ({ rows: [{}, {}, {}, {}, {}], rowCount: 1 })
    expect((await saveProReminderSettings(7, false, 2)).ok).toBe(true)
  })
  it("UPDATE scopé par companyId (aucun cross-tenant)", () => {
    const s = src("lib/notifications/settings-store.ts")
    const updates = s.match(/UPDATE settings[\s\S]*?WHERE "companyId" = \$\{companyId\}/g) ?? []
    expect(updates.length).toBeGreaterThanOrEqual(3)
  })
})

describe("Opposition : panne DB ≠ « pas désinscrit »", () => {
  it("erreur DB => unavailable (et isReviewOptedOut fail-closed)", async () => {
    dbState.execute = async () => {
      throw new Error("db down")
    }
    await expect(checkReviewOptOut(1, "a@b.fr")).resolves.toBe("unavailable")
    await expect(isReviewOptedOut(1, "a@b.fr")).resolves.toBe(true)
  })
  it("opposition existante => opted_out", async () => {
    dbState.execute = async () => ({ rows: [{ "?column?": 1 }] })
    await expect(checkReviewOptOut(1, "a@b.fr")).resolves.toBe("opted_out")
  })
  it("aucune opposition => not_opted_out", async () => {
    dbState.execute = async () => ({ rows: [] })
    await expect(checkReviewOptOut(1, "a@b.fr")).resolves.toBe("not_opted_out")
  })
  it("entrée invalide => unavailable sans requête", async () => {
    await expect(checkReviewOptOut(0, "a@b.fr")).resolves.toBe("unavailable")
    expect(executeSpy).not.toHaveBeenCalled()
  })
  it("outbox : unavailable => aucun claim/envoi, pas d'état terminal", () => {
    const s = src("lib/notifications/outbox.ts")
    const block = s.slice(s.indexOf('if (optOut === "unavailable")'), s.indexOf('if (optOut === "opted_out")'))
    expect(block).toContain("continue")
    expect(block).not.toMatch(/recordSkip|claim\(|sendReviewRequestEmail/)
  })
})

describe("Demande d'avis : lien de désinscription obligatoire", () => {
  const prev = { ...process.env }
  beforeEach(() => {
    process.env.NOTIFICATIONS_ENABLED = "true"
  })
  afterEach(() => {
    process.env = { ...prev }
  })
  it("optOutUrl vide => aucun appel fournisseur, failed opt_out_url_unavailable", async () => {
    const { sendReviewRequestEmail } = await import("@/lib/email/notifications")
    const r = await sendReviewRequestEmail(1, { reviewUrl: "https://g.page/r/x/review", optOutUrl: "" })
    expect(r).toEqual({ state: "failed", reason: "opt_out_url_unavailable" })
    expect(sendEmailMock).not.toHaveBeenCalled()
    expect(executeSpy).not.toHaveBeenCalled()
  })
  it("optOutUrl null (runtime) => aucun appel fournisseur", async () => {
    const { sendReviewRequestEmail } = await import("@/lib/email/notifications")
    const r = await sendReviewRequestEmail(1, {
      reviewUrl: "https://g.page/r/x/review",
      optOutUrl: null as unknown as string,
    })
    expect(r.reason).toBe("opt_out_url_unavailable")
    expect(sendEmailMock).not.toHaveBeenCalled()
  })
  it("reviewUrl absent => aucun appel fournisseur", async () => {
    const { sendReviewRequestEmail } = await import("@/lib/email/notifications")
    const r = await sendReviewRequestEmail(1, { reviewUrl: "", optOutUrl: "https://detailflow.fr/x" })
    expect(r.state).not.toBe("sent")
    expect(sendEmailMock).not.toHaveBeenCalled()
  })
  it("template envoyé contient « Se désinscrire »", () => {
    const data = {
      reference: "R1",
      customerName: "Client",
      date: "2026-10-07",
      startTime: "10:00",
      endTime: "11:00",
      totalDurationMin: 60,
      address: "1 rue X",
      items: [],
      servicesCents: 0,
      optionsCents: 0,
      travelFeeCents: 0,
      totalCents: 0,
      depositCents: 0,
      businessName: "Garage",
    } as unknown as BookingEmailData
    const out = reviewRequestEmail(data, {
      reviewUrl: "https://g.page/r/x/review",
      optOutUrl: "https://detailflow.fr/api/notifications/review-opt-out?t=1",
    })
    const html = out.html
    expect(html).toContain("Se désinscrire")
    expect(html).toContain("review-opt-out")
  })
  it("outbox : contrôle optOutUrl HTTPS avant tout envoi", () => {
    const s = src("lib/notifications/outbox.ts")
    const guard = s.indexOf("isHttpsUrl(optOutUrl)")
    const send = s.indexOf("sendReviewRequestEmail(b.id")
    expect(guard).toBeGreaterThan(0)
    expect(guard).toBeLessThan(send)
  })
})

describe("Confidentialité / codes bornés", () => {
  const ALLOWED = [
    "provider_error",
    "booking_not_found",
    "invalid_recipient",
    "no_review_link",
    "opt_out_url_unavailable",
    "notifications_disabled",
    "exception",
  ]
  it("aucun message fournisseur brut (res.error) recopié dans LOT D", () => {
    const s = src("lib/email/notifications.ts")
    const lotD = s.slice(s.indexOf("export function notificationsRealSendEnabled"))
    expect(lotD).not.toMatch(/reason:\s*res\.error/)
    expect(lotD).not.toMatch(/String\(res\.error|res\.error\s*\?\?/)
    const reasons = [...lotD.matchAll(/reason:\s*"([a-z_]+)"/g)].map((m) => m[1])
    expect(reasons.length).toBeGreaterThan(0)
    for (const r of reasons) expect(ALLOWED).toContain(r)
  })
  it("logs LOT D sans email/token/lien", () => {
    for (const f of [
      "lib/notifications/outbox.ts",
      "lib/notifications/opt-out-store.ts",
      "lib/notifications/settings-store.ts",
      "app/api/notifications/review-opt-out/route.ts",
      "app/api/cron/notifications/route.ts",
    ]) {
      const lines = src(f).split("\n").filter((l) => /console\.(log|error|warn)/.test(l))
      for (const l of lines) expect(l).not.toMatch(/recipient|email|token|reviewUrl|optOutUrl|authorization/i)
    }
  })
  it("migration SQL : additive, sans DROP/DELETE/backfill", () => {
    const sqlText = src("scripts/lot-d-reminders-reviews-migration.sql")
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n")
    expect(sqlText).not.toMatch(/\bDROP\b|\bDELETE\b|\bTRUNCATE\b|\bUPDATE\b/i)
    expect(sqlText).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS notification_outbox_dedup_idx/)
    expect(sqlText).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS notification_opt_outs_uniq_idx/)
  })
})
