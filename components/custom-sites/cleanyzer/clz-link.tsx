"use client"

/**
 * Lien interne du site CLEANYZER (L60) : `<a href>` natif, sans navigation côté client de Next —
 * la page s'ouvre même si le script échoue. Les adresses sont écrites avec le préfixe
 * `/p/cleanyzer` (valide partout) ; il est retiré au rendu quand la base du contexte est la racine
 * (hôte www.cleanyzer.fr / cleanyzer.fr, décidé côté serveur : voir `site-base.ts`).
 */

import { createContext, useContext, type ComponentProps } from "react"
import { CLZ_SITE_BASE, clzHref } from "./tokens"

const ClzBaseContext = createContext<string>(CLZ_SITE_BASE)
export const ClzBaseProvider = ClzBaseContext.Provider
/** Base des liens de la requête : « » sur le domaine Cleanyzer, « /p/cleanyzer » ailleurs. */
export const useClzBase = () => useContext(ClzBaseContext)

export function ClzLink({ href, ...rest }: Omit<ComponentProps<"a">, "href"> & { href: string }) {
  return <a {...rest} href={clzHref(href, useClzBase())} />
}
