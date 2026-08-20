import "server-only"
import { randomBytes } from "crypto"
import { and, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { smsCredits, smsRechargeRequests } from "@/lib/db/schema"
import { SMS_BETA_BONUS } from "./config"
import { canUseFeature } from "@/lib/licensing/enforce"

/* -------------------------------------------------------------------------- */
/*  Solde SMS — toujours scopé par companyId (isolation multi-tenant stricte). */
/* -------------------------------------------------------------------------- */

export type SmsBalance = {
  balance: number
  granted: number
  purchased: number
}

/** Garantit l'existence de la ligne de crédits d'une entreprise (idempotent). */
export async function ensureSmsCreditsRow(companyId: number): Promise<void> {
  await db
    .insert(smsCredits)
    .values({ companyId, balance: 0, granted: 0, purchased: 0 })
    .onConflictDoNothing({ target: smsCredits.companyId })
}

/** Lit le solde d'une entreprise (0 par défaut si aucune ligne). */
export async function getSmsBalance(companyId: number): Promise<SmsBalance> {
  const [row] = await db
    .select({ balance: smsCredits.balance, granted: smsCredits.granted, purchased: smsCredits.purchased })
    .from(smsCredits)
    .where(eq(smsCredits.companyId, companyId))
    .limit(1)
  return row ?? { balance: 0, granted: 0, purchased: 0 }
}

/**
 * Attribue le bonus bêta (20 SMS) UNE SEULE FOIS.
 *
 * Idempotence garantie côté SQL : la mise à jour n'agit que si
 * `betaBonusGrantedAt IS NULL`. Deux appels concurrents ou répétés ne créditent
 * jamais deux fois. Renvoie true si le bonus vient d'être attribué.
 */
export async function grantBetaBonus(companyId: number): Promise<boolean> {
  await ensureSmsCreditsRow(companyId)
  const updated = await db
    .update(smsCredits)
    .set({
      balance: sql`${smsCredits.balance} + ${SMS_BETA_BONUS}`,
      granted: sql`${smsCredits.granted} + ${SMS_BETA_BONUS}`,
      betaBonusGrantedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(smsCredits.companyId, companyId), sql`${smsCredits.betaBonusGrantedAt} IS NULL`))
    .returning({ id: smsCredits.id })
  return updated.length > 0
}

export type ReserveReason = "ok" | "no_credit" | "already_sent" | "unknown"

/**
 * PHASE 1 — Réserve l'envoi d'un rappel SMS pour un RDV donné, SANS débiter.
 *
 * Dans une transaction :
 *  - garde solde : refuse si `balance <= 0` (aucun SMS ne part si solde nul) ;
 *  - marquage ATOMIQUE anti-doublon : pose `smsReminderSentAt = now()`
 *    UNIQUEMENT si la colonne est NULL ET que le RDV est toujours `confirmed`
 *    (jamais pour un RDV annulé ; un RDV supprimé n'existe plus → 0 ligne).
 *
 * Le marquage AVANT envoi garantit qu'aucune exécution concurrente ne peut
 * envoyer deux fois. Le débit, lui, n'a lieu qu'APRÈS un envoi réussi
 * (voir confirmSmsDebit). En cas d'échec d'envoi, appeler releaseSmsReminder
 * pour rendre le RDV à nouveau éligible (aucun crédit consommé).
 */
export async function reserveSmsReminder(
  companyId: number,
  bookingId: number,
): Promise<{ ok: boolean; reason: ReserveReason }> {
  try {
    return await db.transaction(async (tx) => {
      const [credits] = await tx
        .select({ balance: smsCredits.balance })
        .from(smsCredits)
        .where(eq(smsCredits.companyId, companyId))
        .limit(1)
      if (!credits || credits.balance <= 0) {
        return { ok: false as const, reason: "no_credit" as ReserveReason }
      }
      const claimed = await tx.execute(
        sql`UPDATE bookings SET "smsReminderSentAt" = now()
            WHERE id = ${bookingId} AND "companyId" = ${companyId}
              AND "smsReminderSentAt" IS NULL AND status = 'confirmed'
            RETURNING id`,
      )
      if (claimed.rows.length === 0) {
        return { ok: false as const, reason: "already_sent" as ReserveReason }
      }
      return { ok: true as const, reason: "ok" as ReserveReason }
    })
  } catch (e) {
    console.log("[v0] reserveSmsReminder error:", e instanceof Error ? e.message : e)
    return { ok: false, reason: "unknown" }
  }
}

/**
 * Annule une réservation quand l'envoi AllMySMS a échoué : remet
 * `smsReminderSentAt` à NULL pour que le RDV redevienne éligible au prochain
 * passage du cron. Aucun crédit n'a été débité à ce stade.
 */
export async function releaseSmsReminder(companyId: number, bookingId: number): Promise<void> {
  await db.execute(
    sql`UPDATE bookings SET "smsReminderSentAt" = NULL
        WHERE id = ${bookingId} AND "companyId" = ${companyId}`,
  )
}

/**
 * PHASE 2 — Débite 1 crédit APRÈS un envoi AllMySMS réussi.
 * Débit atomique conditionnel (`balance > 0`) : jamais de solde négatif.
 */
export async function confirmSmsDebit(companyId: number): Promise<boolean> {
  const debited = await db
    .update(smsCredits)
    .set({ balance: sql`${smsCredits.balance} - 1`, updatedAt: new Date() })
    .where(and(eq(smsCredits.companyId, companyId), sql`${smsCredits.balance} > 0`))
    .returning({ id: smsCredits.id })
  return debited.length > 0
}

/* -------------------------------------------------------------------------- */
/*  Référence unique de recharge (ex. SMS-A8F42K)                              */
/* -------------------------------------------------------------------------- */

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // sans I/O/0/1 ambigus

export function generateRechargeReference(): string {
  const bytes = randomBytes(6)
  let out = ""
  for (let i = 0; i < 6; i++) out += REF_ALPHABET[bytes[i] % REF_ALPHABET.length]
  return `SMS-${out}`
}

/* -------------------------------------------------------------------------- */
/*  Validation d'une recharge par le SUPER-ADMIN (idempotent, critique)        */
/* -------------------------------------------------------------------------- */

export type CreditFromRechargeResult =
  | { ok: true; already: boolean; quantity: number; newBalance: number; companyId: number; reference: string }
  | { ok: false; error: string }

/**
 * Crédite les SMS d'une demande de recharge — RÉSERVÉ au super-admin.
 *
 * IDEMPOTENT (POINT CRITIQUE) : le passage pending → paid se fait via un UPDATE
 * conditionnel sur `status = 'pending'`. Si 0 ligne est affectée (déjà payée),
 * on NE crédite PAS et on renvoie `already: true`. Ainsi un double-clic ou un
 * rechargement de page ne crédite JAMAIS deux fois.
 */
export async function creditFromRecharge(requestId: number): Promise<CreditFromRechargeResult> {
  // Sentinelle interne : sert UNIQUEMENT à faire un rollback de la transaction
  // quand la licence n'inclut pas `sms`. Jamais exposée telle quelle au client.
  const FEATURE_LOCKED = Symbol("sms-feature-locked")
  try {
    return await db.transaction(async (tx) => {
      // 1) Transition atomique pending -> paid (gagnée une seule fois).
      const claimed = await tx
        .update(smsRechargeRequests)
        .set({ status: "paid", validatedAt: new Date() })
        .where(and(eq(smsRechargeRequests.id, requestId), eq(smsRechargeRequests.status, "pending")))
        .returning({
          companyId: smsRechargeRequests.companyId,
          quantity: smsRechargeRequests.quantity,
          reference: smsRechargeRequests.reference,
        })

      if (!claimed.length) {
        // Déjà traitée (ou inexistante) : aucun crédit.
        const [existing] = await tx
          .select({
            status: smsRechargeRequests.status,
            quantity: smsRechargeRequests.quantity,
            reference: smsRechargeRequests.reference,
            companyId: smsRechargeRequests.companyId,
          })
          .from(smsRechargeRequests)
          .where(eq(smsRechargeRequests.id, requestId))
          .limit(1)
        if (!existing) return { ok: false as const, error: "Demande introuvable." }
        const bal = await getSmsBalance(existing.companyId)
        return {
          ok: true as const,
          already: true,
          quantity: existing.quantity,
          newBalance: bal.balance,
          companyId: existing.companyId,
          reference: existing.reference,
        }
      }

      const { companyId, quantity, reference } = claimed[0]

      // Défense en profondeur (feature sms) — vérifiée APRÈS avoir connu le
      // companyId de la demande, AVANT tout crédit. Si la licence n'inclut plus
      // `sms` (ex. downgrade BUSINESS -> PRO avec une recharge encore pending),
      // on lève la sentinelle pour ROLLBACK : la transition pending -> paid est
      // annulée, la demande reste `pending`, aucun crédit n'est ajouté. LEGACY
      // (licensePlan = NULL) => autorisé.
      if (!(await canUseFeature(companyId, "sms"))) {
        throw FEATURE_LOCKED
      }

      // 2) Créditer le solde (exactement une fois, la transition ayant été gagnée).
      await tx
        .insert(smsCredits)
        .values({ companyId, balance: 0, granted: 0, purchased: 0 })
        .onConflictDoNothing({ target: smsCredits.companyId })
      const [row] = await tx
        .update(smsCredits)
        .set({
          balance: sql`${smsCredits.balance} + ${quantity}`,
          purchased: sql`${smsCredits.purchased} + ${quantity}`,
          updatedAt: new Date(),
        })
        .where(eq(smsCredits.companyId, companyId))
        .returning({ balance: smsCredits.balance })

      return {
        ok: true as const,
        already: false,
        quantity,
        newBalance: row?.balance ?? quantity,
        companyId,
        reference,
      }
    })
  } catch (err) {
    // Rollback volontaire pour licence sans `sms` : message générique, aucune
    // donnée modifiée (la demande reste pending). Toute autre erreur est relancée.
    if (err === FEATURE_LOCKED) {
      return { ok: false as const, error: "SMS non inclus dans la licence." }
    }
    throw err
  }
}
