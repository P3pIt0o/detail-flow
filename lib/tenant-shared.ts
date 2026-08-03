/**
 * Helpers PURS de résolution de tenant (aucune dépendance serveur/DB).
 *
 * Ce fichier est importable À LA FOIS par le middleware (runtime edge) et par
 * le code serveur. Il ne contient donc que de la logique de parsing de hostname
 * et de validation de slug — jamais d'accès base de données.
 */

/**
 * Slugs réservés : ne peuvent pas être attribués à une entreprise car ils
 * entrent en conflit avec des sous-domaines techniques ou des routes système.
 */
/**
 * Entreprise par défaut utilisée en aperçu v0 / développement local quand aucun
 * `?tenant=` n'est fourni. C'est l'entreprise « DetailFlow » créée à la migration
 * (celle qui héberge les données historiques). Jamais utilisée en production.
 */
export const DEFAULT_TENANT_SLUG = "detailflow"

export const RESERVED_SLUGS = new Set<string>([
  "www",
  "admin",
  "api",
  "app",
  "dashboard",
  "login",
  "register",
  "auth",
  "support",
  "help",
  "mail",
  "demo",
  "status",
  "static",
  "assets",
  // Réservés supplémentaires propres à la plateforme
  "detailflow",
  "super-admin",
  "superadmin",
  "cdn",
  "blog",
  "docs",
  "billing",
  "account",
])

/** Normalise une saisie en slug : minuscules, sans accents, tirets. */
export function normalizeSlug(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // retire les accents
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-") // tout caractère non alphanumérique -> tiret
    .replace(/^-+|-+$/g, "") // pas de tiret en début/fin
    .replace(/-{2,}/g, "-") // pas de tirets consécutifs
}

/** Vrai si le slug est réservé (interdit). */
export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug)
}

/**
 * Valide un slug d'entreprise. Règles : 3–63 caractères, minuscules,
 * chiffres et tirets uniquement, ne commence/finit pas par un tiret, non réservé.
 */
export function isValidSlug(slug: string): boolean {
  if (slug.length < 3 || slug.length > 63) return false
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return false
  if (isReservedSlug(slug)) return false
  return true
}

/**
 * Normalise un domaine racine pour l'affichage des accès dans le Super Admin :
 * retire le protocole et les slashes superflus, puis garantit le préfixe `www.`
 * (le site public et l'admin vivent sur `https://www.<domaine>`). Le routing
 * multi-tenant se fait ensuite par `?tenant=`, jamais par sous-domaine.
 */
function normalizeRootHost(rootDomain?: string): string {
  let root = (rootDomain || "").trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "")
  if (!root) return ""
  if (!root.startsWith("www.")) root = `www.${root}`
  return root
}

/**
 * Construit l'URL publique COMPLÈTE d'une entreprise à partir de son slug et du
 * domaine racine. Le routing multi-tenant se fait par `?tenant=` sur le domaine
 * racine (et non par sous-domaine) : on renvoie donc toujours une URL absolue
 * `https://www.<root>/?tenant=<slug>`. En l'absence de domaine racine
 * (aperçu/local), on retombe sur un chemin relatif.
 */
export function tenantPublicUrl(slug: string, rootDomain?: string): string {
  const root = normalizeRootHost(rootDomain)
  if (root) return `https://${root}/?tenant=${slug}`
  return `/?tenant=${slug}`
}

/**
 * Construit l'URL d'administration COMPLÈTE d'une entreprise
 * (`https://www.<root>/admin?tenant=<slug>`). En l'absence de domaine racine
 * (aperçu/local), retombe sur un chemin relatif.
 */
export function tenantAdminUrl(slug: string, rootDomain?: string): string {
  const root = normalizeRootHost(rootDomain)
  if (root) return `https://${root}/admin?tenant=${slug}`
  return `/admin?tenant=${slug}`
}

export type HostResolution =
  | { kind: "root" } // domaine principal DetailFlow (vitrine)
  | { kind: "tenant"; slug: string } // sous-domaine d'une entreprise
  | { kind: "preview"; slug: string | null } // aperçu v0 / vercel preview / local

/**
 * Détermine le contexte à partir du hostname entrant.
 *
 * @param host  hostname brut (peut inclure le port), ex. "elite.detailflow.fr"
 * @param rootDomain  domaine racine, ex. "detailflow.fr" (NEXT_PUBLIC_ROOT_DOMAIN)
 * @param queryTenant  valeur éventuelle de ?tenant= (dev/preview uniquement)
 */
export function resolveHost(
  host: string | null | undefined,
  rootDomain: string | undefined,
  queryTenant?: string | null,
): HostResolution {
  const cleanHost = (host || "").split(":")[0].toLowerCase().trim()

  // Environnements sans vrais sous-domaines : local + aperçus.
  const isPreviewHost =
    !cleanHost ||
    cleanHost === "localhost" ||
    cleanHost === "127.0.0.1" ||
    cleanHost.endsWith(".localhost") ||
    cleanHost.endsWith(".vercel.run") ||
    cleanHost.endsWith(".vusercontent.net") ||
    cleanHost.endsWith(".vercel.app")

  // Support de {slug}.localhost:3000 en développement local.
  if (cleanHost.endsWith(".localhost")) {
    const sub = cleanHost.slice(0, -".localhost".length)
    if (sub && sub !== "www") return { kind: "tenant", slug: sub }
  }

  if (isPreviewHost) {
    // En aperçu/dev, le tenant est choisi via ?tenant=. Sinon null (→ défaut).
    const q = (queryTenant || "").toLowerCase().trim()
    return { kind: "preview", slug: q ? q : null }
  }

  const root = (rootDomain || "").toLowerCase().trim()
  if (!root) {
    // Pas de domaine racine configuré : on considère la racine par défaut.
    return { kind: "root" }
  }

  if (cleanHost === root || cleanHost === `www.${root}`) {
    // Sur le domaine racine, ?tenant=<slug> sélectionne EXPLICITEMENT la vitrine
    // d'une entreprise. Cela rend fonctionnelles les URLs publiques du type
    // https://detailflow.fr/?tenant=slug (et conserve le tenant sur toute la
    // navigation, via withTenant). Sans ?tenant=, c'est la vitrine DetailFlow.
    const q = (queryTenant || "").toLowerCase().trim()
    if (q) return { kind: "tenant", slug: q }
    return { kind: "root" }
  }

  if (cleanHost.endsWith(`.${root}`)) {
    const sub = cleanHost.slice(0, -(root.length + 1))
    // Un sous-domaine multi-niveaux (a.b.detailflow.fr) : on prend le 1er label.
    const label = sub.split(".")[0]
    if (label && label !== "www") return { kind: "tenant", slug: label }
    return { kind: "root" }
  }

  // Domaine totalement inconnu (ni racine ni sous-domaine) : traité comme racine
  // par défaut faute de mieux ; la résolution DB renverra 404 si nécessaire.
  return { kind: "root" }
}
