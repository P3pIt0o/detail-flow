import { readFileSync } from "node:fs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { PgDialect } from "drizzle-orm/pg-core"

const afterMock = vi.hoisted(() => vi.fn())
vi.mock("next/server", () => ({ after: afterMock }))

import { enqueueEmailSafely } from "@/lib/customer-subscriptions/email-events"
import { scheduleImmediateEmailDrain, runImmediateDrain } from "@/lib/customer-subscriptions/email-drain-now"
import { claimDueEmails } from "@/lib/customer-subscriptions/email-outbox"
import { isReminderDue, reminderSendAt, sendWindowState } from "@/lib/notifications/schedule"
import type { Executor } from "@/lib/customer-subscriptions/engine"

const input = (companyId: number, key: string) => ({
  companyId,
  type: "request_received" as const,
  recipientRole: "client" as const,
  dedupeKey: key,
})

/** Faux exécuteur : `inserted` = lignes renvoyées par l'INSERT (vide = doublon). */
function fakeTx(inserted: Array<{ id: number }>): Executor {
  const chain = { values: () => chain, onConflictDoNothing: () => chain, returning: async () => inserted }
  const sp = { insert: () => chain }
  return { transaction: async (fn: (s: unknown) => unknown) => fn(sp) } as unknown as Executor
}

describe("L81 — crons", () => {
  const cfg = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: Array<{ path: string; schedule: string }> }
  const sched = (path: string) => cfg.crons.find((c) => c.path === path)?.schedule
  it("e-mails abonnements : filet horaire", () => expect(sched("/api/cron/customer-subscription-emails")).toBe("0 * * * *"))
  it("notifications : toutes les 30 minutes", () => expect(sched("/api/cron/notifications")).toBe("*/30 * * * *"))
  it("rappel quotidien inchangé", () => expect(sched("/api/cron/reminders")).toBe("0 9 * * *"))
})

describe("L81 — envoi immédiat", () => {
  beforeEach(() => {
    afterMock.mockReset()
  })

  it("planifie un envoi après la mise en file", async () => {
    const r = await enqueueEmailSafely(fakeTx([{ id: 1 }]), input(901, "l81:a"))
    expect(r.enqueued).toBe(true)
    expect(afterMock).toHaveBeenCalledTimes(1)
  })

  it("rien de planifié si l'e-mail est un doublon", async () => {
    const r = await enqueueEmailSafely(fakeTx([]), input(902, "l81:dup"))
    expect(r.enqueued).toBe(false)
    expect(afterMock).not.toHaveBeenCalled()
  })

  it("un seul envoi planifié par tenant en attente", async () => {
    await enqueueEmailSafely(fakeTx([{ id: 1 }]), input(903, "l81:1"))
    await enqueueEmailSafely(fakeTx([{ id: 2 }]), input(903, "l81:2"))
    await enqueueEmailSafely(fakeTx([{ id: 3 }]), input(904, "l81:3"))
    expect(afterMock).toHaveBeenCalledTimes(2)
  })

  it("échec de planification (hors requête) : aucune erreur, réessai possible", async () => {
    afterMock.mockImplementation(() => {
      throw new Error("outside request scope")
    })
    await expect(enqueueEmailSafely(fakeTx([{ id: 1 }]), input(905, "l81:x"))).resolves.toEqual({ enqueued: true })
    afterMock.mockReset()
    scheduleImmediateEmailDrain(905)
    expect(afterMock).toHaveBeenCalledTimes(1)
  })

  it("un e-mail mis en file pendant un drain en cours planifie un nouveau drain", () => {
    scheduleImmediateEmailDrain(907)
    expect(afterMock).toHaveBeenCalledTimes(1)
    vi.spyOn(console, "log").mockImplementation(() => {})
    void runImmediateDrain(907) // drain démarré (callback `after` exécuté)
    scheduleImmediateEmailDrain(907)
    expect(afterMock).toHaveBeenCalledTimes(2)
  })

  it("une planification jamais exécutée expire après le délai de sécurité", () => {
    const now = vi.spyOn(Date, "now")
    now.mockReturnValue(1_000_000)
    scheduleImmediateEmailDrain(908)
    scheduleImmediateEmailDrain(908)
    expect(afterMock).toHaveBeenCalledTimes(1)
    now.mockReturnValue(1_000_000 + 61_000)
    scheduleImmediateEmailDrain(908)
    expect(afterMock).toHaveBeenCalledTimes(2)
    now.mockRestore()
  })

  it("l'échec de l'envoi immédiat est avalé", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {})
    // Sans base ni module e-mail configurés dans ce test, le drain échoue : ne doit jamais lever.
    await expect(runImmediateDrain(906)).resolves.toBeUndefined()
  })
})

describe("L81 — le drain ne touche que le tenant demandé", () => {
  const render = async (companyId?: number) => {
    let captured: unknown
    const db = { execute: async (q: unknown) => ((captured = q), { rows: [] }) } as unknown as Executor
    await claimDueEmails(db, new Date("2026-01-01T10:00:00Z"), 10, companyId)
    return new PgDialect().sqlToQuery(captured as never)
  }
  it("filtre par companyId quand fourni", async () => {
    const q = await render(7)
    expect(q.sql).toContain(`"companyId" =`)
    expect(q.params).toContain(7)
  })
  it("comportement par défaut (cron) inchangé : pas de filtre tenant", async () => {
    const q = await render()
    expect(q.sql).not.toContain(`"companyId"`)
  })
  it("claim atomique conservé", async () => {
    expect((await render(7)).sql).toContain("FOR UPDATE SKIP LOCKED")
  })
})

describe("L81 — rappels avec un cron toutes les 30 minutes", () => {
  const HOUR = 3600_000
  const STEP = 30 * 60_000
  const start = new Date("2026-06-10T14:07:00Z")

  /** Simule le cron toutes les 30 min, avec le marquage « envoyé » du vrai moteur. */
  function simulate(offsetHours: number) {
    const sendAt = reminderSendAt(start, offsetHours)
    let sent = 0
    for (let t = sendAt.getTime() - 3 * HOUR; t < start.getTime() + HOUR; t += STEP) {
      const now = new Date(t + 11 * 60_000) // décalage arbitraire du cron
      if (sent === 0 && isReminderDue(now, sendAt, start) && sendWindowState(now, sendAt) === "due") sent++
    }
    return sent
  }

  it.each([1, 2, 24])("rappel %i h avant : envoyé exactement une fois", (h) => {
    expect(simulate(h)).toBe(1)
  })

  it("bornes : +59 min et +61 min avant le RDV", () => {
    for (const minutes of [59, 61]) {
      const sendAt = reminderSendAt(start, 1)
      const now = new Date(start.getTime() - minutes * 60_000)
      expect(sendWindowState(now, sendAt)).toBe(minutes === 59 ? "due" : "early")
    }
  })

  it("le retard maximal d'un pas de 30 min reste dans la fenêtre de grâce (2 h)", () => {
    const sendAt = reminderSendAt(start, 2)
    expect(sendWindowState(new Date(sendAt.getTime() + STEP), sendAt)).toBe("due")
  })
})
