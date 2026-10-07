/**
 * Garde globale des automatisations LOT D (rappel pro + demande d'avis).
 *
 * Fichier PUR. `NOTIFICATIONS_ENABLED !== "true"` signifie AUCUN traitement :
 * pas de recherche de candidats, pas de claim outbox, pas d'écriture, pas d'envoi.
 * Seul un booléen dérivé est exposé à l'UI (jamais la valeur ni le nom de la variable).
 */
export function notificationsRuntimeEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.NOTIFICATIONS_ENABLED === "true"
}

/** Validation stricte d'un destinataire avant tout appel fournisseur. */
export function isValidNotificationEmail(value: string | null | undefined): value is string {
  if (typeof value !== "string") return false
  const v = value.trim()
  if (v.length < 6 || v.length > 254) return false
  return /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:.]{2,}$/.test(v)
}
