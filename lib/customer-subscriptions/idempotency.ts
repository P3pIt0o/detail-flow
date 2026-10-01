import "server-only"
import { createHash } from "node:crypto"
import { CustomerSubscriptionError } from "./errors"

export type IdempotentOperation = "subscription.create"

const CLIENT_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/

/**
 * Clé DÉRIVÉE serveur : jamais la clé du navigateur seule. Elle lie le tenant
 * (contexte serveur), le type d'opération et l'objet concerné, si bien qu'une
 * même clé client rejouée chez un autre tenant ou pour une autre formule ne
 * collisionne pas.
 */
export function deriveIdempotencyKey(input: {
  companyId: number
  operation: IdempotentOperation
  subjectId: string | number
  clientKey: string
}): string {
  if (!Number.isInteger(input.companyId) || input.companyId <= 0) throw new CustomerSubscriptionError("FORBIDDEN")
  if (typeof input.clientKey !== "string" || !CLIENT_KEY_PATTERN.test(input.clientKey)) {
    throw new CustomerSubscriptionError("CONFLICT", [{ field: "idempotencyKey", code: "CONFLICT" }])
  }
  return createHash("sha256")
    .update(`${input.companyId}\u0000${input.operation}\u0000${input.subjectId}\u0000${input.clientKey}`)
    .digest("hex")
}
