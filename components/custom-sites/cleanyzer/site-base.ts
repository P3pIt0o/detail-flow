import { headers } from "next/headers"
import { clzBaseForHost } from "./tokens"

/**
 * Base des liens internes pour la requête en cours (L60), décidée côté serveur par l'hôte :
 * racine sur www.cleanyzer.fr / cleanyzer.fr, « /p/cleanyzer » partout ailleurs.
 */
export async function clzRequestBase(): Promise<string> {
  return clzBaseForHost((await headers()).get("host"))
}
