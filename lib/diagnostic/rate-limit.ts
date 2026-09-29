import "server-only"

import { checkRateLimit } from "@vercel/firewall"

/**
 * Protection anti-abus du questionnaire « site sur mesure ».
 *
 * S'appuie sur le RATE LIMITING NATIF de la Vercel Firewall (`@vercel/firewall`),
 * c'est-à-dire l'infrastructure de déploiement elle-même : le comptage est
 * distribué et appliqué au bord du réseau, indépendamment du nombre
 * d'instances serverless. Ce n'est donc PAS un compteur mémoire local (une
 * `Map` par instance ne serait pas fiable).
 *
 * ⚠️ CONFIGURATION REQUISE CÔTÉ VERCEL (à faire manuellement dans le tableau de
 * bord du projet → Firewall) : créer une règle de rate limit dont l'identifiant
 * correspond EXACTEMENT à `DIAGNOSTIC_RATE_LIMIT_ID`, avec :
 *   - Fenêtre : 10 minutes — Limite : 5 requêtes par clé (IP) → puis blocage temporaire.
 *   - (Optionnel) une limite journalière raisonnable (ex. 20 / 24 h) sur le même chemin.
 * Sans cette règle, `checkRateLimit` renvoie `error: "not-found"` et, par
 * sécurité (fail-closed), la soumission est refusée avec le message générique.
 *
 * Le seuil exact et le mécanisme ne sont jamais révélés au client.
 */
export const DIAGNOSTIC_RATE_LIMIT_ID = "diagnostic-form"

/** Message générique en cas de dépassement de la limite (sans révéler le seuil). */
export const DIAGNOSTIC_RATE_LIMITED_MESSAGE =
  "Trop de demandes ont été envoyées. Merci de réessayer dans quelques minutes."

/**
 * Message générique lorsque la protection anti-abus est INDISPONIBLE
 * (service de rate limit injoignable, ou règle Firewall non déployée en
 * production). Par sécurité (fail-closed) on refuse la soumission plutôt que
 * de laisser partir des emails sans protection. Ne révèle aucune information
 * technique (ni cause, ni seuil, ni mécanisme).
 */
export const DIAGNOSTIC_UNAVAILABLE_MESSAGE =
  "Nous ne pouvons pas traiter votre demande pour le moment. Merci de réessayer dans quelques minutes."

/** Fenêtre / limite attendues, documentées pour la config Firewall et les tests. */
export const DIAGNOSTIC_RATE_LIMIT = {
  /** Nombre maximal de soumissions par IP sur la fenêtre. */
  max: 5,
  /** Fenêtre glissante, en secondes (10 minutes). */
  windowSeconds: 600,
} as const

export type RateLimitDecision =
  | { limited: false }
  /**
   * `quota`/`blocked` = limite réellement atteinte.
   * `config` = règle Firewall absente en production (fail-closed).
   * `unavailable` = service de rate limit injoignable (fail-closed).
   */
  | { limited: true; reason: "quota" | "blocked" | "config" | "unavailable" }

/**
 * Vérifie le rate limit pour la requête courante. Renvoie une décision simple
 * plutôt que de lever, pour que la Server Action décide de la réponse (429).
 *
 * En développement local (pas de Firewall), `checkRateLimit` ne trouve pas la
 * règle : on NE bloque pas le développement, mais on journalise le point.
 */
export async function checkDiagnosticRateLimit(headers: Headers): Promise<RateLimitDecision> {
  try {
    const { rateLimited, error } = await checkRateLimit(DIAGNOSTIC_RATE_LIMIT_ID, { headers })

    if (error === "blocked") return { limited: true, reason: "blocked" }

    if (error === "not-found") {
      // Règle non déployée. En production c'est une erreur de configuration :
      // on refuse par sécurité. En développement, on laisse passer.
      if (process.env.NODE_ENV === "production") {
        console.log("[DetailFlow] Rate limit diagnostic non configuré (règle Firewall introuvable).")
        return { limited: true, reason: "config" }
      }
      return { limited: false }
    }

    return rateLimited ? { limited: true, reason: "quota" } : { limited: false }
  } catch {
    // FAIL-CLOSED : si le service de rate limit est injoignable, on REFUSE la
    // soumission (qui déclenche un email public vers Resend) plutôt que de la
    // laisser passer sans protection. Ne casse que la SOUMISSION du diagnostic,
    // pas le reste du site. Aucune donnée sensible n'est journalisée.
    console.log("[DetailFlow] Rate limit diagnostic indisponible (service injoignable) — soumission refusée (fail-closed).")
    return { limited: true, reason: "unavailable" }
  }
}
