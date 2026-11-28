import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"

/**
 * L115 — Remboursement par le detailer, sur une VRAIE base PostgreSQL en mémoire
 * (PGlite, vraie migration `refunds`) et un Stripe simulé.
 */
vi.mock("server-only", () => ({}))

const { holder, stripe } = vi.hoisted(() => ({
  holder: { db: null as unknown as Record<string, unknown> },
  stripe: {
    calls: [] as { paymentIntentId: string; account: string; amountCents?: number; idempotencyKey?: string }[],
    impl: null as null | ((call: { amountCents?: number; idempotencyKey?: string }) => Promise<{ externalRefundId: string; providerStatus: string | null }>),
  },
}))

vi.mock("@/lib/db", () => ({
  db: new Proxy({}, { get: (_t, k) => (holder.db as Record<string | symbol, unknown>)[k] }),
}))

vi.mock("@/lib/payments/providers", () => ({
  getPaymentProvider: () => ({
    id: "stripe",
    refundPayment: async (
      paymentIntentId: string,
      account: string,
      options?: { amountCents?: number; idempotencyKey?: string },
    ) => {
      stripe.calls.push({ paymentIntentId, account, ...options })
      return stripe.impl!(options ?? {})
    },
  }),
}))

import * as schema from "@/lib/db/schema"
import {
  requestRefund,
  getBookingRefundInfo,
  applyStripeRefundEvent,
  claimRefundEmail,
} from "@/lib/payments/refunds"
import {
  validateRefundRequest,
  paymentRefundStatusLabel,
  isRetryableRefundFailure,
} from "@/lib/payments/refund-logic"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

let pg: PGlite
let seq = 0
const key = () => `l115-key-${++seq}-xxxxxxxx`

type Seed = { companyId: number; bookingId: number; paymentId: number; account: string; pi: string }

async function seed(gross = 3000): Promise<Seed> {
  const n = ++seq
  const account = `acct_${n}`
  const pi = `pi_${n}`
  const c = await pg.query<{ id: number }>(`INSERT INTO companies ("stripeAccountId") VALUES ($1) RETURNING id`, [account])
  const companyId = c.rows[0].id
  const b = await pg.query<{ id: number }>(`INSERT INTO bookings ("companyId") VALUES ($1) RETURNING id`, [companyId])
  const bookingId = b.rows[0].id
  const p = await pg.query<{ id: number }>(
    `INSERT INTO payments ("companyId","bookingId",type,status,"grossAmountCents","platformFeeBps","platformFeeAmountCents",meta,"paidAt")
     VALUES ($1,$2,'deposit','paid',$3,0,0,$4::jsonb,now()) RETURNING id`,
    [companyId, bookingId, gross, JSON.stringify({ paymentIntentId: pi })],
  )
  return { companyId, bookingId, paymentId: p.rows[0].id, account, pi }
}

const ask = (s: Seed, amountCents: number, idempotencyKey = key(), reason = "Annulation client") =>
  requestRefund({
    bookingId: s.bookingId,
    paymentId: s.paymentId,
    companyId: s.companyId,
    amountCents,
    reason,
    initiatedByUserId: "u-owner",
    idempotencyKey,
  })

const payment = async (id: number) =>
  (await pg.query<{ status: string; refundedAmountCents: number }>(`SELECT status, "refundedAmountCents" FROM payments WHERE id = $1`, [id])).rows[0]
const refundRows = async (paymentId: number) =>
  (await pg.query<{ id: number; status: string; amountCents: number; reason: string; externalRefundId: string | null }>(
    `SELECT id, status, "amountCents", reason, "externalRefundId" FROM refunds WHERE "paymentId" = $1 ORDER BY id`,
    [paymentId],
  )).rows

let reCounter = 0
const succeedNow = () => {
  stripe.impl = async () => ({ externalRefundId: `re_${++reCounter}`, providerStatus: "succeeded" })
}

