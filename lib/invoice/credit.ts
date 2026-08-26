/**
 * ============================================================================
 *  AVOIRS (notes de crédit) — logique PURE et partagée
 * ============================================================================
 *  Fonctions sans I/O (aucun accès DB) : plafond de cumul, validation du motif
 *  et du montant. Utilisées par les actions serveur ET par les tests. Le
 *  serveur reste la seule autorité : ces helpers ne remplacent pas les
 *  vérifications d'appartenance (companyId) faites côté action.
 * ============================================================================
 */

export const CREDIT_NOTE_DOCUMENT_TYPE = "credit_note"
export const INVOICE_DOCUMENT_TYPE = "invoice"

/** Un avoir ne peut être créé que depuis une facture émise ou payée. */
export const CREDITABLE_INVOICE_STATUSES = ["issued", "paid"] as const

export type CreditSummary = {
  /** Total déjà crédité (somme des avoirs ÉMIS), en centimes. */
  creditedCents: number
  /** Montant restant crédité possible (jamais négatif), en centimes. */
  remainingCents: number
  /** true si la facture est intégralement créditée. */
  fullyCredited: boolean
}

/**
 * Récapitule le crédit d'une facture d'origine à partir de son total et des
 * montants des avoirs DÉJÀ ÉMIS. Les montants d'avoir sont stockés POSITIFS.
 */
export function computeCreditSummary(originalTotalCents: number, issuedCreditTotals: number[]): CreditSummary {
  const credited = issuedCreditTotals.reduce((sum, c) => sum + Math.max(0, c), 0)
  const remaining = Math.max(0, originalTotalCents - credited)
  return {
    creditedCents: credited,
    remainingCents: remaining,
    // Intégralement créditée uniquement si la facture a un total positif.
    fullyCredited: originalTotalCents > 0 && credited >= originalTotalCents,
  }
}

/**
 * Un nouvel avoir de `newCreditCents` peut-il être émis sans que le CUMUL des
 * avoirs dépasse le total de la facture d'origine ? (le montant doit aussi être
 * strictement positif). `alreadyIssuedCents` = somme des avoirs déjà émis
 * (hors celui en cours d'émission).
 */
export function canIssueCredit(
  originalTotalCents: number,
  alreadyIssuedCents: number,
  newCreditCents: number,
): { ok: true } | { ok: false; error: string } {
  if (!Number.isFinite(newCreditCents) || newCreditCents <= 0) {
    return { ok: false, error: "Le montant de l'avoir doit être strictement positif." }
  }
  if (alreadyIssuedCents + newCreditCents > originalTotalCents) {
    return {
      ok: false,
      error: "Le cumul des avoirs dépasserait le total de la facture d'origine.",
    }
  }
  return { ok: true }
}

/** Motif d'avoir obligatoire (non vide après trim). Renvoie le motif nettoyé. */
export function validateCreditReason(reason: string | null | undefined): { ok: true; reason: string } | { ok: false; error: string } {
  const cleaned = (reason ?? "").trim()
  if (cleaned.length === 0) {
    return { ok: false, error: "Le motif de l'avoir est obligatoire." }
  }
  return { ok: true, reason: cleaned }
}

/** true si le document est un avoir. */
export function isCreditNote(documentType: string | null | undefined): boolean {
  return documentType === CREDIT_NOTE_DOCUMENT_TYPE
}
