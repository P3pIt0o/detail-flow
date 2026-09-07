/**
 * ============================================================================
 *  CONFIGURATEUR SPIRIT ACS — RÈGLES & SÉRIALISATION (module PUR)
 * ============================================================================
 *
 *  Ce module ne contient AUCUNE UI ni logique serveur : uniquement les règles
 *  par prestation et les fonctions pures de projection de la sélection du
 *  client. Il est donc importable côté client comme côté test.
 *
 *  SOURCE DE VÉRITÉ : les prestations, formules et tarifs proviennent
 *  EXCLUSIVEMENT de `SPIRIT_SERVICES` (`seo-content.ts`). Rien n'est dupliqué
 *  ni inventé : le configurateur n'ajoute que des RÈGLES de parcours
 *  (mode d'options, action finale, message photos) au-dessus de ce contenu.
 *
 *  MOTEUR UNIQUE : le configurateur ne fait qu'ALIMENTER la Server Action
 *  existante `submitCustomRequest` (`custom_requests`, mode `quote_request`).
 *  Il ne calcule aucun total, ne crée aucun rendez-vous et ne touche jamais à
 *  Stripe ni au moteur de réservation.
 * ============================================================================
 */

import { formatPrice } from "@/lib/format"
import { SPIRIT_SERVICES, type ServiceContent, type ServiceFormula } from "../seo-content"

/** Action finale « logique » du parcours (le moteur reste identique). */
export type FinalAction = "quote" | "appointment"

/**
 * Mode de l'étape « options » d'une prestation :
 *   - `none`             → aucune option (véhicule + description libre suffisent) ;
 *   - `select-formula`   → le client SÉLECTIONNE une formule ;
 *   - `info-formula`     → formules affichées À TITRE INFORMATIF, SANS sélection ;
 *   - `ppf-zones`        → sélection de zones à protéger (jamais de prix par zone) ;
 *   - `polish-and-ceramic` → parcours combiné Polissage & Céramique : niveau de
 *                          polissage requis (1/2/3 ou « à déterminer après
 *                          inspection »), protection céramique facultative et
 *                          indépendante. Toujours sur devis.
 */
export type OptionsMode = "none" | "select-formula" | "info-formula" | "ppf-zones" | "polish-and-ceramic"

export interface ServiceRule {
  mode: OptionsMode
  finalAction: FinalAction
  /** Message pédagogique affiché au-dessus des photos (jamais bloquant). */
  photoHint: string
  /** Photos particulièrement pertinentes (rayure/défaut sur élément précis). */
  photosRecommended: boolean
}

/**
 * Règles de parcours PAR PRESTATION. Conformes au modèle validé :
 *   - Polissage & Céramique : `polish-and-ceramic` → toujours `quote`. Le client
 *     choisit un niveau de polissage (1/2/3) OU « à déterminer après inspection »
 *     (exclusif), puis peut ajouter une protection céramique (facultative).
 *   - Protection céramique : même règle — l'entrée est ramenée vers le parcours
 *     combiné (une céramique carrosserie ne se commande jamais seule).
 *   - PPF : `ppf-zones` → toujours `quote` (aucun prix par zone).
 *   - Rénovation de phares : photos fortement recommandées si rayure/défaut.
 */
const SERVICE_RULES: Record<string, ServiceRule> = {
  "nettoyage-automobile": {
    mode: "none",
    finalAction: "quote",
    photoHint:
      "Ajoutez quelques photos de l'habitacle et de l'extérieur pour nous aider à évaluer l'état du véhicule.",
    photosRecommended: false,
  },
  "polissage-automobile": {
    mode: "polish-and-ceramic",
    finalAction: "quote",
    photoHint:
      "Ajoutez si vous le souhaitez des photos de la carrosserie (rayures, défauts) : elles aident Spirit ACS à préparer sa proposition. Le niveau de polissage exact est confirmé après examen du véhicule.",
    photosRecommended: false,
  },
  "protection-ceramique": {
    // Une protection céramique carrosserie ne se commande jamais seule : l'entrée
    // « Protection céramique » est ramenée vers le parcours Polissage & Céramique
    // (cf. canonicalServiceSlug). La règle reste alignée par sécurité.
    mode: "polish-and-ceramic",
    finalAction: "quote",
    photoHint:
      "Ajoutez si vous le souhaitez des photos de la carrosserie : elles aident Spirit ACS à préparer sa proposition.",
    photosRecommended: false,
  },
  "protection-ppf": {
    mode: "ppf-zones",
    finalAction: "quote",
    photoHint: "Ajoutez des photos des zones à protéger pour préciser le devis.",
    photosRecommended: false,
  },
  "renovation-phares": {
    mode: "none",
    finalAction: "quote",
    photoHint:
      "Une photo des optiques, et de toute rayure ou défaut sur un élément précis, nous aide beaucoup à évaluer le résultat possible (facultatif).",
    photosRecommended: true,
  },
  "detailing-moto": {
    mode: "none",
    finalAction: "quote",
    photoHint: "Ajoutez des photos de la moto pour nous aider à adapter la prestation.",
    photosRecommended: false,
  },
}

