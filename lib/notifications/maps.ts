/**
 * Helper PARTAGÉ pour les liens d'itinéraire Google Maps (LOT D #2).
 *
 * Fichier PUR (aucun import serveur/DB) : utilisable côté serveur, dans les
 * emails, dans les composants admin et dans les tests.
 *
 * Contraintes du brief respectées :
 *  - Aucun appel à une API Google payante, aucune nouvelle clé.
 *  - Format imposé :
 *    https://www.google.com/maps/dir/?api=1&destination=<ADRESSE>&travelmode=driving
 *  - On n'impose AUCUN point de départ (pas de paramètre `origin`).
 *  - Le lien ne contient QUE l'adresse de destination : jamais le nom du
 *    client, son téléphone, ni aucune autre donnée personnelle.
 *  - Adresse manquante/incomplète => aucun lien trompeur (retourne null, l'UI
 *    affiche « Adresse à compléter »).
 */

/** Longueur minimale plausible d'une adresse exploitable pour un itinéraire. */
const MIN_ADDRESS_LENGTH = 6

/**
 * Une adresse est-elle suffisamment complète pour construire un itinéraire ?
 *
 * Règle volontairement simple et non trompeuse : il faut du texte réel et au
 * moins un chiffre OU une virgule (indice de rue/code postal/ville), afin
 * d'éviter les entrées vides ou manifestement partielles (« à définir »).
 */
export function isAddressUsable(address: string | null | undefined): boolean {
  if (typeof address !== "string") return false
  const trimmed = address.trim()
  if (trimmed.length < MIN_ADDRESS_LENGTH) return false
  // Un itinéraire fiable a besoin d'un repère : chiffre (n° / code postal) ou
  // séparateur d'adresse (virgule). Sinon on considère l'adresse incomplète.
  return /\d/.test(trimmed) || trimmed.includes(",")
}

/**
 * Construit le lien d'itinéraire Google Maps pour une adresse de destination.
 *
 * @returns l'URL, ou `null` si l'adresse est manquante/incomplète (l'appelant
 * doit alors afficher « Adresse à compléter » sans lien).
 */
export function buildMapsDirectionsUrl(address: string | null | undefined): string | null {
  if (!isAddressUsable(address)) return null
  // encodeURIComponent gère espaces, virgules, accents, etc. de façon sûre.
  const destination = encodeURIComponent((address as string).trim())
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`
}

/** Libellé affiché quand l'adresse ne permet pas d'itinéraire fiable. */
export const ADDRESS_INCOMPLETE_LABEL = "Adresse à compléter"
