import "server-only"
import { db } from "@/lib/db"
import { payments, refunds, companies } from "@/lib/db/schema"
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm"
import { getPaymentProvider } from "./providers"
import {
  validateRefundRequest,
  refundableCents,
  mapStripeRefundStatus,
  computePaymentRefundAggregate,
  RESERVING_REFUND_STATUSES,
  REFUNDABLE_PAYMENT_STATUSES,
  VISIBLE_REFUND_PAYMENT_STATUSES,
  normalizeRefundReason,
  isRetryableRefundFailure,
  EXTERNAL_REFUND_REASON,
  shouldRefundApplicationFee,
  extractSafeStripeError,
  classifyStripeRefundError,
  type SafeStripeError,
  type RefundStatus,
} from "./refund-logic"

/* -------------------------------------------------------------------------- */
/*  Lecture — toujours bornée par companyId (isolation tenant stricte)        */
/* -------------------------------------------------------------------------- */

export type RefundListRow = {
  id: number
  amountCents: number
  status: RefundStatus
  reason: string | null
  createdAt: Date
  succeededAt: Date | null
  externalRefundIdMasked: string | null
}

export type RefundablePayment = {
  paymentId: number
  type: string
  grossAmountCents: number
  currency: string
  status: string
  paidAt: Date | null
  refundedAmountCents: number
  /** Montant réservé (requested/pending/succeeded) — empêche le sur-remboursement. */
  reservedCents: number
  /** Montant encore remboursable = brut − réservé. */
  refundableCents: number
  refunds: RefundListRow[]
}

/** Masque un identifiant Stripe pour l'affichage (re_1234…WXYZ). */
function maskExternalId(id: string | null): string | null {
  if (!id) return null
  if (id.length <= 8) return id
  return `${id.slice(0, 6)}…${id.slice(-4)}`
}

/** Code d'erreur Postgres pour « relation inexistante » (table absente). */
function isUndefinedTable(e: unknown): boolean {
  const code = (e as { code?: string })?.code
  return code === "42P01"
}

/**
 * Lecture DÉFENSIVE des remboursements : renvoie [] si la table `refunds`
 * n'existe pas encore (migration additive non appliquée), pour ne jamais
 * casser une page existante en production. Toute autre erreur est propagée.
 */
async function selectRefundRowsSafe(companyId: number, paymentIds: number[]) {
  try {
    return await db
      .select()
      .from(refunds)
      .where(and(eq(refunds.companyId, companyId), inArray(refunds.paymentId, paymentIds)))
      .orderBy(desc(refunds.createdAt))
  } catch (e) {
    if (isUndefinedTable(e)) return []
    throw e
  }
}

/**
 * Récapitulatif des remboursements d'une réservation, STRICTEMENT borné au
 * tenant (companyId issu du contexte serveur). Renvoie les paiements
 * remboursables (statut paid / partially_refunded) avec le détail des
 * remboursements et les montants réservés/remboursables recalculés.
 */
