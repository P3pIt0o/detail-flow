/**
 * Registre des sites publics personnalisés — LIAISON clé → composant de page.
 *
 * Ce module associe une clé technique (déclarée dans `meta.ts`) à son COMPOSANT
 * de page. Comme il importe les composants réels (et donc leur arbre : polices
 * `next/font`, sections React…), il ne doit être consommé QUE côté serveur
 * (dispatch public dans `server.ts`). Les composants CLIENT (ex. super-admin)
 * doivent importer les fonctions PURES depuis `meta.ts`, jamais d'ici.
 *
 * Les métadonnées (clés/labels/validation) restent la SOURCE DE VÉRITÉ dans
 * `meta.ts` ; on les ré-exporte ici pour les consommateurs serveur existants.
 *
 * ÉTAT ACTUEL : un seul site enregistré, "spirit-acs" (Spirit ACS). Toute autre
 * entreprise (clé NULL/vide/inconnue) retombe sur le site standard (repli sûr).
 */

import type { ComponentType } from "react"
import type { CustomSiteDefinition, CustomSitePublicData } from "./types"
import { getCustomSiteMeta } from "./meta"
import { SpiritAcsHome } from "@/components/custom-sites/spirit-acs/home-page"

// Ré-export des helpers PURS (source de vérité : meta.ts). Permet aux modules
// serveur qui importaient historiquement depuis "registry" de continuer.
export {
  isRegisteredCustomSiteKey,
  listRegisteredCustomSites,
  customSiteLabel,
  getCustomSiteMeta,
} from "./meta"

/**
 * Liaison clé → composant de page personnalisée. La clé DOIT exister dans
 * `customSiteMetaRegistry` (meta.ts) ; sinon la page n'est pas résoluble.
 */
const customSitePages: Readonly<Record<string, ComponentType<{ data: CustomSitePublicData }>>> = Object.freeze({
  "spirit-acs": SpiritAcsHome,
})

/**
 * Définition complète (métadonnée + composant de page) d'un site personnalisé,
 * ou `null` si la clé est absente/inconnue OU sans page associée. Repli sûr :
 * l'appelant traite `null` comme « utiliser le site standard ».
 */
export function getCustomSiteDefinition(key: string | null | undefined): CustomSiteDefinition | null {
  const meta = getCustomSiteMeta(key)
  if (!meta) return null
  const Page = customSitePages[meta.key]
  if (!Page) return null
  return { ...meta, Page }
}
