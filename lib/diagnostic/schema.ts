/**
 * ============================================================================
 *  QUESTIONNAIRE PUBLIC « SITE SUR MESURE » — SOURCE UNIQUE (PURE)
 * ============================================================================
 *  Fichier PUR : aucun import serveur / DB / React. Importable partout
 *  (questionnaire client, Server Action, gabarit email, tests).
 *
 *  Il centralise :
 *   - les valeurs autorisées et leurs libellés (une seule source, aucun drift) ;
 *   - la logique conditionnelle (quelles étapes afficher) ;
 *   - la validation serveur + nettoyage des entrées ;
 *   - la construction du récapitulatif « Votre projet ».
 *
 *  AUCUNE table, AUCUNE migration : le parcours ne persiste rien, il qualifie
 *  une demande envoyée par email.
 * ============================================================================
 */

/* ----------------------------- Types de réponses ------------------------- */

export type YesNo = "oui" | "non"
export type DomainAnswer = "oui" | "non" | "je_ne_sais_pas"
export type BookingAnswer = "aucun" | "google_agenda" | "logiciel" | "telephone" | "papier" | "autre"
export type IdentityAnswer = "logo_couleurs" | "logo_seul" | "rien"

/** État complet du questionnaire côté client (valeurs éventuellement vides). */
export type DiagnosticAnswers = {
  hasSite: YesNo | null
  siteUrl: string
  hasDomain: DomainAnswer | null
  domain: string
  booking: BookingAnswer | null
  bookingTool: string
  goals: string[]
  features: string[]
  identity: IdentityAnswer | null
  companyName: string
  firstName: string
  email: string
  phone: string
  comment: string
}

/** Données validées et nettoyées côté serveur (prêtes pour l'email). */
export type DiagnosticData = {
  hasSite: YesNo
  siteUrl: string
  hasDomain: DomainAnswer
  domain: string
  booking: BookingAnswer
  bookingTool: string
  goals: string[]
  features: string[]
  identity: IdentityAnswer
  companyName: string
  firstName: string
  email: string
  phone: string
  comment: string
}

export type DiagnosticField =
  | "companyName"
  | "firstName"
  | "email"
  | "phone"
  | "siteUrl"

/* ------------------------------- Libellés -------------------------------- */

export const DOMAIN_LABELS: Record<DomainAnswer, string> = {
  oui: "Oui, déjà acquis",
  non: "Non, pas encore",
  je_ne_sais_pas: "Je ne sais pas",
}

export const BOOKING_LABELS: Record<BookingAnswer, string> = {
  aucun: "Aucun système",
  google_agenda: "Google Agenda",
  logiciel: "Logiciel de réservation",
  telephone: "Téléphone / messages",
  papier: "Agenda papier",
  autre: "Autre",
}

export const IDENTITY_LABELS: Record<IdentityAnswer, string> = {
  logo_couleurs: "Oui, logo + couleurs",
  logo_seul: "J'ai seulement un logo",
  rien: "Non, rien encore",
}

export const GOAL_LABELS: Record<string, string> = {
  site_pro: "Avoir un site plus professionnel",
  plus_demandes: "Recevoir plus de demandes",
  visibilite_google: "Être plus visible sur Google",
  reservation: "Ajouter la réservation en ligne",
  paiements: "Ajouter les paiements / acomptes",
  centraliser: "Centraliser mon activité",
  moderniser: "Moderniser mon image",
}

export const FEATURE_LABELS: Record<string, string> = {
  reservation: "Réservation en ligne",
  paiement: "Paiement / acompte",
  devis: "Demandes de devis",
  galerie: "Galerie avant / après",
  avis: "Avis Google",
  prestations: "Prestations & tarifs",
  seo_local: "SEO local",
  domaine: "Domaine personnalisé",
  contact: "Formulaire de contact",
  ne_sais_pas: "Je ne sais pas encore",
}

/** Ordre d'affichage des options (les libellés restent la source unique). */
export const GOAL_ORDER = [
  "site_pro",
  "plus_demandes",
  "visibilite_google",
  "reservation",
  "paiements",
  "centraliser",
  "moderniser",
] as const