export async function getBookingRefundInfo(
  bookingId: number,
  companyId: number,
): Promise<{ payments: RefundablePayment[] }> {
  const payRows = await db
    .select({
      id: payments.id,
      type: payments.type,
      grossAmountCents: payments.grossAmountCents,
      currency: payments.currency,
      status: payments.status,
      paidAt: payments.paidAt,
      refundedAmountCents: payments.refundedAmountCents,
    })
    .from(payments)
    .where(
      and(
        eq(payments.bookingId, bookingId),
        eq(payments.companyId, companyId),
        // L115 : `refunded` inclus pour qu'un paiement remboursé en totalité
        // reste visible (statut + historique) ; il n'est plus remboursable.
        inArray(payments.status, [...VISIBLE_REFUND_PAYMENT_STATUSES]),
      ),
    )
    .orderBy(desc(payments.createdAt))

  if (payRows.length === 0) return { payments: [] }

  const paymentIds = payRows.map((p) => p.id)
  // RÉTROCOMPAT : la table `refunds` est ajoutée par une migration additive
  // (scripts/refunds-table-migration.sql). Tant qu'elle n'est pas appliquée, la
  // lecture ne doit JAMAIS casser le détail réservation existant → fallback à
  // un historique vide. Le montant remboursable reste calculé depuis `payments`.
  const refundRows = await selectRefundRowsSafe(companyId, paymentIds)

  const result: RefundablePayment[] = payRows.map((p) => {
    const rowsForPay = refundRows.filter((r) => r.paymentId === p.id)
    const reservedCents = rowsForPay
      .filter((r) => (RESERVING_REFUND_STATUSES as readonly string[]).includes(r.status))
      .reduce((sum, r) => sum + r.amountCents, 0)
    return {
      paymentId: p.id,
      type: p.type,
      grossAmountCents: p.grossAmountCents,
      currency: p.currency,
      status: p.status,
      paidAt: p.paidAt,
      refundedAmountCents: p.refundedAmountCents,
      reservedCents,
      refundableCents: (REFUNDABLE_PAYMENT_STATUSES as readonly string[]).includes(p.status)
        ? refundableCents({ grossAmountCents: p.grossAmountCents, reservedCents })
        : 0,
      refunds: rowsForPay.map((r) => ({
        id: r.id,
        amountCents: r.amountCents,
        status: r.status as RefundStatus,
        reason: r.reason,
        createdAt: r.createdAt,
        succeededAt: r.succeededAt,
        externalRefundIdMasked: maskExternalId(r.externalRefundId),
      })),
    }
  })

  return { payments: result }
}

/* -------------------------------------------------------------------------- */
/*  Création d'un remboursement — atomique + idempotente + isolée par tenant  */
/* -------------------------------------------------------------------------- */

export type RequestRefundResult =
  | { ok: true; refundId: number; status: RefundStatus; duplicate?: boolean }
  | { ok: false; error: string }

/**
 * Demande un remboursement (total ou partiel) pour un paiement d'une
 * réservation. TOUT est vérifié côté serveur :
 *  - le paiement appartient bien au tenant (companyId + bookingId) ;
 *  - le compte Stripe Connect propriétaire est relu en base (jamais du client) ;
 *  - le montant ne dépasse jamais le remboursable (verrou de ligne + somme des
 *    remboursements réservés) ;
 *  - la clé d'idempotence rend un double clic / retry inoffensif (une ligne).
 *
 * Le statut FINAL fait toujours foi via le webhook Stripe. Cette fonction pose
 * la ligne `requested`, appelle Stripe, puis reflète l'état retourné (pending/
 * succeeded) sans jamais dépasser ce que le webhook confirmera.
 */
