import "server-only"
import Stripe from "stripe"

/**
 * Client Stripe de la PLATEFORME DetailFlow (compte principal).
 * La clé secrète ne quitte jamais le serveur. Les opérations sur les comptes
 * connectés des professionnels utilisent l'en-tête `stripeAccount` au cas par cas.
 */
let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (_stripe) return _stripe
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error("STRIPE_SECRET_KEY manquante")
  // On laisse le SDK utiliser sa version d'API épinglée (évite les incohérences).
  _stripe = new Stripe(key)
  return _stripe
}

/** Vrai si la plateforme est configurée pour encaisser (clé présente). */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}
