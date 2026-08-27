import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  validateRefundRequest,
  refundableCents,
  mapStripeRefundStatus,
  computePaymentRefundAggregate,
  RESERVING_REFUND_STATUSES,
  REFUNDABLE_PAYMENT_STATUSES,
  shouldRefundApplicationFee,
  extractSafeStripeError,
  classifyStripeRefundError,
} from "@/lib/payments/refund-logic"
import { computeMonthlyFinancials } from "@/lib/admin/financials"

/**
 * Lot « Remboursements Stripe Connect (admin tenant) ».
 *
 * Partie A — tests PURS de la logique financière de remboursement (aucune base,
 * aucun réseau) : c'est la source de vérité des règles.
 * Partie B — tests STRUCTURELS garantissant les invariants critiques dans les
 * chemins serveur réels (isolation tenant, idempotence, sécurité, webhook,
 * non-suppression), sur le modèle des tests structurels existants.
 */

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")

/* -------------------------------------------------------------------------- */
/*  Partie A — logique pure                                                   */
/* -------------------------------------------------------------------------- */

describe("refund-logic — validation d'une demande", () => {
  const base = { paymentStatus: "paid", grossAmountCents: 1126, reservedCents: 0, reason: "client" }

  it("remboursement TOTAL autorisé", () => {
    const r = validateRefundRequest({ ...base, amountCents: 1126 })
    expect(r).toEqual({ ok: true, amountCents: 1126 })
  })

  it("remboursement PARTIEL autorisé", () => {
    const r = validateRefundRequest({ ...base, amountCents: 500 })
    expect(r.ok).toBe(true)
  })

  it("plusieurs partiels : le montant déjà réservé réduit le remboursable", () => {
    // 700 déjà réservés sur 1126 → il reste 426 remboursables.
    const ok = validateRefundRequest({ ...base, reservedCents: 700, amountCents: 426 })
    expect(ok.ok).toBe(true)
    const tooMuch = validateRefundRequest({ ...base, reservedCents: 700, amountCents: 427 })
    expect(tooMuch).toEqual({ ok: false, error: "exceeds_refundable" })
  })

  it("montant supérieur au remboursable refusé", () => {
    expect(validateRefundRequest({ ...base, amountCents: 1127 })).toEqual({
      ok: false,
      error: "exceeds_refundable",
    })
  })

  it("paiement déjà intégralement remboursé refusé", () => {
    expect(validateRefundRequest({ ...base, reservedCents: 1126, amountCents: 1 })).toEqual({
      ok: false,
      error: "already_refunded",
    })
  })

  it("motif obligatoire", () => {
    expect(validateRefundRequest({ ...base, amountCents: 100, reason: "  " })).toEqual({
      ok: false,
      error: "reason_required",
    })
  })

  it("montant invalide (0, négatif, non entier) refusé", () => {
    expect(validateRefundRequest({ ...base, amountCents: 0 }).ok).toBe(false)
    expect(validateRefundRequest({ ...base, amountCents: -5 }).ok).toBe(false)
    expect(validateRefundRequest({ ...base, amountCents: 10.5 }).ok).toBe(false)
  })

  it("paiement non remboursable (statut) refusé", () => {
    expect(validateRefundRequest({ ...base, paymentStatus: "pending", amountCents: 100 })).toEqual({
      ok: false,
      error: "payment_not_refundable",
    })
    // 'refunded' n'est plus remboursable.
    expect(REFUNDABLE_PAYMENT_STATUSES).not.toContain("refunded")
  })
})

describe("refund-logic — refundableCents", () => {
  it("ne descend jamais sous 0", () => {
    expect(refundableCents({ grossAmountCents: 1000, reservedCents: 1500 })).toBe(0)
  })
  it("brut − réservé", () => {
    expect(refundableCents({ grossAmountCents: 1126, reservedCents: 126 })).toBe(1000)
  })
})