export async function requestRefund(input: {
  bookingId: number
  paymentId: number
  companyId: number
  amountCents: number
  reason: string
  initiatedByUserId: string
  idempotencyKey: string
}): Promise<RequestRefundResult> {
  const { bookingId, paymentId, companyId, amountCents, reason, initiatedByUserId, idempotencyKey } = input

  if (!idempotencyKey || idempotencyKey.length < 8) {
    return { ok: false, error: "invalid_idempotency_key" }
  }

  // 1) Réservation ATOMIQUE de la ligne de remboursement (transaction + verrou).
  let refundRowId: number
  let claimedAmountCents: number
  try {
    const claimed = await db.transaction(async (tx): Promise<Claim> => {
      // Idempotence création : si la clé existe déjà, on renvoie la ligne (aucun
      // second remboursement, même sur double clic ou double soumission).
      const [existing] = await tx
        .select({
          id: refunds.id,
          status: refunds.status,
          paymentId: refunds.paymentId,
          amountCents: refunds.amountCents,
          error: sql<string | null>`${refunds.meta}->>'error'`,
        })
        .from(refunds)
        .where(and(eq(refunds.idempotencyKey, idempotencyKey), eq(refunds.companyId, companyId)))
        .limit(1)
        .for("update")
      if (existing) {
        if (existing.status !== "failed" && existing.status !== "canceled") {
          return { kind: "duplicate", id: existing.id, status: existing.status as RefundStatus }
        }
        // L115 : une tentative échouée n'est JAMAIS « déjà enregistrée ».
        // Refus net → on renvoie la même erreur (le navigateur change de clé).
        const code = existing.error ?? "stripe_error"
        if (existing.status === "canceled" || !isRetryableRefundFailure(code)) {
          return { kind: "failed", error: code }
        }
        // Résultat inconnu (réseau…) → on rejoue le MÊME appel, même montant.
        if (existing.paymentId !== paymentId || existing.amountCents !== amountCents) {
          return { kind: "failed", error: "retry_amount_mismatch" }
        }
      }

      // Verrou de ligne sur le paiement : sérialise les demandes concurrentes.
      const [pay] = await tx
        .select({
          id: payments.id,
          status: payments.status,
          grossAmountCents: payments.grossAmountCents,
        })
        .from(payments)
        .where(and(eq(payments.id, paymentId), eq(payments.companyId, companyId), eq(payments.bookingId, bookingId)))
        .limit(1)
        .for("update")
      if (!pay) throw new RefundError("payment_not_found")

      // Somme des remboursements DÉJÀ réservés (requested/pending/succeeded).
      const [agg] = await tx
        .select({ reserved: sql<number>`coalesce(sum(${refunds.amountCents}), 0)` })
        .from(refunds)
        .where(
          and(
            eq(refunds.paymentId, paymentId),
            eq(refunds.companyId, companyId),
            inArray(refunds.status, [...RESERVING_REFUND_STATUSES]),
          ),
        )
      const reservedCents = Number(agg?.reserved ?? 0)

      const validation = validateRefundRequest({
        paymentStatus: pay.status,
        grossAmountCents: pay.grossAmountCents,
        reservedCents,
        amountCents,
        reason,
      })
      if (!validation.ok) throw new RefundError(validation.error)

      if (existing) {
        // Nouvel essai après erreur temporaire : la ligne redevient `requested`
        // (elle réserve de nouveau le montant) ; même clé envoyée à Stripe.
        await tx
          .update(refunds)
          .set({ status: "requested", failedAt: null, updatedAt: new Date() })
          .where(and(eq(refunds.id, existing.id), eq(refunds.companyId, companyId)))
        return { kind: "claimed", id: existing.id, amountCents: validation.amountCents }
      }

      const [inserted] = await tx
        .insert(refunds)
        .values({
          companyId,
          paymentId,
          bookingId,
          provider: "stripe",
          amountCents: validation.amountCents,
          reason: normalizeRefundReason(reason),
          status: "requested",
          initiatedByUserId,
          idempotencyKey,
        })
        .returning({ id: refunds.id })
      return { kind: "claimed", id: inserted.id, amountCents: validation.amountCents }
    })

    if (claimed.kind === "duplicate") {
      return { ok: true, refundId: claimed.id, status: claimed.status, duplicate: true }
    }
    if (claimed.kind === "failed") return { ok: false, error: claimed.error }
    refundRowId = claimed.id
    claimedAmountCents = claimed.amountCents
  } catch (e) {
    if (e instanceof RefundError) return { ok: false, error: e.code }
    // Violation d'unicité (course sur la clé d'idempotence) → traiter en doublon.
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes("refunds_idempotency_key")) {
      const [row] = await db
        .select({ id: refunds.id, status: refunds.status })
        .from(refunds)
        .where(and(eq(refunds.idempotencyKey, idempotencyKey), eq(refunds.companyId, companyId)))
        .limit(1)
      if (row) return { ok: true, refundId: row.id, status: row.status as RefundStatus, duplicate: true }
    }
    console.log("[v0] requestRefund: échec réservation:", msg)
    return { ok: false, error: "internal_error" }
  }

  // 2) Appel Stripe HORS transaction, dans le contexte du compte connecté du
  //    tenant (relu en base). Idempotent via la clé stable.
  const [ctx] = await db
    .select({
      stripeAccountId: companies.stripeAccountId,
      paymentIntentId: sql<string | null>`${payments.meta}->>'paymentIntentId'`,
      // Commission plateforme réellement prélevée sur ce paiement (0 par défaut).
      applicationFeeCents: payments.platformFeeAmountCents,
    })
    .from(payments)
    .innerJoin(companies, eq(companies.id, payments.companyId))
    .where(and(eq(payments.id, paymentId), eq(payments.companyId, companyId)))
    .limit(1)

  const provider = getPaymentProvider("stripe")
  if (!ctx?.stripeAccountId || !ctx.paymentIntentId || !provider) {
    await markRefundFailed(refundRowId, companyId, "missing_stripe_context")
    return { ok: false, error: "missing_stripe_context" }
  }

  // On ne demande la restitution de la commission QUE si une application fee
  // strictement positive existe sur le paiement. Sinon Stripe rejette la
  // requête (cause de l'échec observé). Aucune commission inventée.
  const refundApplicationFee = shouldRefundApplicationFee(ctx.applicationFeeCents)

  let res: Awaited<ReturnType<typeof provider.refundPayment>>
  try {
    res = await provider.refundPayment(ctx.paymentIntentId, ctx.stripeAccountId, {
      amountCents: claimedAmountCents,
      idempotencyKey,
      refundApplicationFee,
    })
  } catch (e) {
    // Erreur Stripe → on extrait des champs SÛRS (type/code/decline_code/
    // requestId, jamais de donnée sensible) et on classe vers un code applicatif
    // précis (solde insuffisant, déjà remboursé, temporaire, générique…).
    const safe = extractSafeStripeError(e)
    const rawMessage = e instanceof Error ? e.message : String(e)
    const code = classifyStripeRefundError(safe, rawMessage)
    console.log("[v0] requestRefund: échec Stripe:", { code, ...safe })
    await markRefundFailed(refundRowId, companyId, code, safe)
    return { ok: false, error: code }
  }

  // 3) Stripe a ACCEPTÉ le remboursement : à partir d'ici, plus jamais « Échoué ».
  //    Le webhook a pu passer avant nous (L115) : on ne rétrograde jamais un
  //    statut déjà final posé par lui ; on renvoie le statut réellement en base.
  const providerStatus = mapStripeRefundStatus(res.providerStatus)
  try {
    await db
      .update(refunds)
      .set({
        externalRefundId: res.externalRefundId,
        status: sql`CASE WHEN ${refunds.status} IN ('requested', 'pending') THEN ${providerStatus} ELSE ${refunds.status} END`,
        updatedAt: new Date(),
        ...(providerStatus === "succeeded" ? { succeededAt: sql`coalesce(${refunds.succeededAt}, now())` } : {}),
      })
      .where(and(eq(refunds.id, refundRowId), eq(refunds.companyId, companyId)))

    // Recompute idempotent (le webhook fera le même sans double comptage).
    await reconcilePaymentRefundAggregate(paymentId, companyId)

    const [row] = await db
      .select({ status: refunds.status })
      .from(refunds)
      .where(and(eq(refunds.id, refundRowId), eq(refunds.companyId, companyId)))
      .limit(1)
    return { ok: true, refundId: refundRowId, status: (row?.status as RefundStatus) ?? providerStatus }
  } catch (e) {
    // Écriture locale ratée APRÈS le succès Stripe : le webhook réconciliera.
    console.log("[v0] requestRefund: mise à jour locale après Stripe:", e instanceof Error ? e.message : e)
    return { ok: true, refundId: refundRowId, status: providerStatus }
  }
}

