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

/**
 * Débite exactement 1 crédit de façon ATOMIQUE (protection contre les soldes
 * négatifs et les débits concurrents). Renvoie true si le débit a eu lieu.
 * L'appelant NE doit débiter qu'APRÈS un envoi SMS réussi.
 */
export async function debitOneSms(companyId: number): Promise<boolean> {
  const updated = await db
    .update(smsCredits)
    .set({ balance: sql`${smsCredits.balance} - 1`, updatedAt: new Date() })
    .where(and(eq(smsCredits.companyId, companyId), sql`${smsCredits.balance} > 0`))
    .returning({ id: smsCredits.id })
  return updated.length > 0
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

export type CreditRechargeResult =
  | { ok: true; quantity: number; newBalance: number; companyId: number; reference: string; alreadyPaid?: boolean }
  | { ok: false; error: string }

/**
 * Crédite les SMS d'une demande de recharge — RÉSERVÉ au super-admin.
 *
 * IDEMPOTENT : le passage pending → paid se fait via un UPDATE conditionnel sur
 * `status = 'pending'`. Si 0 ligne est affectée (déjà payée / annulée), on NE
 * crédite PAS. Ainsi, un double-clic ou un rechargement de page ne crédite
 * jamais deux fois.
 */
export async function creditRechargeRequest(requestId: number): Promise<CreditRechargeResult> {
  // 1) Transition atomique pending -> paid (gagne la course une seule fois).
  const claimed = await db
    .update(smsRechargeRequests)
    .set({ status: "paid", validatedAt: new Date() })
    .where(and(eq(smsRechargeRequests.id, requestId), eq(smsRechargeRequests.status, "pending")))
    .returning({
      companyId: smsRechargeRequests.companyId,
      quantity: smsRechargeRequests.quantity,
      reference: smsRechargeRequests.reference,
    })

  if (!claimed.length) {
    // Déjà traitée (ou inexistante) : on ne crédite pas — renvoie l'état courant.
    const [existing] = await db
      .select({ status: smsRechargeRequests.status, reference: smsRechargeRequests.reference })
      .from(smsRechargeRequests)
      .where(eq(smsRechargeRequests.id, requestId))
      .limit(1)
    if (!existing) return { ok: false, error: "Demande introuvable." }
    return { ok: false, error: `Demande déjà traitée (statut : ${existing.status}).` }
  }

  const { companyId, quantity, reference } = claimed[0]

  // 2) Créditer le solde (la transition a déjà été "gagnée", donc exactement 1 fois).
  await ensureCreditsRow(companyId)
  const [row] = await db
    .update(smsCredits)
    .set({
      balance: sql`${smsCredits.balance} + ${quantity}`,
      purchased: sql`${smsCredits.purchased} + ${quantity}`,
      updatedAt: new Date(),
    })
    .where(eq(smsCredits.companyId, companyId))
    .returning({ balance: smsCredits.balance })

  return { ok: true, quantity, newBalance: row?.balance ?? quantity, companyId, reference }
}

/** Annule une demande pending -> cancelled (idempotent, super-admin). */
export async function cancelRechargeRequest(requestId: number): Promise<{ ok: boolean; error?: string }> {
  const updated = await db
    .update(smsRechargeRequests)
    .set({ status: "cancelled" })
    .where(and(eq(smsRechargeRequests.id, requestId), eq(smsRechargeRequests.status, "pending")))
    .returning({ id: smsRechargeRequests.id })
  if (!updated.length) return { ok: false, error: "Demande introuvable ou déjà traitée." }
  return { ok: true }
}