beforeAll(async () => {
  pg = new PGlite()
  await pg.exec(`
    CREATE TABLE companies (id serial PRIMARY KEY, "stripeAccountId" text);
    CREATE TABLE bookings (id serial PRIMARY KEY, "companyId" integer NOT NULL);
    CREATE TABLE payments (id serial PRIMARY KEY, "companyId" integer NOT NULL REFERENCES companies(id), "bookingId" integer NOT NULL REFERENCES bookings(id),
      provider text NOT NULL DEFAULT 'stripe', "externalPaymentId" text, type text NOT NULL, status text NOT NULL DEFAULT 'pending',
      currency text NOT NULL DEFAULT 'EUR', "grossAmountCents" integer NOT NULL, "platformFeeBps" integer NOT NULL, "platformFeeAmountCents" integer NOT NULL,
      "providerFeeAmountCents" integer, "netAmountCents" integer, "refundedAmountCents" integer NOT NULL DEFAULT 0, meta jsonb,
      "createdAt" timestamp NOT NULL DEFAULT now(), "paidAt" timestamp, "failedAt" timestamp, "refundedAt" timestamp);
  `)
  await pg.exec(read("scripts/refunds-table-migration.sql"))
  holder.db = drizzle(pg, { schema }) as unknown as Record<string, unknown>
})

beforeEach(() => {
  stripe.calls.length = 0
  succeedNow()
})

describe("L115 — total, partiel, dépassement", () => {
  it("partiel puis total du reste : statuts et montants corrects", async () => {
    const s = await seed(3000)
    const r1 = await ask(s, 1000)
    expect(r1).toMatchObject({ ok: true, status: "succeeded" })
    expect(await payment(s.paymentId)).toEqual({ status: "partially_refunded", refundedAmountCents: 1000 })

    const info = await getBookingRefundInfo(s.bookingId, s.companyId)
    expect(info.payments[0].refundableCents).toBe(2000)

    const r2 = await ask(s, 2000)
    expect(r2).toMatchObject({ ok: true, status: "succeeded" })
    expect(await payment(s.paymentId)).toEqual({ status: "refunded", refundedAmountCents: 3000 })
    expect(stripe.calls.map((c) => [c.account, c.paymentIntentId, c.amountCents])).toEqual([
      [s.account, s.pi, 1000],
      [s.account, s.pi, 2000],
    ])
  })

  it("dépassement refusé, aucun appel Stripe", async () => {
    const s = await seed(3000)
    expect(await ask(s, 3001)).toEqual({ ok: false, error: "exceeds_refundable" })
    await ask(s, 3000)
    // Paiement passé à « refunded » : plus remboursable.
    expect(await ask(s, 1)).toEqual({ ok: false, error: "payment_not_refundable" })
    expect(stripe.calls).toHaveLength(1)
  })

  it("paiement remboursé en totalité : toujours lisible avec son statut et son historique", async () => {
    const s = await seed(3000)
    await ask(s, 3000)
    const info = await getBookingRefundInfo(s.bookingId, s.companyId)
    expect(info.payments).toHaveLength(1)
    expect(info.payments[0]).toMatchObject({ status: "refunded", refundedAmountCents: 3000, refundableCents: 0 })
    expect(info.payments[0].refunds).toHaveLength(1)
    expect(paymentRefundStatusLabel(info.payments[0].status)).toBe("Remboursé")
    expect(paymentRefundStatusLabel("partially_refunded")).toBe("Remboursé partiellement")
    expect(paymentRefundStatusLabel("paid")).toBeNull()
  })
})

describe("L115 — motif facultatif", () => {
  it("motif vide accepté (logique pure)", () => {
    expect(
      validateRefundRequest({ paymentStatus: "paid", grossAmountCents: 1000, reservedCents: 0, amountCents: 100, reason: "" }),
    ).toEqual({ ok: true, amountCents: 100 })
  })

  it("motif vide accepté en base (contrainte NOT NULL respectée)", async () => {
    const s = await seed(3000)
    const r = await ask(s, 500, key(), "   ")
    expect(r).toMatchObject({ ok: true })
    const rows = await refundRows(s.paymentId)
    expect(rows[0].reason).toBe("Sans motif")
  })
})