type Claim =
  | { kind: "claimed"; id: number; amountCents: number }
  | { kind: "duplicate"; id: number; status: RefundStatus }
  | { kind: "failed"; error: string }

class RefundError extends Error {
  constructor(public code: string) {
    super(code)
  }
}

async function markRefundFailed(
  refundId: number,
  companyId: number,
  code: string,
  safe?: SafeStripeError,
): Promise<void> {
  // On stocke le code applicatif ET, si disponibles, les champs Stripe SÛRS
  // (type/code/decline_code/requestId). Jamais uniquement "stripe_error", et
  // jamais de donnée sensible (clé API, carte, e-mail, identité).
  const payload: Record<string, unknown> = { error: code }
  if (safe) {
    const stripeInfo = Object.fromEntries(Object.entries(safe).filter(([, v]) => v != null))
    if (Object.keys(stripeInfo).length > 0) payload.stripe = stripeInfo
  }
  await db
    .update(refunds)
    .set({
      status: "failed",
      failedAt: new Date(),
      updatedAt: new Date(),
      meta: sql`coalesce(${refunds.meta}, '{}'::jsonb) || ${JSON.stringify(payload)}::jsonb`,
    })
    .where(and(eq(refunds.id, refundId), eq(refunds.companyId, companyId)))
}

