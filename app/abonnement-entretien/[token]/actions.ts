"use server"

import { customerErrorMessage } from "@/lib/customer-subscriptions/customer-service"
import { assertSameOrigin, customerDb, customerStripePort } from "@/lib/customer-subscriptions/customer-portal.server"
import { PaymentLinkInvalidError, startCheckoutForManageToken } from "@/lib/customer-subscriptions/payment-link"
import { resolvePublicRequestTenant } from "@/lib/tenant"
import type { CheckoutActionResult } from "@/app/abonnements/gerer/actions"

export const PAYMENT_LINK_INVALID_MESSAGE = "Ce lien est invalide ou n’est plus disponible."

/** Seuls le token (autorisation) et le booléen de consentement viennent du navigateur. */
export async function startPaymentLinkCheckoutAction(token: string, termsAccepted: boolean): Promise<CheckoutActionResult> {
  if (!(await assertSameOrigin())) return { ok: false, message: "Cette action n'a pas pu être vérifiée. Rechargez la page et réessayez." }
  try {
    const tenant = await resolvePublicRequestTenant()
    const r = await startCheckoutForManageToken(customerDb, customerStripePort(), {
      token,
      resolvedCompanyId: tenant?.id ?? null,
      termsAccepted: termsAccepted === true,
    })
    return { ok: true, clientSecret: r.clientSecret, connectedAccountId: r.connectedAccountId }
  } catch (e) {
    if (e instanceof PaymentLinkInvalidError) return { ok: false, message: PAYMENT_LINK_INVALID_MESSAGE }
    return { ok: false, message: customerErrorMessage(e) }
  }
}