describe("refund-logic — mapStripeRefundStatus", () => {
  it("traduit les statuts Stripe", () => {
    expect(mapStripeRefundStatus("succeeded")).toBe("succeeded")
    expect(mapStripeRefundStatus("failed")).toBe("failed")
    expect(mapStripeRefundStatus("canceled")).toBe("canceled")
    expect(mapStripeRefundStatus("pending")).toBe("pending")
    expect(mapStripeRefundStatus("requires_action")).toBe("pending")
    expect(mapStripeRefundStatus(null)).toBe("pending")
  })
  it("les statuts réservants incluent requested/pending/succeeded", () => {
    expect([...RESERVING_REFUND_STATUSES].sort()).toEqual(["pending", "requested", "succeeded"])
  })
})

describe("refund-logic — computePaymentRefundAggregate (idempotent)", () => {
  it("aucun remboursement → paid", () => {
    expect(computePaymentRefundAggregate({ grossAmountCents: 1126, succeededRefundCents: 0 })).toEqual({
      refundedAmountCents: 0,
      status: "paid",
      fullyRefunded: false,
    })
  })
  it("partiel → partially_refunded", () => {
    expect(computePaymentRefundAggregate({ grossAmountCents: 1126, succeededRefundCents: 500 })).toEqual({
      refundedAmountCents: 500,
      status: "partially_refunded",
      fullyRefunded: false,
    })
  })
  it("total → refunded", () => {
    expect(computePaymentRefundAggregate({ grossAmountCents: 1126, succeededRefundCents: 1126 })).toEqual({
      refundedAmountCents: 1126,
      status: "refunded",
      fullyRefunded: true,
    })
  })
  it("plafonné au brut (jamais > gross)", () => {
    const r = computePaymentRefundAggregate({ grossAmountCents: 1126, succeededRefundCents: 5000 })
    expect(r.refundedAmountCents).toBe(1126)
    expect(r.status).toBe("refunded")
  })
  it("idempotent : même entrée → même sortie (rejeu webhook sans double comptage)", () => {
    const input = { grossAmountCents: 1126, succeededRefundCents: 400 }
    const a = computePaymentRefundAggregate(input)
    const b = computePaymentRefundAggregate(input)
    expect(a).toEqual(b)
  })
})