/* -------------------------------------------------------------------------- */
/*  Réconciliation d'agrégat — recompute IDEMPOTENT (jamais un incrément)     */
/* -------------------------------------------------------------------------- */

/**
 * Recalcule les agrégats du paiement à partir des remboursements réellement
 * `succeeded`. IDEMPOTENT : peut être rejoué (webhook en double, événements
 * dans le désordre) sans jamais compter deux fois. Le paiement d'origine n'est
 * jamais supprimé ; seuls `refundedAmountCents`/`status`/`refundedAt` évoluent.
 */
export async function reconcilePaymentRefundAggregate(paymentId: number, companyId: number): Promise<void> {
  await db.transaction(async (tx) => {
    const [pay] = await tx
      .select({ id: payments.id, gross: payments.grossAmountCents, refundedAt: payments.refundedAt })
      .from(payments)
      .where(and(eq(payments.id, paymentId), eq(payments.companyId, companyId)))
      .limit(1)
      .for("update")
    if (!pay) return

    const [agg] = await tx
      .select({ succeeded: sql<number>`coalesce(sum(${refunds.amountCents}), 0)` })
      .from(refunds)
      .where(
        and(eq(refunds.paymentId, paymentId), eq(refunds.companyId, companyId), eq(refunds.status, "succeeded")),
      )
    const succeededRefundCents = Number(agg?.succeeded ?? 0)

    const next = computePaymentRefundAggregate({ grossAmountCents: pay.gross, succeededRefundCents })

    await tx
      .update(payments)
      .set({
        refundedAmountCents: next.refundedAmountCents,
        status: next.status,
        // `refundedAt` = date réelle du remboursement, posée une seule fois au
        // premier remboursement effectif (sert de rattachement mensuel pour
        // « Encaissé »). Ne l'écrase pas si déjà posée.
        ...(next.refundedAmountCents > 0 && !pay.refundedAt ? { refundedAt: new Date() } : {}),
      })
      .where(eq(payments.id, paymentId))
  })
}

/* -------------------------------------------------------------------------- */
/*  Application d'un événement de remboursement Stripe (webhook)              */
/* -------------------------------------------------------------------------- */

export type ApplyRefundEventResult = {
  matched: boolean
  justSucceeded: boolean
  refundId: number | null
  bookingId: number | null
  companyId: number | null
}

/**
 * Applique un événement de remboursement Stripe au bon paiement/tenant, SANS
 * jamais faire confiance à un companyId du navigateur : le tenant est résolu
 * via le compte connecté (`connectedAccountId`) puis le PaymentIntent.
 *
 * Idempotent : rapproché d'abord par `externalRefundId` (unique), sinon créé.
 * Un rejeu ou des événements dans le désordre convergent vers le même état
 * (recompute d'agrégat). Renvoie de quoi déclencher l'email (une seule fois).
 */
