/**
 * Configuration (par entreprise) de la fonctionnalité « Demandes personnalisées ».
 *
 * Stockée dans `companies.siteContent.customRequests` (jsonb) — même mécanisme
 * générique que le reste du contenu du site public (voir lib/site-content.ts).
 * Aucune colonne dédiée, aucune nouvelle table pour la configuration : seules
 * les demandes reçues vivent dans la table `custom_requests`.
 *
 * Rétrocompatibilité : une entreprise qui n'a jamais activé la fonctionnalité a
 * `enabled = false` (défaut) → aucune card, aucun CTA, aucun formulaire public.
 *
 * Ce fichier est PUR (pas de "server-only") : importable par les composants
 * client (pour les types) comme par le serveur.
 */

/** Un type de demande proposé sur le site public. */
export interface CustomRequestType {
  /** Clé stable (slug). Pour les types intégrés : voir BUILTIN_TYPES. */
  key: string
  label: string
  description?: string
  enabled: boolean
  /** Type fourni par DetailFlow (non supprimable, seulement activable). */
  builtin?: boolean
}

export interface CustomRequestsConfig {
  enabled: boolean
  title?: string
  description?: string
  ctaLabel?: string
  types: CustomRequestType[]
}

/** Textes DetailFlow par défaut de la card publique. */
export const CUSTOM_REQUEST_DEFAULTS = {
  title: "Besoin d'une offre personnalisée ?",
  description:
    "Prestation spécifique, entretien régulier ou flotte professionnelle : décrivez votre besoin et recevez une proposition adaptée.",
  ctaLabel: "Faire une demande",
} as const

/** Catégories prêtes à l'emploi proposées par DetailFlow (activables une à une). */
export const BUILTIN_TYPES: CustomRequestType[] = [
  { key: "sur-mesure", label: "Prestation sur mesure", enabled: true, builtin: true },
  { key: "abonnement", label: "Abonnement / entretien régulier", enabled: true, builtin: true },
  { key: "flotte", label: "Flotte / véhicules d'entreprise", enabled: true, builtin: true },
  { key: "autre", label: "Autre demande", enabled: true, builtin: true },
]

/** Clés des types intégrés, pour déterminer le comportement du formulaire. */
export const BUILTIN_KEYS = new Set(BUILTIN_TYPES.map((t) => t.key))

/**
 * Fusionne la configuration brute enregistrée avec les valeurs par défaut.
 * Garantit toujours la présence des 4 types intégrés (dans l'ordre), suivis des
 * éventuels types personnalisés. Un type intégré retrouve son libellé par
 * défaut si l'entreprise ne l'a pas personnalisé.
 */
export function resolveCustomRequestsConfig(raw: unknown): CustomRequestsConfig {
  const cfg = (raw ?? {}) as Partial<CustomRequestsConfig>
  const savedByKey = new Map<string, CustomRequestType>()
  if (Array.isArray(cfg.types)) {
    for (const t of cfg.types) {
      if (t && typeof t.key === "string") savedByKey.set(t.key, t as CustomRequestType)
    }
  }

  // Types intégrés (toujours présents, ordre fixe).
  const builtins: CustomRequestType[] = BUILTIN_TYPES.map((def) => {
    const saved = savedByKey.get(def.key)
    return {
      key: def.key,
      label: def.label,
      enabled: saved ? saved.enabled !== false : def.enabled,
      builtin: true,
    }
  })

  // Types personnalisés (toute clé non intégrée présente dans la config).
  const customs: CustomRequestType[] = []
  if (Array.isArray(cfg.types)) {
    for (const t of cfg.types) {
      if (!t || typeof t.key !== "string" || BUILTIN_KEYS.has(t.key)) continue
      customs.push({
        key: t.key,
        label: (t.label || "").trim() || t.key,
        description: (t.description || "").trim() || undefined,
        enabled: t.enabled !== false,
        builtin: false,
      })
    }
  }

  return {
    enabled: cfg.enabled === true,
    title: (cfg.title || "").trim() || undefined,
    description: (cfg.description || "").trim() || undefined,
    ctaLabel: (cfg.ctaLabel || "").trim() || undefined,
    types: [...builtins, ...customs],
  }
}

/** Textes résolus de la card (personnalisés sinon défauts DetailFlow). */
export function resolveCustomRequestTexts(cfg: CustomRequestsConfig) {
  return {
    title: cfg.title || CUSTOM_REQUEST_DEFAULTS.title,
    description: cfg.description || CUSTOM_REQUEST_DEFAULTS.description,
    ctaLabel: cfg.ctaLabel || CUSTOM_REQUEST_DEFAULTS.ctaLabel,
  }
}

/** Types actifs affichés au public (dans l'ordre). */
export function activeTypes(cfg: CustomRequestsConfig): CustomRequestType[] {
  return cfg.types.filter((t) => t.enabled)
}
