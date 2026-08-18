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
 * Implémentation Stripe Connect (destination charges).
 * Le client paie sur le compte connecté du professionnel ; DetailFlow prélève
 * `application_fee_amount` sur les fonds du professionnel (le prix client n'est
 * jamais majoré). Les données bancaires restent 100 % chez Stripe.
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
    // Checkout embarqué : Stripe gère toute la saisie carte (aucune donnée
    // sensible ne transite par DetailFlow). Destination charge + commission.
    const session = await stripe.checkout.sessions.create({
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
      payment_intent_data: {
        application_fee_amount: input.applicationFeeCents,
        transfer_data: { destination: input.connectedAccountId },
        metadata: input.metadata,
      },
      metadata: input.metadata,
      return_url: `${input.returnUrl}?session_id={CHECKOUT_SESSION_ID}`,
    })
    if (!session.client_secret) throw new Error("Stripe : client_secret manquant")
    return { externalId: session.id, clientSecret: session.client_secret }
  },

  async refundPayment(paymentIntentId, _connectedAccountId, amountCents) {
    const stripe = getStripe()
    // Destination charge : le remboursement + la reprise de commission se font
    // sur le compte PLATEFORME (pas d'en-tête stripeAccount).
    await stripe.refunds.create({
      payment_intent: paymentIntentId,
      ...(amountCents != null ? { amount: amountCents } : {}),
      reverse_transfer: true,
      refund_application_fee: true,
    })
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
