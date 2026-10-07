/**
 * Garde globale des automatisations LOT D (rappel pro + demande d'avis).
 *
 * Fichier PUR. `NOTIFICATIONS_ENABLED !== "true"` signifie AUCUN traitement :
 * pas de recherche de candidats, pas de claim outbox, pas d'écriture, pas d'envoi.
 * Seuls des booléens dérivés sont exposés à l'UI (jamais une valeur ni le nom
 * d'une variable).
 */

type Env = Record<string, string | undefined>

export function notificationsRuntimeEnabled(env: Env = process.env): boolean {
  return env.NOTIFICATIONS_ENABLED === "true"
}

/** Validation stricte d'un destinataire avant tout appel fournisseur. */
export function isValidNotificationEmail(value: string | null | undefined): value is string {
  if (typeof value !== "string") return false
  const v = value.trim()
  if (v.length < 6 || v.length > 254) return false
  return /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:.]{2,}$/.test(v)
}

/** Adresse extraite de "Nom <email>" ou "email", validée ; sinon null. */
function extractSenderAddress(value: string | undefined): string | null {
  if (typeof value !== "string" || !value.trim()) return null
  const angle = value.match(/<([^>]+)>/)
  const raw = (angle ? angle[1] : value).trim()
  return isValidNotificationEmail(raw) ? raw : null
}

/** Infrastructure email LOT D prête : clé fournisseur + expéditeur vérifiable. */
export function emailInfrastructureReady(env: Env = process.env): boolean {
  return Boolean(env.RESEND_API_KEY && env.RESEND_API_KEY.trim()) && extractSenderAddress(env.EMAIL_FROM) !== null
}

/**
 * Origine publique HTTPS servant aux liens de désinscription. Un hôte nu est
 * préfixé en https ; http, identifiants ou URL illisible => null.
 */
export function resolvePublicBaseUrl(env: Env = process.env): string | null {
  const raw = (env.NEXT_PUBLIC_SITE_URL || env.NEXT_PUBLIC_ROOT_DOMAIN || "").trim()
  if (!raw) return null
  const withProto = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    const u = new URL(withProto)
    if (u.protocol !== "https:" || u.username || u.password || !u.hostname) return null
    return u.origin
  } catch {
    return null
  }
}

/** Capacité à générer un lien de désinscription signé (secret + origine HTTPS). */
export function optOutInfrastructureReady(env: Env = process.env): boolean {
  return Boolean(env.BETTER_AUTH_SECRET && env.BETTER_AUTH_SECRET.trim()) && resolvePublicBaseUrl(env) !== null
}

/** Disponibilité serveur d'une NOUVELLE activation du rappel pro. */
export function proReminderInfrastructureReady(env: Env = process.env): boolean {
  return notificationsRuntimeEnabled(env) && emailInfrastructureReady(env)
}

/** Disponibilité serveur d'une NOUVELLE activation de la demande d'avis. */
export function reviewRequestInfrastructureReady(env: Env = process.env): boolean {
  return proReminderInfrastructureReady(env) && optOutInfrastructureReady(env)
}

/** URL https absolue syntaxiquement valide (garde runtime avant envoi). */
export function isHttpsUrl(value: string | null | undefined): value is string {
  if (typeof value !== "string" || !value) return false
  try {
    const u = new URL(value)
    return u.protocol === "https:" && !u.username && !u.password && Boolean(u.hostname)
  } catch {
    return false
  }
}
