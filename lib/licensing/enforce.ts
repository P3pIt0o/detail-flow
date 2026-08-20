import "server-only"

/**
 * Socle central des licences — APPLICATION des limites de création (Étape 2A).
 *
 * Wrapper serveur mince au-dessus du resolver central : il NE réimplémente
 * aucune logique de licence, il consomme `getLimit()` (source de vérité) puis
 * la règle PURE `isCreationAllowed()`. Aucune décision `if (plan === ...)`.
 *
 * Portée volontairement limitée à la CRÉATION : ne bloque jamais la lecture,
 * l'édition ou l'export de données existantes. Un tenant LEGACY
 * (licensePlan = NULL) obtient une limite `null` (illimité) => aucun changement
 * de comportement.
 */

import { getLimit, hasFeature } from "./server"
import { isCreationAllowed } from "./resolver"
import type { FeatureKey, LimitKey } from "./types"

/**
 * Message générique renvoyé au client quand une limite est atteinte.
 * NE révèle aucune information interne (plan, tenant, base, comptage).
 */
export const LIMIT_REACHED_MESSAGE = "Limite de votre licence atteinte."

/**
 * Message générique renvoyé quand une FONCTIONNALITÉ n'est pas incluse dans la
 * licence. NE révèle aucune information interne (plan, tenant, base).
 */
export const FEATURE_LOCKED_MESSAGE = "Cette fonctionnalité n'est pas incluse dans votre licence."

/**
 * La fonctionnalité `key` est-elle autorisée pour cette entreprise ?
 *
 * Wrapper serveur mince au-dessus de `hasFeature()` (moteur central). Aucune
 * décision `if (plan === ...)`. Comportements hérités du resolver :
 *  - LEGACY (licensePlan = NULL) => `true` (aucun changement de comportement) ;
 *  - plan explicite invalide / entreprise introuvable => `false` (fail closed).
 *
 * @param companyId Entreprise RÉSOLUE CÔTÉ SERVEUR (jamais fournie par le client).
 */
export async function canUseFeature(companyId: number, key: FeatureKey): Promise<boolean> {
  return hasFeature(companyId, key)
}

/**
 * Autorise-t-on une NOUVELLE création pour cette limite ?
 *
 * @param companyId   Entreprise RÉSOLUE CÔTÉ SERVEUR (jamais fournie par le
 *                    client) — autorité unique du comptage et de la licence.
 * @param key         Clé de limite du registre central (ex. "maxCustomers").
 * @param currentCount Nombre courant d'entités, compté avec un scope strict
 *                    `companyId` côté serveur.
 */
export async function canCreateWithinLimit(
  companyId: number,
  key: LimitKey,
  currentCount: number,
): Promise<boolean> {
  const limit = await getLimit(companyId, key)
  return isCreationAllowed(limit, currentCount)
}
