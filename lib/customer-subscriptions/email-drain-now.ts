import { after } from "next/server"

/**
 * Envoi immédiat des e-mails d'abonnements clients (L81).
 *
 * Le cron horaire n'est plus qu'un filet de sécurité : quand un e-mail vient
 * d'être mis en file, on planifie un envoi APRÈS la réponse (donc après le commit
 * de la transaction métier) avec la même fonction que le cron. Idempotence
 * inchangée : dedupeKey UNIQUE + claim FOR UPDATE SKIP LOCKED.
 *
 * Jamais d'impact sur la transaction ni sur la réponse : toute erreur est avalée
 * (journal sans donnée personnelle) et le cron horaire rattrape.
 */
export const IMMEDIATE_DRAIN_LIMIT = 10

/** Tenants dont un envoi immédiat est déjà planifié (un seul envoi par tenant en attente). */
const pendingCompanies = new Map<number, number>()

/** Expiration d'une planification restée sans exécution (instance coupée avant `after`). */
export const PENDING_TTL_MS = 60_000

export async function runImmediateDrain(companyId: number): Promise<void> {
  // Libéré AVANT le drain : un e-mail mis en file pendant l'envoi planifie son propre drain
  // (le claim SKIP LOCKED évite tout double envoi).
  pendingCompanies.delete(companyId)
  try {
    // Imports tardifs : évite un cycle email-events → email-drain-now → notifications → engine.
    const [{ db }, { drainCustomerSubscriptionOutbox }, { sendEmail }] = await Promise.all([
      import("@/lib/db"),
      import("./notifications"),
      import("@/lib/email/send"),
    ])
    await drainCustomerSubscriptionOutbox(db as never, (args) => sendEmail(args as never), new Date(), {
      limit: IMMEDIATE_DRAIN_LIMIT,
      companyId,
    })
  } catch (error) {
    console.log("[customer-subscriptions] immediate email drain failed", { code: (error as { code?: string })?.code ?? "unknown" })
  }
}

/** Planifie l'envoi immédiat après la réponse. Ne lève jamais d'erreur. */
export function scheduleImmediateEmailDrain(companyId: number): void {
  const since = pendingCompanies.get(companyId)
  if (since !== undefined && Date.now() - since < PENDING_TTL_MS) return
  pendingCompanies.set(companyId, Date.now())
  try {
    after(() => runImmediateDrain(companyId))
  } catch {
    // Pas de contexte de requête (script, test) : le cron horaire rattrape.
    pendingCompanies.delete(companyId)
  }
}
