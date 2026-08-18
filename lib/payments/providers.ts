import "server-only"
import { getStripe } from "./stripe-client"
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  PaymentProviderId,
  PaymentStatus,
  ProviderCapabilities,
} from "./types"

/**
 * Implémentation Stripe Connect (DIRECT CHARGES).
 * Le PaymentIntent est créé DIRECTEMENT sur le compte connecté du professionnel
 * (en-tête `stripeAccount`) : le client paie sur le compte du detailer, qui
 * reçoit ses fonds via Stripe. DetailFlow peut prélever `application_fee_amount`
 * (0 par défaut aujourd'hui). Les données bancaires restent 100 % chez Stripe.
 */
const stripeCapabilities: ProviderCapabilities = {
  supportsOnlinePayments: true,
  supportsPlatformFees: true,
  supportsRefunds: true,
  supportsPartialRefunds: true,
  supportsDeposits: true,
}

const stripeProvider: PaymentProvider = {
  id: "stripe",
  capabilities: stripeCapabilities,

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const stripe = getStripe()
    // Direct Charge : commission éventuelle prélevée par la plateforme. On
    // n'envoie `application_fee_amount` QUE s'il est > 0 (Stripe préfère son
    // absence quand il n'y a pas de commission).
    const paymentIntentData =
      input.applicationFeeCents > 0
        ? { application_fee_amount: input.applicationFeeCents, metadata: input.metadata }
        : { metadata: input.metadata }

    // Checkout embarqué créé DANS LE CONTEXTE DU COMPTE CONNECTÉ (`stripeAccount`)
    // : le PaymentIntent naît directement sur le compte du professionnel.
    const session = await stripe.checkout.sessions.create(
      {
        ui_mode: "embedded_page",
        mode: "payment",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: input.currency.toLowerCase(),
              unit_amount: input.amountCents,
              product_data: { name: input.description },
            },
          },
        ],
        payment_intent_data: paymentIntentData,
        metadata: input.metadata,
        // Le caller fournit déjà l'URL complète (avec le placeholder session_id).
        return_url: input.returnUrl,
      },
      { stripeAccount: input.connectedAccountId },
    )
    if (!session.client_secret) throw new Error("Stripe : client_secret manquant")
    return { externalId: session.id, clientSecret: session.client_secret }
  },

  async refundPayment(paymentIntentId, connectedAccountId, amountCents) {
    const stripe = getStripe()
    // Direct Charge : le remboursement se fait DANS LE CONTEXTE du compte
    // connecté. `refund_application_fee` reprend la commission éventuelle.
    await stripe.refunds.create(
      {
        payment_intent: paymentIntentId,
        ...(amountCents != null ? { amount: amountCents } : {}),
        refund_application_fee: true,
      },
      { stripeAccount: connectedAccountId },
    )
  },
}

const registry: Partial<Record<PaymentProviderId, PaymentProvider>> = {
  stripe: stripeProvider,
  // sumup: à ajouter plus tard — aucune autre couche à modifier.
}

/** Renvoie le provider demandé, ou `null` s'il n'est pas (encore) implémenté. */
export function getPaymentProvider(id: PaymentProviderId | string | null | undefined): PaymentProvider | null {
  if (!id) return null
  return registry[id as PaymentProviderId] ?? null
}

/**
 * Traduit un statut Stripe (checkout session / payment intent) vers le statut
 * GÉNÉRIQUE DetailFlow. Le reste de l'app n'utilise jamais les statuts Stripe.
 */
export function mapStripeStatusToGeneric(input: {
  sessionStatus?: string | null
  paymentStatus?: string | null
}): PaymentStatus {
  const { sessionStatus, paymentStatus } = input
  if (paymentStatus === "paid" || sessionStatus === "complete") return "paid"
  if (sessionStatus === "expired") return "cancelled"
  if (paymentStatus === "unpaid" && sessionStatus === "open") return "pending"
  return "processing"
}
