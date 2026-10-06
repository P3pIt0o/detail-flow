/**
 * Changement du mode de souscription public. Ne modifie QUE la colonne
 * companies.customerSubscriptionPublicMode : abonnements, demandes et Stripe
 * existants restent strictement intacts.
 */
import { eq } from "drizzle-orm"
import { companies } from "@/lib/db/schema"
import { CustomerSubscriptionError } from "./errors"
import { appendMaintenanceAudit, assertCanMutate, type Actor, type Executor } from "./engine"
import { CUSTOMER_SUBSCRIPTION_PUBLIC_MODES, parsePublicMode, type CustomerSubscriptionPublicMode } from "./public-mode"

export function isAllowedPublicMode(v: unknown): v is CustomerSubscriptionPublicMode {
  return typeof v === "string" && (CUSTOMER_SUBSCRIPTION_PUBLIC_MODES as readonly string[]).includes(v)
}

export async function setCustomerSubscriptionPublicMode(
  db: Executor,
  companyId: number,
  actor: Actor,
  mode: unknown,
): Promise<{ mode: CustomerSubscriptionPublicMode; changed: boolean }> {
  assertCanMutate(actor)
  if (!isAllowedPublicMode(mode)) throw new CustomerSubscriptionError("INVALID_SUBMISSION")
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ mode: companies.customerSubscriptionPublicMode })
      .from(companies)
      .where(eq(companies.id, companyId))
      .for("update")
    if (!row) throw new CustomerSubscriptionError("FORBIDDEN")
    const previous = parsePublicMode(row.mode)
    if (previous === mode) return { mode, changed: false }
    await tx.update(companies).set({ customerSubscriptionPublicMode: mode }).where(eq(companies.id, companyId))
    await appendMaintenanceAudit(tx, {
      companyId,
      action: "public_mode_changed",
      actorType: "user",
      actorUserId: actor.userId,
      meta: { from: previous, to: mode },
    })
    return { mode, changed: true }
  })
}
