/**
 * Registre central des sites publics personnalisés.
 *
 * SOURCE DE VÉRITÉ des clés techniques valides (`customSiteKey`). Une clé
 * n'existe pour la plateforme que si elle est enregistrée ici.
 *
 * Aucun accès DB : ce module ne fait que déclarer/valider des définitions. Il
 * est donc importable côté serveur (dispatch, adaptateur) comme par les actions
 * de validation.
 *
 * ÉTAT ACTUEL : le registre est volontairement VIDE. Aucun faux site n'est
 * enregistré. Il est prêt à recevoir "spirit-acs" au lot suivant, sans changer
 * l'API publique ci-dessous. Tant qu'il est vide, toute entreprise retombe sur
 * le site standard (repli sûr).
 */

import type { CustomSiteDefinition } from "./types"

/**
 * Table des sites personnalisés, indexée par clé technique.
 *
 * Pour enregistrer un site (lot suivant) : ajouter une entrée dont la valeur
 * `key` est IDENTIQUE à la clé de l'objet. Voir docs/custom-site-integration.md.
 */
export const customSiteRegistry: Readonly<Record<string, CustomSiteDefinition>> = Object.freeze({
  // Exemple (NON activé) — à décommenter/adapter au lot Spirit :
  // "spirit-acs": {
  //   key: "spirit-acs",
  //   name: "Spirit ACS",
  //   ownShell: true,
  //   Page: SpiritAcsHome,
  // },
})

/** Normalise une clé entrante (défensif) avant toute recherche/validation. */
function normalizeKey(key: string | null | undefined): string {
  return (key ?? "").trim()
}

/** Vrai si la clé correspond à un site personnalisé réellement enregistré. */
export function isRegisteredCustomSiteKey(key: string | null | undefined): boolean {
  const k = normalizeKey(key)
  return k !== "" && Object.prototype.hasOwnProperty.call(customSiteRegistry, k)
}

/**
 * Définition d'un site personnalisé, ou `null` si la clé est absente/inconnue.
 * Repli sûr : l'appelant traite `null` comme « utiliser le site standard ».
 */
export function getCustomSiteDefinition(key: string | null | undefined): CustomSiteDefinition | null {
  const k = normalizeKey(key)
  if (!k) return null
  return customSiteRegistry[k] ?? null
}

/**
 * Liste des sites enregistrés (clé + nom), pour l'affichage super-admin.
 * Ne renvoie jamais de composant : uniquement des métadonnées sûres.
 */
export function listRegisteredCustomSites(): Array<{ key: string; name: string }> {
  return Object.values(customSiteRegistry).map((d) => ({ key: d.key, name: d.name }))
}

/** Nom lisible d'une clé enregistrée, ou `null` si inconnue/absente. */
export function customSiteLabel(key: string | null | undefined): string | null {
  const def = getCustomSiteDefinition(key)
  return def?.name ?? null
}
