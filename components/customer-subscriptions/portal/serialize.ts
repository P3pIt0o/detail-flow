import { formatDateFr, formatMoney } from "@/lib/customer-subscriptions/contract-summary"
import type { CustomerAction, CustomerPortalView } from "@/lib/customer-subscriptions/customer-service"

/**
 * Vue préparée pour le client : textes de conséquence déjà formatés serveur.
 * Aucun identifiant (subscriptionId, companyId) n'est transmis au navigateur.
 */
export type SerializedAction =
  | { kind: "checkout"; step: "initial_cleaning" | "subscription" }
  | { kind: "renewal_opt_out"; consequence: string }
  | { kind: "revoke_renewal_opt_out"; consequence: string }
  | { kind: "schedule_cancellation"; consequence: string; confirmLabel: string }
  | { kind: "early_cancellation_request" }

export type SerializedPortalActions = {
  primary: SerializedAction | null
  secondary: SerializedAction | null
  pendingEarlyCancellation: { since: string } | null
  paymentIssue: boolean
  providerSyncPending: boolean
  terminal: boolean
}

function serialize(a: CustomerAction | null, currency: string): SerializedAction | null {
  if (!a) return null
  switch (a.kind) {
    case "checkout":
    case "early_cancellation_request":
      return a
    case "renewal_opt_out": {
      let consequence = `Votre formule restera active jusqu'au ${formatDateFr(a.serviceUntil)}.`
      if (a.lastPaymentAt && a.lastPaymentCents != null)
        consequence += ` Une dernière échéance de ${formatMoney(a.lastPaymentCents, currency)} est prévue le ${formatDateFr(a.lastPaymentAt)}.`
      return { kind: a.kind, consequence }
    }
    case "revoke_renewal_opt_out":
      return { kind: a.kind, consequence: `Votre abonnement continuera après le ${formatDateFr(a.continuesAfter)}.` }
    case "schedule_cancellation": {
      const date = formatDateFr(a.cancelAt)
      return { kind: a.kind, consequence: `Votre abonnement restera actif jusqu'au ${date}.`, confirmLabel: `Confirmer l'arrêt au ${date}` }
    }
  }
}

export function serializePortalActions(view: CustomerPortalView): SerializedPortalActions {
  const currency = view.summary.price.currency
  return {
    primary: serialize(view.primaryAction, currency),
    secondary: serialize(view.secondaryAction, currency),
    pendingEarlyCancellation: view.pendingEarlyCancellation ? { since: formatDateFr(view.pendingEarlyCancellation.createdAt) } : null,
    paymentIssue: view.paymentIssue,
    providerSyncPending: view.providerSyncPending,
    terminal: view.terminal,
  }
}
