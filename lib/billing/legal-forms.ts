/**
 * Formes juridiques fréquentes par pays — aide au choix, PURE (aucune règle
 * fiscale). Les libellés correspondent à des formes réellement existantes ; les
 * descriptions sont en langage simple et n'énoncent aucune obligation, taux ni
 * seuil (aucune hallucination réglementaire).
 *
 * Le champ stocké reste un texte libre (`settings.legalForm`) : la liste ne fait
 * que proposer des valeurs. « Je ne sais pas » et « Autre » n'enferment jamais
 * l'utilisateur et n'empêchent jamais l'enregistrement.
 */

export type LegalFormOption = {
  /** Valeur stockée (libellé), sauf options spéciales. */
  value: string
  label: string
  description: string
}

export const LEGAL_FORM_UNKNOWN = "__unknown__"
export const LEGAL_FORM_OTHER = "__other__"

const FR: LegalFormOption[] = [
  { value: "Micro-entreprise", label: "Micro-entreprise", description: "Entrepreneur individuel au régime micro. Formalités allégées." },
  { value: "Entreprise individuelle (EI)", label: "Entreprise individuelle (EI)", description: "Activité en nom propre, hors régime micro." },
  { value: "EURL", label: "EURL", description: "SARL à associé unique." },
  { value: "SASU", label: "SASU", description: "SAS à associé unique. Fréquent pour une activité solo en société." },
  { value: "SARL", label: "SARL", description: "Société à responsabilité limitée, plusieurs associés." },
  { value: "SAS", label: "SAS", description: "Société par actions simplifiée, plusieurs associés." },
]

const BE: LegalFormOption[] = [
  { value: "Indépendant (personne physique)", label: "Indépendant (personne physique)", description: "Activité exercée en nom propre." },
  { value: "SRL", label: "SRL", description: "Société à responsabilité limitée (ancienne SPRL)." },
  { value: "SComm", label: "SComm", description: "Société en commandite." },
  { value: "SA", label: "SA", description: "Société anonyme." },
  { value: "SNC", label: "SNC", description: "Société en nom collectif." },
]

const CH: LegalFormOption[] = [
  { value: "Raison individuelle", label: "Raison individuelle", description: "Activité exercée en nom propre." },
  { value: "Sàrl", label: "Sàrl", description: "Société à responsabilité limitée." },
  { value: "SA", label: "SA", description: "Société anonyme." },
  { value: "Société en nom collectif", label: "Société en nom collectif", description: "Plusieurs associés en nom collectif." },
]

const BY_COUNTRY: Record<string, LegalFormOption[]> = { FR, BE, CH }

/**
 * Options de formes juridiques pour un pays (avec « Je ne sais pas » et
 * « Autre »). Pays non supporté => seulement les options spéciales (saisie libre).
 */
export function getLegalForms(country: string | null | undefined): LegalFormOption[] {
  const code = (country ?? "FR").toUpperCase()
  const base = BY_COUNTRY[code] ?? []
  return [
    ...base,
    { value: LEGAL_FORM_OTHER, label: "Autre forme juridique", description: "Saisissez votre forme juridique manuellement." },
    { value: LEGAL_FORM_UNKNOWN, label: "Je ne sais pas", description: "Nous vous aidons à identifier votre situation, sans bloquer l'enregistrement." },
  ]
}

/**
 * Résout la valeur stockée en sélection : renvoie l'option connue correspondante
 * ou LEGAL_FORM_OTHER si c'est une valeur libre historique non vide. Vide => "".
 * Préserve donc les valeurs existantes des tenants historiques.
 */
export function resolveLegalFormSelection(
  stored: string | null | undefined,
  country: string | null | undefined,
): string {
  const v = (stored ?? "").trim()
  if (!v) return ""
  const code = (country ?? "FR").toUpperCase()
  const base = BY_COUNTRY[code] ?? []
  const match = base.find((o) => o.value.toLowerCase() === v.toLowerCase())
  return match ? match.value : LEGAL_FORM_OTHER
}