export const FEATURE_ORDER = [
  "reservation",
  "paiement",
  "devis",
  "galerie",
  "avis",
  "prestations",
  "seo_local",
  "domaine",
  "contact",
  "ne_sais_pas",
] as const

export const BOOKING_ORDER: BookingAnswer[] = [
  "aucun",
  "google_agenda",
  "logiciel",
  "telephone",
  "papier",
  "autre",
]

export const DOMAIN_ORDER: DomainAnswer[] = ["oui", "non", "je_ne_sais_pas"]
export const IDENTITY_ORDER: IdentityAnswer[] = ["logo_couleurs", "logo_seul", "rien"]

const GOAL_VALUES = new Set(Object.keys(GOAL_LABELS))
const FEATURE_VALUES = new Set(Object.keys(FEATURE_LABELS))

/* ------------------------------ Limites ---------------------------------- */

export const LIMITS = {
  companyName: 120,
  firstName: 80,
  email: 160,
  phone: 30,
  siteUrl: 300,
  domain: 253,
  bookingTool: 120,
  comment: 1000,
} as const

/* ----------------------------- Étapes / flux ----------------------------- */

/** Clés d'étape dans l'ordre canonique (les micro-étapes suivent leur parent). */
export const STEP_KEYS = [
  "hasSite",
  "siteUrl",
  "hasDomain",
  "domain",
  "booking",
  "bookingTool",
  "goals",
  "features",
  "identity",
  "contact",
  "recap",
] as const

export type StepKey = (typeof STEP_KEYS)[number]

/**
 * Une étape est-elle pertinente au vu des réponses courantes ?
 * Logique conditionnelle (point 11) : on n'affiche jamais une question inutile.
 */
export function isStepVisible(key: StepKey, a: DiagnosticAnswers): boolean {
  switch (key) {
    case "siteUrl":
      return a.hasSite === "oui"
    case "domain":
      return a.hasDomain === "oui"
    case "bookingTool":
      return a.booking === "logiciel" || a.booking === "autre"
    default:
      return true
  }
}

/** Liste ordonnée des étapes réellement affichées pour ces réponses. */
export function visibleSteps(a: DiagnosticAnswers): StepKey[] {
  return STEP_KEYS.filter((k) => isStepVisible(k, a))
}

/* ------------------------------ Helpers texte ---------------------------- */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Nettoie une chaîne : supprime les caractères de contrôle et borne la taille. */
export function sanitizeText(value: unknown, max: number): string {
  if (typeof value !== "string") return ""
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max)
}

/** Téléphone « raisonnable » : chiffres + séparateurs usuels, 6 à 20 chiffres. */
export function isReasonablePhone(value: string): boolean {
  if (!/^[+0-9 ().\-/]{6,30}$/.test(value)) return false
  const digits = value.replace(/\D/g, "")
  return digits.length >= 6 && digits.length <= 20
}

/**
 * Normalise une URL de site saisie librement (« exemple.fr » → « https://exemple.fr »).
 * Renvoie null si la valeur ne ressemble à aucune adresse plausible.
 */
export function normalizeSiteUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const u = new URL(withProto)
    // Un hôte plausible contient au moins un point (domaine.tld).
    if (!u.hostname.includes(".")) return null
    return u.toString().replace(/\/$/, "")
  } catch {
    return null
  }
}

/** Filtre une liste multi-sélection sur l'ensemble autorisé (dédupliquée). */
function cleanMulti(values: unknown, allowed: Set<string>): string[] {
  if (!Array.isArray(values)) return []
  const out: string[] = []
  for (const v of values) {
    if (typeof v === "string" && allowed.has(v) && !out.includes(v)) out.push(v)
  }
  return out
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null
}

/* ------------------------------ Validation ------------------------------- */

export type ValidationResult =
  | { ok: true; data: DiagnosticData }
  | { ok: false; errors: Partial<Record<DiagnosticField, string>> }

/**
 * Valide et nettoie les données reçues du navigateur. Ne fait JAMAIS confiance
 * aux entrées client : enums bornés, longueurs bornées, formats vérifiés.
 */
