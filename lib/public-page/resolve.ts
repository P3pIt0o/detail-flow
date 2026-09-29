/**
 * Résolveur PUR de la configuration de page publique (LOT 2).
 *
 * Aucun accès DB / réseau ici : uniquement la logique de repli, afin d'être
 * testable en isolation et réutilisable côté serveur.
 *
 * CHAÎNE DE REPLI (fallback), champ par champ :
 *   1. `public_page_config` (config dédiée éditable) si la valeur est renseignée
 *   2. sinon les colonnes déjà portées par `companies` (brand*, hero*, …)
 *   3. sinon un défaut neutre
 *
 * Un tenant SANS ligne de config (cas de TOUS les tenants existants) obtient
 * donc exactement le comportement historique (étapes 2 et 3) : aucune
 * régression possible. Les sites personnalisés ne passent jamais par ici (ils
 * court-circuitent avant, via `customSiteKey`).
 */

/** Sous-ensemble des colonnes `companies` utile au rendu de la page publique. */
export type CompanyPublicFields = {
  brandPrimary: string | null
  brandSecondary: string | null
  heroOverlay?: number | null
}

/** Forme brute d'une ligne `public_page_config` (toutes colonnes nullables). */
export type PublicPageConfigRow = {
  layoutVariant: string | null
  heroImageUrl: string | null
  heroImagePosition: string | null
  heroOverlay: number | null
  accentPrimary: string | null
  accentSecondary: string | null
  theme: string | null
  showGallery: boolean | null
  showReviews: boolean | null
  showAbout: boolean | null
  interventionZone: string | null
  depositRuleText: string | null
  cancellationPolicy: string | null
  seoIndexable: boolean | null
  publishedAt: Date | string | null
}

/** Valeurs EFFECTIVES après repli, prêtes à consommer par le rendu. */
export type EffectivePublicPage = {
  layoutVariant: string | null
  heroImageUrl: string | null
  heroImagePosition: string | null
  heroOverlay: number | null
  accentPrimary: string | null
  accentSecondary: string | null
  theme: "light" | "dark" | "auto"
  showGallery: boolean
  showReviews: boolean
  showAbout: boolean
  interventionZone: string | null
  depositRuleText: string | null
  cancellationPolicy: string | null
  seoIndexable: boolean
  isPublished: boolean
  /** Vrai si une ligne de config dédiée existe (au moins un réglage explicite). */
  hasConfig: boolean
}

function cleanStr(v: string | null | undefined): string | null {
  const t = (v ?? "").trim()
  return t ? t : null
}

function normTheme(v: string | null | undefined): "light" | "dark" | "auto" {
  return v === "light" || v === "dark" ? v : "auto"
}

/**
 * Applique la chaîne de repli. `config` peut être `null` (aucune ligne dédiée)
 * → on retombe intégralement sur `company` puis les défauts neutres.
 */
export function resolveEffectivePublicPage(
  config: PublicPageConfigRow | null,
  company: CompanyPublicFields,
): EffectivePublicPage {
  const c = config
  // Les toggles de section sont ADDITIFS : par défaut visibles (true). Une
  // valeur explicite `false` de la config masque ; l'absence de config laisse
  // la logique interne existante de chaque section décider (aucun changement).
  const boolOr = (v: boolean | null | undefined, dflt: boolean) =>
    typeof v === "boolean" ? v : dflt

  return {
    layoutVariant: cleanStr(c?.layoutVariant),
    heroImageUrl: cleanStr(c?.heroImageUrl),
    heroImagePosition: cleanStr(c?.heroImagePosition),
    heroOverlay:
      typeof c?.heroOverlay === "number"
        ? c.heroOverlay
        : (company.heroOverlay ?? null),
    accentPrimary: cleanStr(c?.accentPrimary) ?? cleanStr(company.brandPrimary),
    accentSecondary: cleanStr(c?.accentSecondary) ?? cleanStr(company.brandSecondary),
    theme: normTheme(c?.theme),
    showGallery: boolOr(c?.showGallery, true),
    showReviews: boolOr(c?.showReviews, true),
    showAbout: boolOr(c?.showAbout, true),
    interventionZone: cleanStr(c?.interventionZone),
    depositRuleText: cleanStr(c?.depositRuleText),
    cancellationPolicy: cleanStr(c?.cancellationPolicy),
    seoIndexable: c?.seoIndexable === true,
    isPublished: Boolean(c?.publishedAt),
    hasConfig: c !== null,
  }
}