const DEFAULT_RULE: ServiceRule = {
  mode: "none",
  finalAction: "quote",
  photoHint:
    "Ajoutez quelques photos du véhicule pour nous aider à mieux évaluer votre demande (facultatif).",
  photosRecommended: false,
}

/** Règle de parcours d'une prestation (repli sûr si slug inconnu). */
export function getServiceRule(slug: string): ServiceRule {
  return SERVICE_RULES[slug] ?? DEFAULT_RULE
}

/** Prestation éditoriale Spirit par slug (source unique). */
export function getConfiguratorService(slug: string): ServiceContent | undefined {
  return SPIRIT_SERVICES.find((s) => s.slug === slug)
}

/**
 * Résumé léger des prestations pour l'étape de choix (source unique
 * `SPIRIT_SERVICES`). Aucune donnée dupliquée : simple projection.
 */
export interface ConfiguratorServiceSummary {
  slug: string
  title: string
  tagline: string
  image: string | null
  imageAlt: string | null
}

export function listConfiguratorServices(): ConfiguratorServiceSummary[] {
  return SPIRIT_SERVICES.map((s) => ({
    slug: s.slug,
    title: s.cardTitle,
    tagline: s.cardTagline,
    image: s.image,
    imageAlt: s.imageAlt,
  }))
}

/** Formules confirmées d'une prestation (vide si « sur devis » pur). */
export function getServiceFormulas(slug: string): ServiceFormula[] {
  return getConfiguratorService(slug)?.formules ?? []
}

/**
 * Libellé de prix d'une formule — JAMAIS de faux total. Reproduit exactement la
 * règle de la page prestation (`exact` → montant, `from` → « dès X »,
 * `quote`/absent → « sur devis »).
 */
export function formulaPriceLabel(f: ServiceFormula): string {
  if (typeof f.priceCents === "number") {
    if (f.priceKind === "exact") return formatPrice(f.priceCents)
    if (f.priceKind === "from") return `dès ${formatPrice(f.priceCents)}`
  }
  return "Sur devis"
}

/* -------------------------------------------------------------------------- */
/*  POLISSAGE & CÉRAMIQUE — parcours combiné                                  */
/* -------------------------------------------------------------------------- */

/** Slugs réels (source de vérité inchangée : deux prestations distinctes). */
export const POLISH_SLUG = "polissage-automobile"
export const CERAMIC_SLUG = "protection-ceramique"

/**
 * Valeur sentinelle du groupe « Polissage » lorsque le client ne choisit pas de
 * niveau et laisse Spirit ACS le déterminer après inspection. Ce n'est PAS un
 * niveau de polissage supplémentaire : c'est une alternative EXCLUSIVE aux
 * niveaux 1/2/3.
 */
export const POLISH_INSPECTION_VALUE = "Niveau à déterminer par Spirit ACS après inspection"

/**
 * Règle d'entrée : une protection céramique carrosserie ne peut jamais être
 * commandée seule. L'entrée « Protection céramique » est donc ramenée vers le
 * parcours Polissage & Céramique (polissage requis, céramique facultative).
 * Toute autre prestation reste inchangée.
 */
export function canonicalServiceSlug(slug: string): string {
  return slug === CERAMIC_SLUG ? POLISH_SLUG : slug
}

/** Formules de protection céramique réelles (source unique inchangée). */
export function getCeramicFormulas(): ServiceFormula[] {
  return getServiceFormulas(CERAMIC_SLUG)
}

/**
 * Types de véhicule proposés à l'étape « véhicule ». Volontairement limité aux
 * catégories réellement utilisées par Spirit (les paliers tarifaires du
 * polissage — citadine / berline / SUV — et la moto, qui est une prestation à
 * part entière). « Autre » couvre le reste sans inventer de segmentation.
 */
export const VEHICLE_TYPES = [
  "Citadine",
  "Berline",
  "Break",
  "SUV / 4×4",
  "Monospace",
  "Utilitaire",
  "Moto / Scooter",
  "Autre",
] as const

/** Type de véhicule pré-suggéré selon la prestation (jamais verrouillé). */
export function suggestedVehicleType(slug: string): string {
  return slug === "detailing-moto" ? "Moto / Scooter" : ""
}

/**
 * Zones de pose PPF proposées à la sélection. Ce sont des zones de carrosserie
 * STANDARD (aucun prix associé : la pose PPF est TOUJOURS sur devis). Le champ
 * libre « Autre / précision » couvre tout besoin non listé, y compris
 * « je ne sais pas ».
 */
export const PPF_ZONES = [
  "Pare-chocs avant",
  "Capot (partiel ou intégral)",
  "Ailes avant",
  "Rétroviseurs",
  "Montants de pare-brise",
  "Optiques de phares",
  "Seuils / bas de caisse",
  "Poignées de portes",
  "Véhicule complet",
] as const

/* -------------------------------------------------------------------------- */
/*  SÉLECTION DU CLIENT + SÉRIALISATION (projetée vers `description`)          */
/* -------------------------------------------------------------------------- */

