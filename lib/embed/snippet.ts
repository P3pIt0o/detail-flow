import { marketingOrigin, publicReservationPath } from "@/lib/tenant-shared"

/**
 * Génération du code d'INTÉGRATION du moteur de réservation — SOURCE DE VÉRITÉ
 * pure (aucune I/O). Un SEUL moteur de réservation existe ; il est ici exposé
 * pour un site externe via une iframe pointant vers la route canonique
 * `/p/<slug>/reservation` (mode `embed`). Aucun deuxième tunnel n'est créé.
 *
 * ISOLATION MULTI-TENANT : le slug du tenant est INJECTÉ CÔTÉ SERVEUR dans le
 * snippet. Le client copie-colle tel quel ; il ne saisit JAMAIS d'identifiant de
 * tenant. Le loader `embed.js` déduit l'origine de sa propre balise `<script>`,
 * donc seul le slug transite — impossible de pointer vers un autre tenant.
 */

/** Origine absolue servant les intégrations (site marketing DetailFlow). */
export function embedOrigin(rootDomain?: string): string {
  return marketingOrigin(rootDomain)
}

/**
 * URL absolue de la réservation en mode embarqué (chrome masqué, auto-resize).
 * `?embed=1` déclenche le mode iframe côté page réservation.
 */
export function embedIframeSrc(slug: string, rootDomain?: string): string {
  return `${embedOrigin(rootDomain)}${publicReservationPath(slug)}?embed=1`
}

/** URL absolue du loader statique `embed.js`. */
export function embedScriptSrc(rootDomain?: string): string {
  return `${embedOrigin(rootDomain)}/embed.js`
}

/**
 * Snippet RECOMMANDÉ : conteneur + loader asynchrone. Le loader crée l'iframe
 * responsive et l'auto-redimensionne. Le slug est le SEUL paramètre, porté par
 * `data-detailflow-slug` — jamais un identifiant technique à éditer.
 */
export function buildEmbedScriptSnippet(slug: string, rootDomain?: string): string {
  const src = embedScriptSrc(rootDomain)
  return [
    `<div data-detailflow-reservation data-detailflow-slug="${slug}"></div>`,
    `<script src="${src}" async></script>`,
  ].join("\n")
}

/**
 * Snippet de REPLI : iframe directe, sans JavaScript. Utile pour les éditeurs
 * qui n'autorisent pas les balises `<script>`. Hauteur minimale généreuse pour
 * éviter un double défilement avant l'auto-resize.
 */
export function buildEmbedIframeSnippet(slug: string, rootDomain?: string): string {
  const src = embedIframeSrc(slug, rootDomain)
  return [
    `<iframe`,
    `  src="${src}"`,
    `  title="Réservation en ligne"`,
    `  loading="lazy"`,
    `  style="width:100%;border:0;min-height:900px"`,
    `></iframe>`,
  ].join("\n")
}