export async function applyStripeRefundEvent(input: {
  externalRefundId: string
  paymentIntentId: string | null
  providerStatus: string | null
  amountCents: number | null
  connectedAccountId: string | null
}): Promise<ApplyRefundEventResult> {
  const none: ApplyRefundEventResult = {
    matched: false,
    justSucceeded: false,
    refundId: null,
    bookingId: null,
    companyId: null,
  }

  // 1) Résoudre le tenant à partir du compte connecté (défense multi-tenant).
  let companyId: number | null = null
  if (input.connectedAccountId) {
    const [c] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.stripeAccountId, input.connectedAccountId))
      .limit(1)
    companyId = c?.id ?? null
  }

  // 2) Retrouver le paiement via le PaymentIntent (borné au tenant résolu).
  if (!input.paymentIntentId || companyId == null) return none
  const [pay] = await db
    .select({ id: payments.id, bookingId: payments.bookingId })
    .from(payments)
    .where(
      and(
        eq(payments.companyId, companyId),
        sql`${payments.meta}->>'paymentIntentId' = ${input.paymentIntentId}`,
      ),
    )
    .limit(1)
  if (!pay) return none

  const status = mapStripeRefundStatus(input.providerStatus)

  // 3) Rapprocher/insérer la ligne de remboursement (idempotent par externalId).
  const tenantId = companyId
  const justSucceeded = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: refunds.id, emailClient: sql<string | null>`${refunds.meta}->>'emailClient'` })
      .from(refunds)
      .where(
        and(
          eq(refunds.provider, "stripe"),
          eq(refunds.externalRefundId, input.externalRefundId),
          eq(refunds.companyId, tenantId),
        ),
      )
      .limit(1)
      .for("update")

    // L115 : webhook arrivé AVANT la fin de la demande DetailFlow → la ligne
    // existe déjà (`requested`, sans id Stripe). On la complète au lieu d'en
    // créer une seconde (sinon la demande finissait en « Échoué »).
    const own = existing
      ? null
      : input.amountCents != null && input.amountCents > 0
        ? (
            await tx
              .select({ id: refunds.id, emailClient: sql<string | null>`${refunds.meta}->>'emailClient'` })
              .from(refunds)
              .where(
                and(
                  eq(refunds.companyId, tenantId),
                  eq(refunds.paymentId, pay.id),
                  eq(refunds.provider, "stripe"),
                  isNull(refunds.externalRefundId),
                  eq(refunds.amountCents, input.amountCents),
                  sql`(${refunds.status} IN ('requested', 'pending') OR (${refunds.status} = 'failed' AND ${refunds.meta}->>'error' IN ('temporary', 'idempotency_conflict')))`,
                ),
              )
              .orderBy(asc(refunds.createdAt))
              .limit(1)
              .for("update")
          )[0] ?? null
        : null

    const target = existing ?? own
    let refundId: number
    let emailClient: string | null = null
    if (target) {
      refundId = target.id
      emailClient = target.emailClient
      await tx
        .update(refunds)
        .set({
          ...(own ? { externalRefundId: input.externalRefundId } : {}),
          status,
          updatedAt: new Date(),
          ...(status === "succeeded" ? { succeededAt: new Date() } : {}),
          ...(status === "failed" ? { failedAt: new Date() } : {}),
          ...(status === "canceled" ? { canceledAt: new Date() } : {}),
        })
        .where(and(eq(refunds.id, target.id), eq(refunds.companyId, tenantId)))
    } else {
      // Remboursement initié hors DetailFlow (ex. Dashboard Stripe) : on le
      // matérialise pour rester la source de vérité, avec le montant Stripe.
      // Motif NOT NULL en base → libellé fixe (avant L115 : insertion en échec).
      const [ins] = await tx
        .insert(refunds)
        .values({
          companyId: tenantId,
          paymentId: pay.id,
          bookingId: pay.bookingId,
          provider: "stripe",
          externalRefundId: input.externalRefundId,
          amountCents: input.amountCents ?? 0,
          status,
          reason: EXTERNAL_REFUND_REASON,
          ...(status === "succeeded" ? { succeededAt: new Date() } : {}),
        })
        .returning({ id: refunds.id })
      refundId = ins.id
    }

    // L115 : « à envoyer » tant que l'e-mail n'a pas été réclamé (et non plus
    // « vient de passer à succeeded ») : quand Stripe confirme dès la demande,
    // la ligne est déjà `succeeded` et le client ne recevait rien. Le claim
    // atomique de claimRefundEmail garantit un seul envoi.
    const emailDone = emailClient === "sent" || emailClient === "sending" || emailClient === "invalid"
    return { refundId, justSucceeded: status === "succeeded" && !emailDone }
  })

  // 4) Recompute idempotent de l'agrégat (déduit « Encaissé » à refundedAt).
  await reconcilePaymentRefundAggregate(pay.id, companyId)

  return {
    matched: true,
    justSucceeded: justSucceeded.justSucceeded,
    refundId: justSucceeded.refundId,
    bookingId: pay.bookingId,
    companyId,
  }
}