describe("L115 — double clic et webhook rejoué", () => {
  it("même clé deux fois : un seul appel Stripe, une seule ligne", async () => {
    const s = await seed(3000)
    const k = key()
    const r1 = await ask(s, 1000, k)
    const r2 = await ask(s, 1000, k)
    expect(r1).toMatchObject({ ok: true, status: "succeeded" })
    expect(r2).toMatchObject({ ok: true, duplicate: true })
    expect(stripe.calls).toHaveLength(1)
    expect(await refundRows(s.paymentId)).toHaveLength(1)
  })

  it("webhook rejoué : aucun double comptage", async () => {
    const s = await seed(3000)
    await ask(s, 1000)
    const [row] = await refundRows(s.paymentId)
    const ev = { externalRefundId: row.externalRefundId!, paymentIntentId: s.pi, providerStatus: "succeeded", amountCents: 1000, connectedAccountId: s.account }
    await applyStripeRefundEvent(ev)
    await applyStripeRefundEvent(ev)
    expect(await payment(s.paymentId)).toEqual({ status: "partially_refunded", refundedAmountCents: 1000 })
    expect(await refundRows(s.paymentId)).toHaveLength(1)
  })
})

describe("L115 — isolation entre entreprises", () => {
  it("le tenant B ne voit ni ne rembourse un paiement du tenant A (aucun appel Stripe)", async () => {
    const a = await seed(3000)
    const b = await seed(3000)
    const r = await requestRefund({
      bookingId: a.bookingId,
      paymentId: a.paymentId,
      companyId: b.companyId,
      amountCents: 100,
      reason: "x",
      initiatedByUserId: "u-b",
      idempotencyKey: key(),
    })
    expect(r).toEqual({ ok: false, error: "payment_not_found" })
    expect(stripe.calls).toHaveLength(0)
    expect((await getBookingRefundInfo(a.bookingId, b.companyId)).payments).toEqual([])
    expect(await payment(a.paymentId)).toEqual({ status: "paid", refundedAmountCents: 0 })
  })

  it("un webhook venant du compte B ne touche pas le paiement de A", async () => {
    const a = await seed(3000)
    const b = await seed(3000)
    const res = await applyStripeRefundEvent({
      externalRefundId: "re_cross_1",
      paymentIntentId: a.pi,
      providerStatus: "succeeded",
      amountCents: 3000,
      connectedAccountId: b.account,
    })
    expect(res.matched).toBe(false)
    expect(await payment(a.paymentId)).toEqual({ status: "paid", refundedAmountCents: 0 })
  })
})

describe("L115 — solde insuffisant et nouvel essai", () => {
  it("phrase exacte, paiement inchangé, second clic = même erreur (jamais « déjà enregistré »)", async () => {
    const s = await seed(3000)
    stripe.impl = async () => {
      throw Object.assign(new Error("Insufficient funds"), { type: "invalid_request_error", code: "balance_insufficient" })
    }
    const k = key()
    expect(await ask(s, 3000, k)).toEqual({ ok: false, error: "insufficient_funds" })
    expect(await ask(s, 3000, k)).toEqual({ ok: false, error: "insufficient_funds" })
    expect(stripe.calls).toHaveLength(1)
    expect(await payment(s.paymentId)).toEqual({ status: "paid", refundedAmountCents: 0 })
    const rows = await refundRows(s.paymentId)
    expect(rows.map((r) => r.status)).toEqual(["failed"])
    expect(isRetryableRefundFailure("insufficient_funds")).toBe(false)

    // Nouvel essai avec une nouvelle clé (le navigateur la régénère) : il passe.
    succeedNow()
    expect(await ask(s, 3000)).toMatchObject({ ok: true, status: "succeeded" })
    expect(await payment(s.paymentId)).toEqual({ status: "refunded", refundedAmountCents: 3000 })

    const actions = read("app/admin/(dashboard)/reservations/[id]/actions.ts")
    expect(actions).toContain(
      "Remboursement impossible pour l'instant : le solde de votre compte de paiement est insuffisant. Réessayez après votre prochain encaissement.",
    )
  })

  it("erreur temporaire puis nouvel essai avec la même clé : un seul remboursement", async () => {
    const s = await seed(3000)
    let first = true
    stripe.impl = async () => {
      if (first) {
        first = false
        throw Object.assign(new Error("Connection reset"), { type: "api_connection_error" })
      }
      return { externalRefundId: "re_temp_1", providerStatus: "succeeded" }
    }
    const k = key()
    expect(await ask(s, 1000, k)).toEqual({ ok: false, error: "temporary" })
    expect(isRetryableRefundFailure("temporary")).toBe(true)
    // Échoué : ne réserve rien.
    expect((await getBookingRefundInfo(s.bookingId, s.companyId)).payments[0].refundableCents).toBe(3000)

    expect(await ask(s, 1000, k)).toMatchObject({ ok: true, status: "succeeded" })
    expect(stripe.calls.map((c) => c.idempotencyKey)).toEqual([k, k])
    expect(await refundRows(s.paymentId)).toHaveLength(1)
    expect(await payment(s.paymentId)).toEqual({ status: "partially_refunded", refundedAmountCents: 1000 })
  })

  it("même clé mais montant différent après une erreur temporaire : refusé, aucun appel Stripe", async () => {
    const s = await seed(3000)
    stripe.impl = async () => {
      throw Object.assign(new Error("Connection reset"), { type: "api_connection_error" })
    }
    const k = key()
    await ask(s, 1000, k)
    expect(await ask(s, 1500, k)).toEqual({ ok: false, error: "retry_amount_mismatch" })
    expect(stripe.calls).toHaveLength(1)
  })
})

