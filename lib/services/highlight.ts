/**
 * ============================================================================
 *  BADGES DE MISE EN AVANT DES PRESTATIONS (LOT C)
 * ============================================================================
 *  Logique PURE, partagée client + serveur (aucune dépendance DB). Un badge est
 *  un simple LIBELLÉ choisi MANUELLEMENT par l'entreprise : aucune statistique
 *  n'est calculée ou inventée (« Le plus réservé » n'implique aucun comptage).
 *
 *  Stockage (table `services`, colonnes additives nullables) :
 *   - `highlightKind`  : clé du style de badge (ou null = aucun badge).
 *   - `highlightLabel` : texte personnalisé, UNIQUEMENT si kind = "custom".
 * ============================================================================
 */

/** Styles de badge prédéfinis + « custom » (texte libre court). */
export const HIGHLIGHT_KINDS = ["bestseller", "most_booked", "recommended", "new", "custom"] as const
export type HighlightKind = (typeof HIGHLIGHT_KINDS)[number]

/** Longueur maximale du libellé personnalisé. */
export const HIGHLIGHT_LABEL_MAX = 30

/** Libellés fixes des styles prédéfinis (le custom utilise `highlightLabel`). */
const PRESET_LABELS: Record<Exclude<HighlightKind, "custom">, string> = {
  bestseller: "Best-seller",
  most_booked: "Le plus réservé",
  recommended: "Recommandé",
  new: "Nouveau",
}

/** Vrai si la valeur est une clé de badge connue. */
export function isHighlightKind(v: unknown): v is HighlightKind {
  return typeof v === "string" && (HIGHLIGHT_KINDS as readonly string[]).includes(v)
}

/**
 * Normalise l'entrée admin en valeurs prêtes à persister (validation serveur).
 *  - kind inconnu / "none" → aucun badge (null, null).
 *  - custom sans texte → aucun badge (on ne stocke pas un badge vide).
 *  - custom → libellé rogné à HIGHLIGHT_LABEL_MAX (le rendu échappe le texte).
 */
export function normalizeHighlight(
  kind: unknown,
  label: unknown,
): { highlightKind: HighlightKind | null; highlightLabel: string | null } {
  if (!isHighlightKind(kind)) return { highlightKind: null, highlightLabel: null }
  if (kind === "custom") {
    const text = typeof label === "string" ? label.trim().slice(0, HIGHLIGHT_LABEL_MAX) : ""
    if (!text) return { highlightKind: null, highlightLabel: null }
    return { highlightKind: "custom", highlightLabel: text }
  }
  return { highlightKind: kind, highlightLabel: null }
}

/**
 * Résout le libellé à afficher pour une prestation, ou null si aucun badge.
 * Défensif : un `highlightKind` inconnu (donnée héritée/corrompue) → pas de badge.
 */
export function resolveHighlightLabel(
  highlightKind: string | null | undefined,
  highlightLabel: string | null | undefined,
): string | null {
  if (!isHighlightKind(highlightKind)) return null
  if (highlightKind === "custom") {
    const text = (highlightLabel ?? "").trim().slice(0, HIGHLIGHT_LABEL_MAX)
    return text || null
  }
  return PRESET_LABELS[highlightKind]
}

/** Options prêtes pour un `<select>` admin (inclut « Aucun badge »). */
export const HIGHLIGHT_SELECT_OPTIONS: { value: HighlightKind | "none"; label: string }[] = [
  { value: "none", label: "Aucun badge" },
  { value: "bestseller", label: PRESET_LABELS.bestseller },
  { value: "most_booked", label: PRESET_LABELS.most_booked },
  { value: "recommended", label: PRESET_LABELS.recommended },
  { value: "new", label: PRESET_LABELS.new },
  { value: "custom", label: "Texte personnalisé" },
]
