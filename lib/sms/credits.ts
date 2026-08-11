import "server-only"
import { randomBytes } from "crypto"
import { and, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { smsCredits, smsRechargeRequests } from "@/lib/db/schema"
import { SMS_BETA_BONUS } from "./config"

/* -------------------------------------------------------------------------- */
/*  Solde SMS — toujours scopé par companyId (isolation multi-tenant stricte). */
/* -------------------------------------------------------------------------- */

export type SmsBalance = {
  balance: number
  granted: number
  purchased: number
}

/** Garantit l'existence de la ligne de crédits d'une entreprise (idempotent). */
async function ensureCreditsRow(companyId: number): Promise<void> {
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
  await ensureCreditsRow(companyId)
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

export type DebitReason = "ok" | "no_credit" | "already_sent" | "unknown"

/**
 * Réserve l'envoi d'un rappel SMS pour un RDV donné : marque le RDV comme
 * "rappel SMS envoyé" ET débite 1 crédit, de façon ATOMIQUE et IDEMPOTENTE.
 *
 * Deux gardes SQL dans une transaction :
 *  - le marquage `smsReminderSentAt` ne réussit que si la colonne est NULL
 *    (protection anti double-envoi, même en cas d'exécutions concurrentes) ;
 *  - le débit ne réussit que si `balance > 0` (jamais de solde négatif).
 * Si l'un échoue, la transaction est annulée (rollback) et rien n'est consommé.
 *
 * À appeler AVANT l'envoi réel : comme le crédit n'est pas gratuit, on préfère
 * ne jamais envoyer deux fois plutôt que risquer un double débit.
 */
export async function debitOneSms(
  companyId: number,
  bookingId: number,
): Promise<{ ok: boolean; reason: DebitReason }> {
  try {
    return await db.transaction(async (tx) => {
      // 1) Réservation du RDV (une seule fois).
      const claimed = await tx.execute(
        sql`UPDATE bookings SET "smsReminderSentAt" = now()
            WHERE id = ${bookingId} AND "companyId" = ${companyId} AND "smsReminderSentAt" IS NULL
            RETURNING id`,
      )
      if (claimed.rows.length === 0) {
        return { ok: false as const, reason: "already_sent" as DebitReason }
      }
      // 2) Débit atomique (rollback du marquage si le solde est insuffisant).
      const debited = await tx
        .update(smsCredits)
        .set({ balance: sql`${smsCredits.balance} - 1`, updatedAt: new Date() })
        .where(and(eq(smsCredits.companyId, companyId), sql`${smsCredits.balance} > 0`))
        .returning({ id: smsCredits.id })
      if (debited.length === 0) {
        throw new Error("NO_CREDIT")
      }
      return { ok: true as const, reason: "ok" as DebitReason }
    })
  } catch (e) {
    if (e instanceof Error && e.message === "NO_CREDIT") {
      return { ok: false, reason: "no_credit" }
    }
    console.log("[v0] debitOneSms error:", e instanceof Error ? e.message : e)
    return { ok: false, reason: "unknown" }
  }
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
  return db.transaction(async (tx) => {
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
}