describe("L115 — e-mail client et webhook en avance", () => {
  it("Stripe répond « succeeded » tout de suite : e-mail envoyé une seule fois", async () => {
    const s = await seed(3000)
    const r = await ask(s, 1000)
    expect(r).toMatchObject({ ok: true, status: "succeeded" })
    const [row] = await refundRows(s.paymentId)
    const ev = { externalRefundId: row.externalRefundId!, paymentIntentId: s.pi, providerStatus: "succeeded", amountCents: 1000, connectedAccountId: s.account }

    const applied = await applyStripeRefundEvent(ev)
    expect(applied.justSucceeded).toBe(true)
    expect(await claimRefundEmail(applied.refundId!, s.companyId)).not.toBeNull()

    const replay = await applyStripeRefundEvent(ev)
    expect(replay.justSucceeded).toBe(false)
    expect(await claimRefundEmail(applied.refundId!, s.companyId)).toBeNull()
  })

  it("l'action envoie l'e-mail dès que Stripe confirme (claim atomique = une seule fois)", () => {
    const actions = read("app/admin/(dashboard)/reservations/[id]/actions.ts")
    expect(actions).toContain("sendRefundConfirmationEmail(res.refundId, companyId)")
  })

  it("webhook arrivé avant la fin de la demande : résultat « réussi », une seule ligne", async () => {
    const s = await seed(3000)
    stripe.impl = async (call) => {
      // Le webhook « succeeded » est traité pendant que la demande attend la réponse Stripe.
      await applyStripeRefundEvent({
        externalRefundId: "re_early_1",
        paymentIntentId: s.pi,
        providerStatus: "succeeded",
        amountCents: call.amountCents ?? null,
        connectedAccountId: s.account,
      })
      return { externalRefundId: "re_early_1", providerStatus: "pending" }
    }
    const r = await ask(s, 1200)
    expect(r).toMatchObject({ ok: true, status: "succeeded" })
    const rows = await refundRows(s.paymentId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status: "succeeded", externalRefundId: "re_early_1", amountCents: 1200 })
    expect(await payment(s.paymentId)).toEqual({ status: "partially_refunded", refundedAmountCents: 1200 })
  })

  it("remboursement fait hors DetailFlow (Dashboard Stripe) : ligne créée sans casser la contrainte du motif", async () => {
    const s = await seed(3000)
    const res = await applyStripeRefundEvent({
      externalRefundId: "re_dash_1",
      paymentIntentId: s.pi,
      providerStatus: "succeeded",
      amountCents: 700,
      connectedAccountId: s.account,
    })
    expect(res.matched).toBe(true)
    expect(await payment(s.paymentId)).toEqual({ status: "partially_refunded", refundedAmountCents: 700 })
  })
})

