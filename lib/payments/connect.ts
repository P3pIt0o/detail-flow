import "server-only"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { getStripe } from "./stripe-client"

/**
 * Stripe Connect (comptes Express).
 * Le professionnel connecte SON compte via le parcours officiel Stripe : il ne
 * saisit jamais de clé API ni d'account ID. DetailFlow stocke uniquement, côté
 * serveur, l'`acct_...` correspondant au tenant (isolation stricte).
 */

/** Récupère (ou crée) le compte connecté du tenant et renvoie son id. */
async function ensureConnectedAccount(companyId: number): Promise<string> {
  const [c] = await db
    .select({ id: companies.id, stripeAccountId: companies.stripeAccountId, country: companies.country, email: companies.email, name: companies.name })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1)
  if (!c) throw new Error("Entreprise introuvable")
  if (c.stripeAccountId) return c.stripeAccountId

  const stripe = getStripe()
  const account = await stripe.accounts.create({
    type: "express",
    country: (c.country || "FR").toUpperCase(),
    email: c.email || undefined,
    // Direct Charges par carte : le compte connecté doit pouvoir encaisser des
    // cartes (card_payments) et recevoir des transferts (transfers).
    capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
    business_profile: { name: c.name || undefined },
    metadata: { companyId: String(companyId) },
  })

  await db
    .update(companies)
    .set({ stripeAccountId: account.id, paymentProvider: "stripe", updatedAt: new Date() })
    .where(eq(companies.id, companyId))
  return account.id
}

/**
 * Démarre/reprend l'onboarding Stripe : renvoie l'URL du parcours officiel.
 * `refreshUrl` (lien expiré/repris) et `returnUrl` (retour après complétion)
 * doivent être des URLs absolues du tenant courant.
 */
export async function createOnboardingLink(input: {
  companyId: number
  refreshUrl: string
  returnUrl: string
}): Promise<string> {
  const accountId = await ensureConnectedAccount(input.companyId)
  const stripe = getStripe()
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: input.refreshUrl,
    return_url: input.returnUrl,
    type: "account_onboarding",
  })
  return link.url
}

/**
 * Synchronise l'état du compte connecté depuis Stripe (source de vérité) et
 * met à jour les drapeaux locaux. À appeler au retour d'onboarding et à
 * l'ouverture de la page Paiements.
 */
export async function syncConnectAccountStatus(companyId: number): Promise<{
  connected: boolean
  chargesEnabled: boolean
  detailsSubmitted: boolean
}> {
  const [c] = await db
    .select({ stripeAccountId: companies.stripeAccountId })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1)
  if (!c?.stripeAccountId) return { connected: false, chargesEnabled: false, detailsSubmitted: false }

  const stripe = getStripe()
  const acct = await stripe.accounts.retrieve(c.stripeAccountId)
  const chargesEnabled = Boolean(acct.charges_enabled)
  const detailsSubmitted = Boolean(acct.details_submitted)
  const payoutsEnabled = Boolean(acct.payouts_enabled)

  await db
    .update(companies)
    .set({
      stripeChargesEnabled: chargesEnabled,
      stripeDetailsSubmitted: detailsSubmitted,
      stripePayoutsEnabled: payoutsEnabled,
      updatedAt: new Date(),
    })
    .where(eq(companies.id, companyId))

  return { connected: true, chargesEnabled, detailsSubmitted }
}

/** Crée un lien vers le tableau de bord Express du professionnel (gestion compte). */
export async function createExpressLoginLink(companyId: number): Promise<string | null> {
  const [c] = await db
    .select({ stripeAccountId: companies.stripeAccountId })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1)
  if (!c?.stripeAccountId) return null
  const stripe = getStripe()
  const link = await stripe.accounts.createLoginLink(c.stripeAccountId)
  return link.url
}