export function validateDiagnostic(raw: unknown): ValidationResult {
  const input = (raw ?? {}) as Record<string, unknown>
  const errors: Partial<Record<DiagnosticField, string>> = {}

  const companyName = sanitizeText(input.companyName, LIMITS.companyName)
  const firstName = sanitizeText(input.firstName, LIMITS.firstName)
  const email = sanitizeText(input.email, LIMITS.email)
  const phone = sanitizeText(input.phone, LIMITS.phone)
  const comment = sanitizeText(input.comment, LIMITS.comment)

  if (companyName.length < 2) errors.companyName = "Merci d'indiquer le nom de votre entreprise."
  if (firstName.length < 2) errors.firstName = "Merci d'indiquer votre prénom."
  if (!EMAIL_RE.test(email)) errors.email = "Adresse email invalide."
  if (!isReasonablePhone(phone)) errors.phone = "Numéro de téléphone invalide."

  const hasSite = oneOf<YesNo>(input.hasSite, ["oui", "non"])
  const hasDomain = oneOf<DomainAnswer>(input.hasDomain, DOMAIN_ORDER)
  const booking = oneOf<BookingAnswer>(input.booking, BOOKING_ORDER)
  const identity = oneOf<IdentityAnswer>(input.identity, IDENTITY_ORDER)

  // URL du site : requise et valide UNIQUEMENT si un site existe.
  let siteUrl = ""
  if (hasSite === "oui") {
    const normalized = normalizeSiteUrl(sanitizeText(input.siteUrl, LIMITS.siteUrl))
    if (!normalized) errors.siteUrl = "Adresse de site invalide."
    else siteUrl = normalized
  }

  const domain = hasDomain === "oui" ? sanitizeText(input.domain, LIMITS.domain) : ""
  const bookingTool =
    booking === "logiciel" || booking === "autre" ? sanitizeText(input.bookingTool, LIMITS.bookingTool) : ""

  const goals = cleanMulti(input.goals, GOAL_VALUES)
  const features = cleanMulti(input.features, FEATURE_VALUES)

  if (Object.keys(errors).length > 0) return { ok: false, errors }

  return {
    ok: true,
    data: {
      hasSite: (hasSite ?? "non") as YesNo,
      siteUrl,
      hasDomain: (hasDomain ?? "je_ne_sais_pas") as DomainAnswer,
      domain,
      booking: (booking ?? "aucun") as BookingAnswer,
      bookingTool,
      goals,
      features,
      identity: (identity ?? "rien") as IdentityAnswer,
      companyName,
      firstName,
      email,
      phone,
      comment,
    },
  }
}

/* --------------------------- Récapitulatif projet ------------------------ */

export type SummaryRow = { label: string; value: string }

/**
 * Construit le récapitulatif « Votre projet » (réutilisé par l'écran de
 * récapitulatif ET par l'email). N'affiche que les lignes réellement remplies.
 */
export function buildProjectSummary(a: DiagnosticAnswers): SummaryRow[] {
  const rows: SummaryRow[] = []

  if (a.hasSite) {
    rows.push({
      label: "Site actuel",
      value: a.hasSite === "oui" ? a.siteUrl.trim() || "Oui, déjà en ligne" : "Aucun site",
    })
  }

  if (a.hasDomain) {
    const base = DOMAIN_LABELS[a.hasDomain]
    rows.push({
      label: "Nom de domaine",
      value: a.hasDomain === "oui" && a.domain.trim() ? `${base} (${a.domain.trim()})` : base,
    })
  }

  if (a.booking) {
    const base = BOOKING_LABELS[a.booking]
    rows.push({
      label: "Prise de rendez-vous",
      value: a.bookingTool.trim() ? `${base} — ${a.bookingTool.trim()}` : base,
    })
  }

  if (a.goals.length > 0) {
    rows.push({ label: "Objectifs prioritaires", value: a.goals.map((g) => GOAL_LABELS[g] ?? g).join(", ") })
  }

  if (a.features.length > 0) {
    rows.push({ label: "Fonctionnalités souhaitées", value: a.features.map((f) => FEATURE_LABELS[f] ?? f).join(", ") })
  }

  if (a.identity) {
    rows.push({ label: "Identité visuelle", value: IDENTITY_LABELS[a.identity] })
  }

  return rows
}