/* Boucle de correction 1 (revue sécurité @8c5b247) */

const insertRefundRow = async (s: Seed, opts: { key: string; amountCents: number; status: string; ageMinutes: number; error?: string }) => {
  await pg.query(
    `INSERT INTO refunds ("companyId","paymentId","bookingId",provider,"amountCents",reason,status,"idempotencyKey",meta,"createdAt","updatedAt")
     VALUES ($1,$2,$3,'stripe',$4,'Annulation client',$5,$6,$7::jsonb, now() - ($8 || ' minutes')::interval, now() - ($8 || ' minutes')::interval)`,
    [s.companyId, s.paymentId, s.bookingId, opts.amountCents, opts.status, opts.key, JSON.stringify(opts.error ? { error: opts.error } : {}), String(opts.ageMinutes)],
  )
}

const fullRows = async (paymentId: number) =>
  (await pg.query<{ status: string; amountCents: number; reason: string; externalRefundId: string | null; idempotencyKey: string | null }>(
    `SELECT status, "amountCents", reason, "externalRefundId", "idempotencyKey" FROM refunds WHERE "paymentId" = $1 ORDER BY id`,
    [paymentId],
  )).rows

describe("L115 — sécu 1 : remboursement Dashboard Stripe de même montant pendant la demande", () => {
  it("le remboursement externe adopté par erreur reçoit sa propre ligne ; aucun montant perdu", async () => {
    const s = await seed(3000)
    const k = key()
    stripe.impl = async (call) => {
      // Pendant l'appel DetailFlow, un remboursement externe de 1000 arrive par webhook.
      await applyStripeRefundEvent({
        externalRefundId: "re_dash_inflight",
        paymentIntentId: s.pi,
        providerStatus: "succeeded",
        amountCents: call.amountCents ?? null,
        connectedAccountId: s.account,
      })
      return { externalRefundId: "re_ours_1", providerStatus: "succeeded" }
    }
    expect(await ask(s, 1000, k)).toMatchObject({ ok: true, status: "succeeded" })
    const rows = await fullRows(s.paymentId)
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.externalRefundId === "re_ours_1")).toMatchObject({ idempotencyKey: k, reason: "Annulation client", status: "succeeded" })
    expect(rows.find((r) => r.externalRefundId === "re_dash_inflight")).toMatchObject({ idempotencyKey: null, status: "succeeded", amountCents: 1000 })
    expect(await payment(s.paymentId)).toEqual({ status: "partially_refunded", refundedAmountCents: 2000 })
    // Le reste remboursable tient compte des DEUX remboursements réels.
    expect((await getBookingRefundInfo(s.bookingId, s.companyId)).payments[0].refundableCents).toBe(1000)
    expect(await ask(s, 1001)).toEqual({ ok: false, error: "exceeds_refundable" })
  })

  it("webhook externe puis webhook du nôtre avant la réponse Stripe : deux lignes, identifiants justes", async () => {
    const s = await seed(3000)
    const k = key()
    stripe.impl = async (call) => {
      for (const id of ["re_dash_2", "re_ours_2"]) {
        await applyStripeRefundEvent({
          externalRefundId: id,
          paymentIntentId: s.pi,
          providerStatus: "succeeded",
          amountCents: call.amountCents ?? null,
          connectedAccountId: s.account,
        })
      }
      return { externalRefundId: "re_ours_2", providerStatus: "succeeded" }
    }
    expect(await ask(s, 1000, k)).toMatchObject({ ok: true, status: "succeeded" })
    const rows = await fullRows(s.paymentId)
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.externalRefundId === "re_ours_2")).toMatchObject({ idempotencyKey: k, reason: "Annulation client" })
    expect(rows.find((r) => r.externalRefundId === "re_dash_2")).toMatchObject({ idempotencyKey: null })
    expect(await payment(s.paymentId)).toEqual({ status: "partially_refunded", refundedAmountCents: 2000 })
  })
})