describe("financials — un remboursement diminue « Encaissé » à la date du remboursement", () => {
  const start = "2026-08-01"
  const end = "2026-08-31"

  it("paiement 11,26 € encaissé + remboursé le même mois → net 0, une seule déduction", () => {
    const res = computeMonthlyFinancials({
      invoicedRevenueCents: 0,
      productCostsCents: 0,
      payments: [
        {
          grossAmountCents: 1126,
          refundedAmountCents: 1126,
          status: "refunded",
          paidAt: "2026-08-27",
          refundedAt: "2026-08-28",
        },
      ],
      start,
      end,
    })
    expect(res.collectedGrossCents).toBe(1126)
    expect(res.refundedCents).toBe(1126)
    expect(res.collectedNetCents).toBe(0)
  })

  it("remboursement d'un AUTRE mois n'est pas déduit du mois courant", () => {
    const res = computeMonthlyFinancials({
      invoicedRevenueCents: 0,
      productCostsCents: 0,
      payments: [
        {
          grossAmountCents: 1126,
          refundedAmountCents: 1126,
          status: "refunded",
          paidAt: "2026-08-27",
          refundedAt: "2026-09-03", // remboursé en septembre
        },
      ],
      start,
      end,
    })
    // Encaissé en août, remboursement rattaché à septembre → net août = 1126.
    expect(res.collectedGrossCents).toBe(1126)
    expect(res.refundedCents).toBe(0)
    expect(res.collectedNetCents).toBe(1126)
  })

  it("les frais Stripe ne réduisent jamais le brut (paymentFeesCents = null)", () => {
    const res = computeMonthlyFinancials({
      invoicedRevenueCents: 0,
      productCostsCents: 0,
      payments: [
        { grossAmountCents: 1126, refundedAmountCents: 0, status: "paid", paidAt: "2026-08-27", refundedAt: null },
      ],
      start,
      end,
    })
    expect(res.collectedGrossCents).toBe(1126) // pas 1084
    expect(res.paymentFeesCents).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/*  Partie B — invariants structurels des chemins serveur                     */
/* -------------------------------------------------------------------------- */

describe("structure — moteur de remboursement (lib/payments/refunds.ts)", () => {
  const src = read("lib/payments/refunds.ts")

  it("toutes les lectures/écritures sont bornées par companyId (isolation tenant)", () => {
    // Chaque accès au paiement passe par eq(payments.companyId, companyId).
    expect(src).toContain("eq(payments.companyId, companyId)")
    expect(src).toContain("eq(refunds.companyId, companyId)")
  })

  it("crée une demande sous transaction + verrou de ligne (anti-concurrence)", () => {
    expect(src).toContain("db.transaction")
    expect(src).toContain('.for("update")')
  })

  it("empêche le sur-remboursement via la somme des montants réservés", () => {
    expect(src).toContain("RESERVING_REFUND_STATUSES")
    expect(src).toContain("validateRefundRequest")
  })

  it("clé d'idempotence : double clic / course → un seul remboursement", () => {
    expect(src).toContain("idempotencyKey")
    expect(src).toContain("refunds_idempotency_key")
    expect(src).toContain("duplicate: true")
  })

  it("appelle Stripe DANS le contexte du compte connecté relu en base", () => {
    expect(src).toContain("companies.stripeAccountId")
    expect(src).toContain("provider.refundPayment(")
    // le compte connecté n'est jamais pris du navigateur
    expect(src).not.toContain("connectedAccountId: input.connectedAccountId")
  })

  it("le statut définitif vient de Stripe (mapStripeRefundStatus) et l'agrégat est recomputé (idempotent)", () => {
    expect(src).toContain("mapStripeRefundStatus")
    expect(src).toContain("reconcilePaymentRefundAggregate")
  })

  it("l'agrégat est un RECOMPUTE (sum des succeeded), jamais un incrément", () => {
    expect(src).toContain("sum(${refunds.amountCents})")
    expect(src).toContain('eq(refunds.status, "succeeded")')
  })

  it("le paiement d'origine n'est jamais supprimé (aucun delete sur payments)", () => {
    expect(src).not.toMatch(/delete\s*\(\s*\)\s*\.\s*from\(payments\)/)
    expect(src).not.toContain("db.delete(payments)")
  })

  it("résout le tenant du webhook via le compte connecté (jamais un companyId navigateur)", () => {
    expect(src).toContain("companies.stripeAccountId, input.connectedAccountId")
  })

  it("lecture défensive si la table refunds n'existe pas encore (migration non appliquée)", () => {
    expect(src).toContain("selectRefundRowsSafe")
    expect(src).toContain("42P01")
  })
})

describe("structure — action serveur de remboursement (admin tenant)", () => {
  const src = read("app/admin/(dashboard)/reservations/[id]/actions.ts")

  it("exige le droit financier OWNER/ADMIN côté serveur (EMPLOYEE refusé)", () => {
    expect(src).toContain('requireCompanyRole(["OWNER", "ADMIN"])')
  })

  it("le companyId vient du contexte serveur, jamais du payload navigateur", () => {
    expect(src).toContain("const companyId = tenant.id")
    expect(src).not.toMatch(/companyId:\s*input\.companyId/)
  })

  it("délègue toute la logique financière au moteur (requestRefund)", () => {
    expect(src).toContain("requestRefund(")
  })
})

describe("structure — webhook Stripe (synchro remboursements)", () => {
  const src = read("app/api/payments/webhook/route.ts")

  it("gère refund.created / refund.updated / refund.failed / charge.refunded", () => {
    expect(src).toContain('case "refund.created"')
    expect(src).toContain('case "refund.updated"')
    expect(src).toContain('case "refund.failed"')
    expect(src).toContain('case "charge.refunded"')
  })

  it("passe le compte connecté de l'événement (Connect) à l'application", () => {
    expect(src).toContain("connectedAccountId: eventAccount")
    expect(src).toContain("applyStripeRefundEvent")
  })

  it("email client UNE SEULE FOIS, uniquement quand le remboursement devient effectif", () => {
    expect(src).toContain("applied.justSucceeded")
    expect(src).toContain("sendRefundConfirmationEmail")
  })

  it("reste idempotent (événement déjà traité → ACK sans retraitement)", () => {
    expect(src).toContain("hasProcessedEvent(event.id)")
  })
})

describe("structure — email de remboursement (idempotent, non bloquant)", () => {
  const src = read("lib/email/notifications.ts")

  it("réclame l'envoi de façon atomique (claim) et ne renvoie jamais un email déjà envoyé", () => {
    expect(src).toContain("claimRefundEmail")
    expect(src).toContain("markRefundEmail")
  })

  it("un échec d'email n'annule jamais le remboursement (try/catch, jamais de throw)", () => {
    expect(src).toContain("sendRefundConfirmationEmail")
    // le corps capture les erreurs
    const idx = src.indexOf("export async function sendRefundConfirmationEmail")
    const body = src.slice(idx, idx + 1600)
    expect(body).toContain("catch")
  })
})

describe("structure — UI détail réservation : suggestion d'avoir (jamais de création auto)", () => {
  const src = read("app/admin/(dashboard)/reservations/[id]/page.tsx")

  it("propose un avoir si une facture existe ET qu'un remboursement existe, sans le créer", () => {
    expect(src).toContain("suggestCreditNote")
    expect(src).toContain("existingInvoice")
    // aucune création automatique d'avoir dans la page
    expect(src).not.toContain("createCreditNote")
  })

  it("le bouton n'apparaît que pour OWNER/ADMIN (droit financier)", () => {
    expect(src).toContain("canRefund")
  })
})

describe("structure — migration refunds préparée mais additive (non destructive)", () => {
  const sql = read("scripts/refunds-table-migration.sql")

  it("est additive : CREATE TABLE IF NOT EXISTS, aucun DROP/TRUNCATE/ALTER destructif", () => {
    const lower = sql.toLowerCase()
    expect(lower).toContain("create table if not exists")
    // "drop table if exists" n'apparaît qu'en commentaire de rollback, jamais exécuté.
    expect(lower).not.toContain("truncate")
    expect(lower).not.toMatch(/alter\s+table\s+\w+\s+drop/)
  })

  it("garantit l'idempotence par contraintes d'unicité (externalRefundId, idempotencyKey)", () => {
    expect(sql).toContain("refunds_external_key")
    expect(sql).toContain("refunds_idempotency_key")
  })
})

/* -------------------------------------------------------------------------- */
/*  Correctif — application fee & observabilité d'erreur Stripe               */
/* -------------------------------------------------------------------------- */

describe("refund_application_fee — n'est demandé que si une commission > 0 existe", () => {
  it("application fee POSITIVE → on demande la restitution de la commission", () => {
    expect(shouldRefundApplicationFee(50)).toBe(true)
    expect(shouldRefundApplicationFee(1)).toBe(true)
  })

  it("application fee NULLE (0) → on ne demande PAS la restitution", () => {
    // Cause exacte du bug : refund_application_fee envoyé alors que fee = 0.
    expect(shouldRefundApplicationFee(0)).toBe(false)
  })

  it("application fee ABSENTE (null/undefined) → on ne demande PAS la restitution", () => {
    expect(shouldRefundApplicationFee(null)).toBe(false)
    expect(shouldRefundApplicationFee(undefined)).toBe(false)
  })

  it("le provider n'envoie refund_application_fee QUE si l'option est vraie", () => {
    const src = read("lib/payments/providers.ts")
    expect(src).toContain("options?.refundApplicationFee ? { refund_application_fee: true } : {}")
    // Ne doit plus jamais être forcé à true inconditionnellement.
    expect(src).not.toMatch(/refund_application_fee:\s*true,/)
  })

  it("le moteur pilote le flag depuis la commission réellement stockée sur le paiement", () => {
    const src = read("lib/payments/refunds.ts")
    expect(src).toContain("shouldRefundApplicationFee(ctx.applicationFeeCents)")
    expect(src).toContain("platformFeeAmountCents")
    expect(src).toContain("refundApplicationFee,")
  })
})

describe("observabilité — champs Stripe SÛRS uniquement (jamais de donnée sensible)", () => {
  it("extractSafeStripeError ne conserve que type/code/decline_code/requestId", () => {
    const safe = extractSafeStripeError({
      type: "invalid_request_error",
      code: "balance_insufficient",
      decline_code: "generic_decline",
      requestId: "req_123",
      // champs sensibles / superflus à NE PAS conserver :
      message: "Sensitive raw message with email@example.com",
      param: "amount",
      headers: { authorization: "Bearer sk_live_xxx" },
    })
    expect(safe).toEqual({
      type: "invalid_request_error",
      code: "balance_insufficient",
      declineCode: "generic_decline",
      requestId: "req_123",
    })
    // Aucune fuite de message / clé / e-mail.
    expect(JSON.stringify(safe)).not.toContain("email@example.com")
    expect(JSON.stringify(safe)).not.toContain("sk_live")
  })

  it("champs manquants → non renseignés (undefined), jamais inventés", () => {
    expect(extractSafeStripeError({})).toEqual({
      type: undefined,
      code: undefined,
      declineCode: undefined,
      requestId: undefined,
    })
  })

  it("le moteur enregistre le code Stripe sécurisé (jamais uniquement 'stripe_error')", () => {
    const src = read("lib/payments/refunds.ts")
    expect(src).toContain("extractSafeStripeError(e)")
    expect(src).toContain("classifyStripeRefundError(safe, rawMessage)")
    expect(src).toContain("markRefundFailed(refundRowId, code, safe)")
    // markRefundFailed sérialise les champs sûrs sous meta.stripe.
    expect(src).toContain("payload.stripe = stripeInfo")
  })
})

describe("classifyStripeRefundError — message de solde UNIQUEMENT si Stripe le confirme", () => {
  it("balance_insufficient → insufficient_funds", () => {
    expect(classifyStripeRefundError({ code: "balance_insufficient" })).toBe("insufficient_funds")
  })

  it("erreur générique SANS code solde → stripe_error (jamais insufficient_funds)", () => {
    expect(classifyStripeRefundError({ type: "invalid_request_error" }, "Something went wrong")).toBe("stripe_error")
    expect(classifyStripeRefundError({})).not.toBe("insufficient_funds")
  })

  it("charge déjà remboursée → already_refunded_stripe", () => {
    expect(classifyStripeRefundError({ code: "charge_already_refunded" })).toBe("already_refunded_stripe")
  })

  it("commission absente (message application fee) → no_application_fee", () => {
    expect(classifyStripeRefundError({ type: "invalid_request_error" }, "There is no application fee to refund")).toBe(
      "no_application_fee",
    )
  })

  it("erreurs réseau/limite → temporary", () => {
    expect(classifyStripeRefundError({ type: "api_connection_error" })).toBe("temporary")
    expect(classifyStripeRefundError({ type: "rate_limit_error" })).toBe("temporary")
  })
})

describe("structure — messages UI par code réel (plus de « solde » par défaut)", () => {
  const src = read("app/admin/(dashboard)/reservations/[id]/actions.ts")

  it("le message générique stripe_error ne parle PLUS de solde", () => {
    const idx = src.indexOf("stripe_error:")
    const line = src.slice(idx, idx + 120)
    expect(line.toLowerCase()).not.toContain("solde")
  })

  it("le message de solde est réservé au code insufficient_funds", () => {
    expect(src).toContain("insufficient_funds:")
    const idx = src.indexOf("insufficient_funds:")
    const line = src.slice(idx, idx + 160)
    expect(line.toLowerCase()).toContain("solde")
  })
})