/* -------------------------------------------------------------------------- */
/*  Email de confirmation — idempotence DURABLE dans refunds.meta.emailClient */
/* -------------------------------------------------------------------------- */

export type RefundEmailData = {
  refundId: number
  amountCents: number
  grossAmountCents: number
  fullyRefunded: boolean
  bookingId: number
  companyId: number
}

/**
 * Réclame ATOMIQUEMENT l'envoi de l'email de remboursement au client. Pose
 * `meta.emailClient = "sending"` seulement si l'état est réclamable (absent ou
 * "failed"), sous verrou de ligne → deux webhooks concurrents ne peuvent pas
 * envoyer deux fois. Renvoie les données nécessaires à l'email (relues en base).
 * Ne réclame que les remboursements RÉELLEMENT `succeeded`.
 */
export async function claimRefundEmail(refundId: number, companyId: number): Promise<RefundEmailData | null> {
  const res = await db.execute(sql`
    UPDATE refunds
    SET meta = jsonb_set(coalesce(meta, '{}'::jsonb), '{emailClient}', '"sending"'::jsonb, true)
    WHERE id = ${refundId}
      AND "companyId" = ${companyId}
      AND status = 'succeeded'
      AND coalesce(meta->>'emailClient', '') NOT IN ('sent', 'sending', 'invalid')
    RETURNING id, "paymentId" AS payment_id, "bookingId" AS booking_id, "amountCents" AS amount
  `)
  const row = res.rows[0] as { id: number; payment_id: number; booking_id: number; amount: number } | undefined
  if (!row) return null

  const [pay] = await db
    .select({ gross: payments.grossAmountCents, refunded: payments.refundedAmountCents })
    .from(payments)
    .where(and(eq(payments.id, row.payment_id), eq(payments.companyId, companyId)))
    .limit(1)
  const gross = pay?.gross ?? row.amount
  const refunded = pay?.refunded ?? row.amount

  return {
    refundId: row.id,
    amountCents: row.amount,
    grossAmountCents: gross,
    fullyRefunded: refunded >= gross,
    bookingId: row.booking_id,
    companyId,
  }
}

/** Fige l'état final de l'email de remboursement (sent / failed / invalid). */
export async function markRefundEmail(
  refundId: number,
  state: "sent" | "failed" | "invalid",
): Promise<void> {
  await db.execute(sql`
    UPDATE refunds
    SET meta = jsonb_set(coalesce(meta, '{}'::jsonb), '{emailClient}', ${JSON.stringify(state)}::jsonb, true)
    WHERE id = ${refundId}
  `)
}
