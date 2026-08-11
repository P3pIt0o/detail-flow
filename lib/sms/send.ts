import "server-only"

/**
 * Abstraction MINIMALE d'envoi de SMS.
 *
 * Un seul point d'entrée `sendSms({ to, message })`. Aujourd'hui aucun
 * fournisseur n'est branché : si les credentials sont absents, on n'échoue pas —
 * on log et on renvoie `{ ok: false, skipped: true }`. Cela permet de préparer
 * proprement l'intégration (table de crédits, débit, UI) sans bloquer.
 *
 * Pour brancher un fournisseur plus tard, il suffit d'implémenter l'appel HTTP
 * ICI, sans toucher à la logique métier (crédits, rappels).
 *
 * Variables d'environnement attendues (à définir quand un fournisseur est choisi) :
 *   - SMS_PROVIDER_API_KEY  : clé d'API du fournisseur SMS
 *   - SMS_SENDER_ID         : nom/numéro d'expéditeur affiché (optionnel)
 */

export type SendSmsResult = { ok: boolean; id?: string; error?: string; skipped?: boolean }

type SendSmsArgs = {
  /** Numéro du destinataire (format international recommandé, ex. +33…). */
  to: string
  /** Corps du message (texte brut). */
  message: string
}

const apiKey = process.env.SMS_PROVIDER_API_KEY

/**
 * Envoie un SMS. Ne lève jamais : renvoie un résultat structuré pour que le
 * flux métier (débit de crédit, marqueur d'envoi) décide de la suite.
 */
export async function sendSms(args: SendSmsArgs): Promise<SendSmsResult> {
  if (!args.to || !args.message) {
    return { ok: false, error: "Numéro ou message manquant." }
  }

  if (!apiKey) {
    console.log("[v0] SMS non envoyé (SMS_PROVIDER_API_KEY manquante) —", args.to)
    return { ok: false, skipped: true, error: "SMS_PROVIDER_API_KEY manquante" }
  }

  // Point d'intégration du fournisseur : implémenter ici l'appel HTTP réel.
  // Tant que ce n'est pas fait, on considère l'envoi comme non abouti (pas de
  // débit de crédit côté appelant).
  console.log("[v0] Fournisseur SMS non implémenté — envoi ignoré pour", args.to)
  return { ok: false, skipped: true, error: "Fournisseur SMS non configuré" }
}
