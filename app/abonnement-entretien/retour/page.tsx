import type { Metadata } from "next"
import { CustomerShell } from "@/components/customer-subscriptions/portal/customer-shell"
import { readCheckoutReturnState } from "@/lib/customer-subscriptions/customer-service"
import { customerDb } from "@/lib/customer-subscriptions/customer-portal.server"
import { resolvePublicRequestTenant } from "@/lib/tenant"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Activation de votre abonnement", robots: { index: false, follow: false }, referrer: "no-referrer" }

/** Retour navigateur ≠ preuve de paiement : lecture DB seule, aucune mutation. */
export default async function SubscriptionReturnPage({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const [{ session_id }, tenant] = await Promise.all([searchParams, resolvePublicRequestTenant()])
  const state = await readCheckoutReturnState(customerDb, tenant?.id ?? null, session_id)

  return (
    <div className="min-h-dvh bg-background font-sans text-foreground">
      <CustomerShell title={state === "active" ? "Votre abonnement est actif." : state === "processing" ? "Paiement reçu. Activation en cours…" : "Nous n'avons pas pu vérifier ce paiement."} companyName={tenant?.name}>
        <p className="text-sm leading-relaxed text-muted-foreground" aria-live="polite">
          {state === "active"
            ? "Vous recevrez un email récapitulatif. Vous pouvez gérer votre abonnement depuis le lien « Gérer mon abonnement »."
            : state === "processing"
              ? "Votre abonnement est en cours d’activation. Vous recevrez un email de confirmation dès qu'elle sera terminée."
              : "Rouvrez le lien reçu par email ou contactez le professionnel si le problème persiste."}
        </p>
      </CustomerShell>
    </div>
  )
}
