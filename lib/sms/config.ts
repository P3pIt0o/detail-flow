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
