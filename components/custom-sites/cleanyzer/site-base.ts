import { createElement, type ComponentProps } from "react"
import { headers } from "next/headers"
import { CleanyzerShell } from "./site-shell"
import { clzBaseForHost } from "./tokens"

/**
 * Base des liens internes pour la requête en cours (L60), décidée côté serveur par l'hôte :
 * racine sur www.cleanyzer.fr / cleanyzer.fr, « /p/cleanyzer » partout ailleurs.
 */
export async function clzRequestBase(): Promise<string> {
  return clzBaseForHost((await headers()).get("host"))
}

/** Coquille du site avec la base de la requête : à utiliser dans les pages rendues côté serveur. */
export async function ClzHostShell(props: Omit<ComponentProps<typeof CleanyzerShell>, "base">) {
  return createElement(CleanyzerShell, { ...props, base: await clzRequestBase() })
}