describe("L115 — sécu 2 : demande restée « requested » sans réponse Stripe", () => {
  it("même clé, ligne récente : doublon, aucun appel Stripe", async () => {
    const s = await seed(3000)
    const k = key()
    await insertRefundRow(s, { key: k, amountCents: 1000, status: "requested", ageMinutes: 1 })
    expect(await ask(s, 1000, k)).toMatchObject({ ok: true, duplicate: true })
    expect(stripe.calls).toHaveLength(0)
  })

  it("même clé, ligne orpheline de plus de 10 min : l'appel Stripe est rejoué avec la même clé", async () => {
    const s = await seed(3000)
    const k = key()
    await insertRefundRow(s, { key: k, amountCents: 3000, status: "requested", ageMinutes: 15 })
    expect(await ask(s, 3000, k)).toMatchObject({ ok: true, status: "succeeded" })
    expect(stripe.calls.map((c) => [c.idempotencyKey, c.amountCents])).toEqual([[k, 3000]])
    expect(await fullRows(s.paymentId)).toHaveLength(1)
    expect(await payment(s.paymentId)).toEqual({ status: "refunded", refundedAmountCents: 3000 })
  })

  it("ligne orpheline de plus de 24 h (autre clé) : ne réserve plus le montant", async () => {
    const s = await seed(3000)
    await insertRefundRow(s, { key: key(), amountCents: 3000, status: "requested", ageMinutes: 25 * 60 })
    expect(await ask(s, 3000)).toMatchObject({ ok: true, status: "succeeded" })
    const rows = await fullRows(s.paymentId)
    expect(rows.map((r) => r.status)).toEqual(["failed", "succeeded"])
  })
})

describe("L115 — sécu 3 : rejeu de la même clé limité dans le temps et à la même réservation", () => {
  it("erreur temporaire vieille de plus de 23 h : rejeu refusé, aucun appel Stripe", async () => {
    const s = await seed(3000)
    const k = key()
    await insertRefundRow(s, { key: k, amountCents: 1000, status: "failed", ageMinutes: 23 * 60 + 5, error: "temporary" })
    expect(await ask(s, 1000, k)).toEqual({ ok: false, error: "retry_expired" })
    expect(stripe.calls).toHaveLength(0)
  })

  it("orpheline « requested » vieille de plus de 23 h avec la même clé : rejeu refusé", async () => {
    const s = await seed(3000)
    const k = key()
    await insertRefundRow(s, { key: k, amountCents: 1000, status: "requested", ageMinutes: 23 * 60 + 5 })
    expect(await ask(s, 1000, k)).toEqual({ ok: false, error: "retry_expired" })
    expect(stripe.calls).toHaveLength(0)
  })

  it("même clé réutilisée sur une autre réservation : refusé, aucun appel Stripe", async () => {
    const s = await seed(3000)
    const k = key()
    await insertRefundRow(s, { key: k, amountCents: 1000, status: "failed", ageMinutes: 1, error: "temporary" })
    const b2 = await pg.query<{ id: number }>(`INSERT INTO bookings ("companyId") VALUES ($1) RETURNING id`, [s.companyId])
    const r = await requestRefund({
      bookingId: b2.rows[0].id,
      paymentId: s.paymentId,
      companyId: s.companyId,
      amountCents: 1000,
      reason: "x",
      initiatedByUserId: "u-owner",
      idempotencyKey: k,
    })
    expect(r).toEqual({ ok: false, error: "retry_amount_mismatch" })
    expect(stripe.calls).toHaveLength(0)
  })
})

describe("L115 — commission DetailFlow (revue métier)", () => {
  it("commission > 0 : restitution demandée ; commission 0 : non demandée", async () => {
    const withFee = await seed(3000)
    await pg.query(`UPDATE payments SET "platformFeeAmountCents" = 90 WHERE id = $1`, [withFee.paymentId])
    await ask(withFee, 1000)
    const noFee = await seed(3000)
    await ask(noFee, 1000)
    const calls = stripe.calls as { refundApplicationFee?: boolean }[]
    expect(calls[0].refundApplicationFee).toBe(true)
    expect(calls[1].refundApplicationFee).toBe(false)
  })
})
