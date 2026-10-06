"use server"

import { revalidatePath } from "next/cache"
import { CUSTOMER_MANAGE_PATH } from "@/lib/customer-subscriptions/customer-access"
import {
  customerErrorMessage,
  customerRequestEarlyCancellation,
  customerRequestRenewalOptOut,
  customerRevokeRenewalOptOut,
  customerScheduleCancellation,
  customerStartCheckout,
  customerWithdrawEarlyCancellation,
} from "@/lib/customer-subscriptions/customer-service"
import { assertSameOrigin, customerDb, customerStripePort, getCustomerRequestContext } from "@/lib/customer-subscriptions/customer-portal.server"
import { formatDateFr } from "@/lib/customer-subscriptions/contract-summary"
import type { ProviderSyncOutcome } from "@/lib/customer-subscriptions/payments"

export type CustomerActionResult = { ok: true; message: string; syncPending: boolean } | { ok: false; message: string }

const SYNC_PENDING = "Votre demande est enregistrée. La synchronisation du paiement est en cours."
const CROSS_SITE = "Cette action n'a pas pu être vérifiée. Rechargez la page et réessayez."

async function run(fn: () => Promise<{ message: string; provider?: ProviderSyncOutcome }>): Promise<CustomerActionResult> {
  if (!(await assertSameOrigin())) return { ok: false, message: CROSS_SITE }
  try {
    const r = await fn()
    revalidatePath(CUSTOMER_MANAGE_PATH)
    const syncPending = r.provider?.status === "pending_retry"
    return { ok: true, message: syncPending ? SYNC_PENDING : r.message, syncPending }
  } catch (e) {
    return { ok: false, message: customerErrorMessage(e) }
  }
}

export async function confirmRenewalOptOutAction(): Promise<CustomerActionResult> {
  return run(async () => {
    const r = await customerRequestRenewalOptOut(customerDb, customerStripePort(), await getCustomerRequestContext())
    return { message: "Votre non-renouvellement est enregistré.", provider: r.provider }
  })
}

export async function revokeRenewalOptOutAction(): Promise<CustomerActionResult> {
  return run(async () => {
    const r = await customerRevokeRenewalOptOut(customerDb, customerStripePort(), await getCustomerRequestContext())
    return { message: "Votre abonnement continuera après la fin de la période en cours.", provider: r.provider }
  })
}

export async function scheduleCancellationAction(): Promise<CustomerActionResult> {
  return run(async () => {
    const r = await customerScheduleCancellation(customerDb, customerStripePort(), await getCustomerRequestContext())
    const at = r.cancelAt ? formatDateFr(new Date(r.cancelAt)) : null
    return { message: at ? `Votre abonnement prendra fin le ${at}.` : "Votre arrêt est enregistré.", provider: r.provider }
  })
}

/** Seul le message facultatif est lu depuis le formulaire. */
export async function requestEarlyCancellationAction(formData: FormData): Promise<CustomerActionResult> {
  const message = formData.get("message")
  return run(async () => {
    await customerRequestEarlyCancellation(customerDb, await getCustomerRequestContext(), { message: typeof message === "string" ? message : undefined })
    return { message: "Votre demande a été transmise au professionnel." }
  })
}

export async function withdrawEarlyCancellationAction(): Promise<CustomerActionResult> {
  return run(async () => {
    await customerWithdrawEarlyCancellation(customerDb, await getCustomerRequestContext())
    return { message: "Votre demande a été retirée." }
  })
}

export type CheckoutActionResult = { ok: true; clientSecret: string; connectedAccountId: string } | { ok: false; message: string }

/** Seul `termsAccepted` (booléen) est transmis ; prix, compte et retour sont rechargés serveur. */
export async function startCustomerCheckoutAction(termsAccepted: boolean): Promise<CheckoutActionResult> {
  if (!(await assertSameOrigin())) return { ok: false, message: CROSS_SITE }
  try {
    const r = await customerStartCheckout(customerDb, customerStripePort(), await getCustomerRequestContext(), { termsAccepted: termsAccepted === true })
    return { ok: true, clientSecret: r.clientSecret, connectedAccountId: r.connectedAccountId }
  } catch (e) {
    return { ok: false, message: customerErrorMessage(e) }
  }
}
