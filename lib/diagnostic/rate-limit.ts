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

/** Fenêtre / limite attendues, documentées pour la config Firewall et les tests. */
export const DIAGNOSTIC_RATE_LIMIT = {
  /** Nombre maximal de soumissions par IP sur la fenêtre. */
  max: 5,
  /** Fenêtre glissante, en secondes (10 minutes). */
  windowSeconds: 600,
} as const

export type RateLimitDecision =
  | { limited: false }
  /** `reason: "config"` = règle Firewall absente (fail-closed). */
  | { limited: true; reason: "quota" | "blocked" | "config" }

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
    // Indisponibilité du service de rate limit : ne pas casser le formulaire.
    return { limited: false }
  }
}