export interface ConfiguratorSelection {
  serviceSlug: string
  serviceTitle: string
  /** Formule choisie (mode `select-formula`) — libellé lisible déjà formaté. */
  formulaLabel?: string | null
  /**
   * Parcours Polissage & Céramique (mode `polish-and-ceramic`).
   * `polishLevel` = niveau choisi (libellé formaté avec prix) OU
   * `POLISH_INSPECTION_VALUE`. `ceramicLabel` = protection céramique facultative,
   * INDÉPENDANTE du polissage (jamais écrasée par lui, ni l'inverse). Null =
   * aucune céramique.
   */
  polishLevel?: string | null
  ceramicLabel?: string | null
  /** Zones PPF sélectionnées (mode `ppf-zones`). */
  ppfZones?: string[]
  /** Précision / « je ne sais pas » PPF. */
  ppfOther?: string
  vehicleType: string
  vehicleBrand: string
  vehicleModel: string
  audience: "particulier" | "professionnel"
  /** Message libre du client (facultatif selon la prestation). */
  message: string
}

/**
 * Projette la sélection structurée du configurateur vers le champ
 * `description` de `custom_requests` (approche ZÉRO-MIGRATION : aucune colonne
 * ajoutée). Le rendu est lisible tel quel dans la fiche admin existante, tout
 * en restant parfaitement compatible avec le formulaire libre historique.
 */
export function serializeConfiguratorDescription(sel: ConfiguratorSelection): string {
  const rule = getServiceRule(sel.serviceSlug)
  const lines: string[] = []
  lines.push(`Prestation : ${sel.serviceTitle}`)

  if (rule.mode === "polish-and-ceramic") {
    lines.push(
      sel.polishLevel === POLISH_INSPECTION_VALUE
        ? "Polissage : niveau à déterminer par Spirit ACS après inspection"
        : `Polissage : ${sel.polishLevel ?? "à préciser"}`,
    )
    lines.push(
      sel.ceramicLabel
        ? `Protection céramique : ${sel.ceramicLabel}`
        : "Protection céramique : aucune ajoutée",
    )
    lines.push("(Sélection du client — confirmée par Spirit ACS après analyse du véhicule.)")
  }
  if (rule.mode === "select-formula" && sel.formulaLabel) {
    lines.push(`Formule souhaitée : ${sel.formulaLabel}`)
    lines.push("(Sélection du client — à valider par Spirit ACS après analyse du véhicule.)")
  }
  if (rule.mode === "info-formula") {
    lines.push(
      "Demande de rendez-vous pour constater l'état général du véhicule — le niveau de correction sera déterminé par Spirit ACS (non choisi par le client).",
    )
  }
  if (rule.mode === "ppf-zones") {
    lines.push(`Zones à protéger : ${sel.ppfZones?.length ? sel.ppfZones.join(", ") : "à définir avec Spirit ACS"}`)
    if (sel.ppfOther?.trim()) lines.push(`Autre / précision : ${sel.ppfOther.trim()}`)
    lines.push("(Pose PPF toujours sur devis, définie après analyse.)")
  }

  lines.push("")
  lines.push("Message du client :")
  lines.push(sel.message.trim() || "(aucun message ajouté)")
  return lines.join("\n")
}

/** Élément de récapitulatif éditable (libellé + valeur + étape à modifier). */
export interface SummaryLine {
  label: string
  value: string
}

/** Récapitulatif lisible de la sélection (pour l'écran de validation). */
export function buildSummary(sel: ConfiguratorSelection): SummaryLine[] {
  const rule = getServiceRule(sel.serviceSlug)
  const out: SummaryLine[] = [{ label: "Prestation", value: sel.serviceTitle }]

  if (rule.mode === "polish-and-ceramic") {
    out.push({
      label: "Polissage",
      value:
        sel.polishLevel === POLISH_INSPECTION_VALUE
          ? "Niveau à déterminer après inspection"
          : sel.polishLevel?.trim() || "À préciser",
    })
    out.push({ label: "Protection céramique", value: sel.ceramicLabel?.trim() || "Aucune" })
  }
  if (rule.mode === "select-formula") {
    out.push({ label: "Formule souhaitée", value: sel.formulaLabel?.trim() || "À définir avec Spirit ACS" })
  }
  if (rule.mode === "info-formula") {
    out.push({ label: "Suite", value: "Rendez-vous pour constater l'état du véhicule" })
  }
  if (rule.mode === "ppf-zones") {
    out.push({
      label: "Zones à protéger",
      value: sel.ppfZones?.length ? sel.ppfZones.join(", ") : "À définir",
    })
    if (sel.ppfOther?.trim()) out.push({ label: "Précision", value: sel.ppfOther.trim() })
  }

  const vehicle = [sel.vehicleType, sel.vehicleBrand, sel.vehicleModel]
    .map((v) => v.trim())
    .filter(Boolean)
    .join(" · ")
  out.push({ label: "Véhicule", value: vehicle || "Non précisé" })
  out.push({ label: "Vous êtes", value: sel.audience === "professionnel" ? "Un professionnel" : "Un particulier" })
  if (sel.message.trim()) out.push({ label: "Message", value: sel.message.trim() })
  return out
}
