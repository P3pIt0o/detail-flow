/**
 * Configuration CENTRALE du module SMS (packs, prix, bonus, message par défaut).
 *
 * Point d'entrée unique : modifier les tarifs / quantités ICI et nulle part
 * ailleurs. Aucun autre composant ne doit coder de prix ou de quantité en dur.
 */

/** Bonus offert automatiquement aux entreprises bêta (attribué UNE seule fois). */
export const SMS_BETA_BONUS = 20

/** Seuil d'alerte "solde faible" (message discret + CTA d'achat). */
export const SMS_LOW_BALANCE_THRESHOLD = 5

/** Quantité minimale autorisée pour une recharge personnalisée. */
export const SMS_MIN_CUSTOM_QUANTITY = 20

/** Prix unitaire par défaut (en centimes) appliqué à une quantité personnalisée. */
export const SMS_UNIT_PRICE_CENTS = 12

/** Quantité maximale d'une recharge. */
export const SMS_MAX_CUSTOM_QUANTITY = 5000

/**
 * SMS crédités automatiquement chaque mois civil (fuseau du tenant), cumulables.
 * Source UNIQUE : landing et admin lisent ces valeurs. Les plans absents ne
 * reçoivent aucune attribution mensuelle automatique dans ce lot.
 */
export const SMS_MONTHLY_INCLUDED_BY_PLAN = { FREE: 0, PRO: 20 } as const

export function monthlyIncludedSms(plan: string | null | undefined): number {
  return plan === "FREE" || plan === "PRO" ? SMS_MONTHLY_INCLUDED_BY_PLAN[plan] : 0
}

/** Valide une quantité demandée (entier, bornes). Renvoie la quantité ou une erreur. */
export function validateSmsQuantity(input: unknown): { ok: true; quantity: number } | { ok: false; error: string } {
  const qty = Number(input)
  if (!Number.isInteger(qty) || qty < SMS_MIN_CUSTOM_QUANTITY) {
    return { ok: false, error: `Quantité minimale : ${SMS_MIN_CUSTOM_QUANTITY} SMS.` }
  }
  if (qty > SMS_MAX_CUSTOM_QUANTITY) return { ok: false, error: "Quantité trop élevée." }
  return { ok: true, quantity: qty }
}

/**
 * Packs proposés à l'achat. `amountCents` est le prix TTC affiché AVANT
 * validation. Modifier librement : c'est la seule source de vérité des tarifs.
 */
export type SmsPack = { quantity: number; amountCents: number }

export const SMS_PACKS: SmsPack[] = [
  { quantity: 20, amountCents: 300 },
  { quantity: 50, amountCents: 700 },
  { quantity: 100, amountCents: 1200 },
  { quantity: 200, amountCents: 2000 },
]

/** Message de rappel par défaut (placeholders {prenom} {entreprise} {date} {heure}). */
export const SMS_DEFAULT_TEMPLATE =
  "Bonjour {prenom}, rappel de votre rendez-vous chez {entreprise} le {date} à {heure}. À bientôt !"

/** Remplace les placeholders {prenom} {entreprise} {date} {heure} dans un modèle. */
export function renderSmsTemplate(
  template: string,
  vars: { prenom: string; entreprise: string; date: string; heure: string },
): string {
  return (template || SMS_DEFAULT_TEMPLATE)
    .replaceAll("{prenom}", vars.prenom)
    .replaceAll("{entreprise}", vars.entreprise)
    .replaceAll("{date}", vars.date)
    .replaceAll("{heure}", vars.heure)
}

/** Adresse interne notifiée à chaque nouvelle demande de recharge. */
export const SMS_NOTIFY_EMAIL = "sms@detailflow.fr"

/**
 * Calcule le montant (en centimes) d'une quantité arbitraire.
 * Si la quantité correspond exactement à un pack, on applique le prix du pack ;
 * sinon on facture au prix unitaire par défaut.
 */
export function amountForQuantity(quantity: number): number {
  const pack = SMS_PACKS.find((p) => p.quantity === quantity)
  if (pack) return pack.amountCents
  return Math.round(quantity * SMS_UNIT_PRICE_CENTS)
}

/** Formatte un montant en centimes vers "X,XX €". */
export function formatSmsAmount(amountCents: number): string {
  return `${(amountCents / 100).toFixed(2).replace(".", ",")} €`
}
