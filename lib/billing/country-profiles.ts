/**
 * ============================================================================
 *  PROFILS DE FACTURATION PAR PAYS — abstraction centrale multi-pays
 * ============================================================================
 *  Objectif : UNE seule source de vérité pour les libellés, la normalisation et
 *  la validation FORMELLE des identifiants légaux et numéros de TVA selon le
 *  pays d'une partie (vendeur OU client, indépendamment).
 *
 *  NON-OBJECTIFS (volontaire, aucune hallucination réglementaire) :
 *   - ne détermine PAS la fiscalité applicable (taux, exonérations, reverse
 *     charge) — cela relève du traitement TVA confirmé par le professionnel ;
 *   - ne valide PAS l'existence réelle d'un numéro (pas d'appel VIES/officiel) ;
 *     seules les FORMES sont vérifiées (nombre de chiffres, préfixe).
 *
 *  Support spécifique : FR, BE, CH. Fallback : GENERIC (autres pays, à préparer
 *  sans bloquer). Le pays du vendeur ne détermine JAMAIS les champs du client.
 * ============================================================================
 */

export type LegalScheme = "FR_SIREN" | "FR_SIRET" | "BE_BCE" | "CH_UID" | "GENERIC"

export type SupportedCountry = "FR" | "BE" | "CH"
export type CountryCode = SupportedCountry | (string & {})

export interface FieldValidation {
  /** La valeur respecte la forme attendue (ou vide + non requis). */
  valid: boolean
  /** Valeur normalisée (à stocker). Chaîne vide si entrée vide. */
  normalized: string
  /** Schéma d'identifiant retenu (pour un identifiant légal). */
  scheme?: LegalScheme
  /** Message court FR expliquant un format invalide (sinon undefined). */
  message?: string
}

export interface RegulatoryLink {
  label: string
  url: string
}

export interface CountryBillingProfile {
  countryCode: CountryCode
  countryName: string
  /** Libellé de l'identifiant d'entreprise du VENDEUR de ce pays. */
  sellerLegalIdLabel: string
  /** Libellé de l'identifiant d'entreprise d'un CLIENT de ce pays. */
  customerLegalIdLabel: string
  /** Schéma d'identifiant par défaut pour ce pays. */
  legalIdScheme: LegalScheme
  vatNumberLabel: string
  /** Exemples de saisie affichés en placeholder (aucune donnée réelle). */
  legalIdPlaceholder: string
  vatNumberPlaceholder: string
  defaultCurrency: string
  /** Liens officiels (affichés dans l'admin sous « source officielle »). */
  regulatoryLinks: RegulatoryLink[]
  normalizeLegalId: (raw: string | null | undefined) => string
  /** Valide la FORME de l'identifiant légal. `required=false` => vide accepté. */
  validateLegalId: (raw: string | null | undefined, required?: boolean) => FieldValidation
  normalizeVatNumber: (raw: string | null | undefined) => string
  /** Valide la FORME du numéro de TVA. `required=false` => vide accepté. */
  validateVatNumber: (raw: string | null | undefined, required?: boolean) => FieldValidation
}

/* -------------------------------------------------------------------------- */
/*  Helpers de normalisation                                                  */
/* -------------------------------------------------------------------------- */

const stripAll = (raw: string | null | undefined) =>
  (raw ?? "").replace(/[\s.\-/]/g, "").toUpperCase()

const emptyOk = (required: boolean): FieldValidation => ({
  valid: !required,
  normalized: "",
  message: required ? "Ce champ est requis." : undefined,
})

/* -------------------------------------------------------------------------- */
/*  FRANCE                                                                    */
/* -------------------------------------------------------------------------- */

const FR: CountryBillingProfile = {
  countryCode: "FR",
  countryName: "France",
  sellerLegalIdLabel: "SIREN / SIRET",
  customerLegalIdLabel: "SIREN / SIRET",
  legalIdScheme: "FR_SIRET",
  vatNumberLabel: "N° TVA intracommunautaire",
  legalIdPlaceholder: "123456789 (SIREN) ou 12345678900012 (SIRET)",
  vatNumberPlaceholder: "FR12345678901",
  defaultCurrency: "EUR",
  regulatoryLinks: [{ label: "impots.gouv.fr — facturation électronique", url: "https://www.impots.gouv.fr/" }],
  normalizeLegalId: (raw) => stripAll(raw).replace(/[^0-9]/g, ""),
  validateLegalId: (raw, required = false) => {
    const normalized = stripAll(raw).replace(/[^0-9]/g, "")
    if (!normalized) return emptyOk(required)
    // SIREN = 9 chiffres ; SIRET = 14 chiffres (SIREN + établissement).
    if (normalized.length === 9) return { valid: true, normalized, scheme: "FR_SIREN" }
    if (normalized.length === 14) return { valid: true, normalized, scheme: "FR_SIRET" }
    return {
      valid: false,
      normalized,
      scheme: normalized.length > 9 ? "FR_SIRET" : "FR_SIREN",
      message: "Un SIREN comporte 9 chiffres et un SIRET 14 chiffres.",
    }
  },
  normalizeVatNumber: (raw) => stripAll(raw),
  validateVatNumber: (raw, required = false) => {
    const normalized = stripAll(raw)
    if (!normalized) return emptyOk(required)
    // FR + clé (2 caractères) + 9 chiffres SIREN.
    if (/^FR[0-9A-Z]{2}[0-9]{9}$/.test(normalized)) return { valid: true, normalized }
    return { valid: false, normalized, message: "Format attendu : FR suivi de 11 caractères (ex. FR12345678901)." }
  },
}

/* -------------------------------------------------------------------------- */
/*  BELGIQUE                                                                  */
/* -------------------------------------------------------------------------- */

const BE: CountryBillingProfile = {
  countryCode: "BE",
  countryName: "Belgique",
  sellerLegalIdLabel: "Numéro d'entreprise (BCE)",
  customerLegalIdLabel: "Numéro d'entreprise (BCE)",
  legalIdPlaceholder: "0123.456.789",
  vatNumberPlaceholder: "BE0123456789",
  legalIdScheme: "BE_BCE",
  vatNumberLabel: "Numéro de TVA",
  defaultCurrency: "EUR",
  regulatoryLinks: [{ label: "efacture.belgium.be — facturation électronique B2B", url: "https://efacture.belgium.be/" }],
  normalizeLegalId: (raw) => stripAll(raw).replace(/[^0-9]/g, ""),
  validateLegalId: (raw, required = false) => {
    // Accepte 0123456789 / 0123 456 789 / 0123.456.789 => 10 chiffres.
    const normalized = stripAll(raw).replace(/[^0-9]/g, "")
    if (!normalized) return emptyOk(required)
    if (normalized.length === 10) return { valid: true, normalized, scheme: "BE_BCE" }
    return { valid: false, normalized, scheme: "BE_BCE", message: "Un numéro BCE comporte 10 chiffres." }
  },
  normalizeVatNumber: (raw) => stripAll(raw),
  validateVatNumber: (raw, required = false) => {
    const normalized = stripAll(raw)
    if (!normalized) return emptyOk(required)
    // BE + 10 chiffres.
    if (/^BE[0-9]{10}$/.test(normalized)) return { valid: true, normalized }
    return { valid: false, normalized, message: "Format attendu : BE suivi de 10 chiffres (ex. BE0123456789)." }
  },
}

/* -------------------------------------------------------------------------- */
/*  SUISSE                                                                    */
/* -------------------------------------------------------------------------- */

/** Reformate 9 chiffres en CHE-123.456.789. */
const formatCheUid = (digits: string) =>
  digits.length === 9 ? `CHE-${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}` : digits

const CH: CountryBillingProfile = {
  countryCode: "CH",
  countryName: "Suisse",
  sellerLegalIdLabel: "IDE / UID",
  customerLegalIdLabel: "IDE / UID",
  legalIdPlaceholder: "CHE-123.456.789",
  vatNumberPlaceholder: "CHE-123.456.789 (TVA)",
  legalIdScheme: "CH_UID",
  vatNumberLabel: "Numéro de TVA",
  defaultCurrency: "CHF",
  regulatoryLinks: [
    { label: "estv.admin.ch — TVA", url: "https://www.estv.admin.ch/" },
    { label: "kmu.admin.ch — PME", url: "https://www.kmu.admin.ch/" },
  ],
  normalizeLegalId: (raw) => {
    const digits = stripAll(raw).replace(/^CHE/, "").replace(/[^0-9]/g, "")
    return formatCheUid(digits)
  },
  validateLegalId: (raw, required = false) => {
    const digits = stripAll(raw).replace(/^CHE/, "").replace(/[^0-9]/g, "")
    if (!digits) return emptyOk(required)
    if (digits.length === 9) return { valid: true, normalized: formatCheUid(digits), scheme: "CH_UID" }
    return { valid: false, normalized: formatCheUid(digits), scheme: "CH_UID", message: "Format attendu : CHE-123.456.789." }
  },
  normalizeVatNumber: (raw) => {
    // STOCKAGE CANONIQUE : CHE-123.456.789 SANS suffixe linguistique.
    // Le suffixe TVA/MWST/IVA (dépend de la langue) n'est PAS intrinsèque au
    // numéro : il est ajouté à l'affichage (PDF/UI). vatStatus est séparé.
    const upper = (raw ?? "").toUpperCase()
    // JAMAIS de troncation : on compte TOUS les chiffres et on exige EXACTEMENT
    // 9. Un excédent (ex. CHE-123.456.789999) reste invalide (non normalisé).
    const digits = upper.replace(/^.*?CHE/, "").replace(/[^0-9]/g, "")
    if (digits.length !== 9) return upper.trim()
    return formatCheUid(digits)
  },
  validateVatNumber: (raw, required = false) => {
    // Accepte CHE123456789 / CHE-123.456.789 / …789 TVA / …789 MWST / …789 IVA.
    // Le suffixe linguistique ne contient aucun chiffre => 9 chiffres exacts.
    // Aucune troncation : CHE-123.456.789999 ou CHE12345678999 => REFUS.
    const upper = (raw ?? "").toUpperCase().trim()
    if (!upper) return emptyOk(required)
    const digits = upper.replace(/^.*?CHE/, "").replace(/[^0-9]/g, "")
    if (digits.length === 9) return { valid: true, normalized: formatCheUid(digits) }
    return { valid: false, normalized: upper, message: "Format attendu : CHE-123.456.789 (le suffixe TVA est ajouté à l'affichage)." }
  },
}

/* -------------------------------------------------------------------------- */
/*  GENERIC (autres pays — architecture préparée, aucune validation stricte)  */
/* -------------------------------------------------------------------------- */

const GENERIC: CountryBillingProfile = {
  countryCode: "GENERIC",
  countryName: "Autre pays",
  sellerLegalIdLabel: "N° d'immatriculation de l'entreprise",
  customerLegalIdLabel: "N° d'immatriculation de l'entreprise",
  legalIdPlaceholder: "N° d'immatriculation",
  vatNumberPlaceholder: "N° de TVA",
  legalIdScheme: "GENERIC",
  vatNumberLabel: "Numéro de TVA",
  defaultCurrency: "EUR",
  regulatoryLinks: [],
  normalizeLegalId: (raw) => (raw ?? "").trim(),
  validateLegalId: (raw, required = false) => {
    const normalized = (raw ?? "").trim()
    if (!normalized) return emptyOk(required)
    return { valid: true, normalized, scheme: "GENERIC" }
  },
  normalizeVatNumber: (raw) => stripAll(raw),
  validateVatNumber: (raw, required = false) => {
    const normalized = stripAll(raw)
    if (!normalized) return emptyOk(required)
    return { valid: true, normalized }
  },
}

const PROFILES: Record<string, CountryBillingProfile> = { FR, BE, CH, GENERIC }

/** Liste des pays avec support spécifique (pour les sélecteurs admin). */
export const SUPPORTED_COUNTRIES: { code: SupportedCountry; name: string }[] = [
  { code: "FR", name: "France" },
  { code: "BE", name: "Belgique" },
  { code: "CH", name: "Suisse" },
]

/**
 * Retourne le profil de facturation d'un pays. Fallback GENERIC pour tout pays
 * non spécifiquement supporté (jamais null : ne bloque jamais un tenant).
 */
export function getCountryProfile(code: CountryCode | null | undefined): CountryBillingProfile {
  if (!code) return FR // défaut historique DetailFlow
  return PROFILES[code.toUpperCase()] ?? GENERIC
}

/* -------------------------------------------------------------------------- */
/*  Type de client — NULL n'est JAMAIS déduit B2C                              */
/* -------------------------------------------------------------------------- */

export type CustomerType = "individual" | "business" | "unknown"

/**
 * Résout le type de client de façon SÛRE. NULL/inconnu => "unknown" (jamais
 * "individual"/B2C). Une règle réglementaire dépendant du B2B/B2C devra traiter
 * "unknown" comme REVIEW_REQUIRED (LOT 2B), pas comme une hypothèse.
 */
export function resolveCustomerType(raw: string | null | undefined): CustomerType {
  if (raw === "individual" || raw === "business") return raw
  return "unknown"
}

/**
 * Le profil de facturation (pays + infos légales + devise) est-il CONFIRMÉ ?
 * S'appuie sur `settings.billingProfileConfirmedAt`. Tant que non confirmé,
 * `companies.country` (default FR) et `companies.currency` (default EUR) sont
 * des valeurs historiques : ne jamais les présenter comme choix légal confirmé.
 */
export function isBillingProfileConfirmed(confirmedAt: Date | string | null | undefined): boolean {
  return confirmedAt != null
}

/**
 * Résout le snapshot légal VENDEUR figé à l'émission (logique PURE, testable).
 *
 * Règles de sécurité (hardening PR #71) :
 * - Profil NON confirmé (billingProfileConfirmedAt NULL) => aucun snapshot
 *   multi-pays : companies.country (default FR historique) ne prouve rien.
 *   issuerCountry / legal / scheme / vat restent null.
 * - Fallback invoiceSiret historique AUTORISÉ uniquement si pays confirmé
 *   === "FR". Jamais pour BE/CH/GENERIC (un SIRET n'est ni BCE ni UID).
 * - Devise : jamais dérivée d'un pays non confirmé. Priorité facture > devise
 *   confirmée du vendeur > (si confirmé) suggestion du pays. Sinon null.
 * Les champs historiques (issuerSiret, issuerName, adresse, IBAN/BIC…) restent
 * gérés séparément et ne sont jamais touchés par ce helper.
 */
export function resolveIssuerBillingSnapshot(input: {
  confirmed: boolean
  companyCountry: string | null | undefined
  legalRegistrationNumber: string | null | undefined
  legalRegistrationScheme: string | null | undefined
  invoiceSiret: string | null | undefined
  vatNumber: string | null | undefined
  sellerDefaultCurrency: string | null | undefined
  invoiceCurrency: string | null | undefined
}): {
  issuerCountry: string | null
  issuerLegalRegistrationNumber: string | null
  issuerLegalRegistrationScheme: string | null
  issuerVatNumber: string | null
  currencyCode: string | null
} {
  const confirmed = input.confirmed
  const issuerCountry = confirmed ? (input.companyCountry ?? null) : null
  const profile = issuerCountry ? getCountryProfile(issuerCountry) : null
  let issuerLegalRegistrationNumber: string | null = null
  let issuerLegalRegistrationScheme: string | null = null
  let issuerVatNumber: string | null = null
  if (confirmed && profile) {
    const siretFallback = issuerCountry === "FR" ? input.invoiceSiret?.trim() || null : null
    issuerLegalRegistrationNumber = input.legalRegistrationNumber?.trim() || siretFallback
    issuerLegalRegistrationScheme = issuerLegalRegistrationNumber
      ? input.legalRegistrationScheme?.trim() ||
        profile.validateLegalId(issuerLegalRegistrationNumber).scheme ||
        profile.legalIdScheme
      : null
    issuerVatNumber = input.vatNumber?.trim() || null
  }
  // Devise : la devise déjà posée sur la facture prime toujours. La devise du
  // vendeur (settings.defaultCurrency) et la suggestion dérivée du pays ne
  // s'appliquent QUE si le profil est confirmé. Non confirmé => facture ou null,
  // jamais de devise déduite d'un profil vendeur non validé.
  const currencyCode = confirmed
    ? (input.invoiceCurrency ?? input.sellerDefaultCurrency ?? (profile ? profile.defaultCurrency : null))
    : (input.invoiceCurrency ?? null)
  return {
    issuerCountry,
    issuerLegalRegistrationNumber,
    issuerLegalRegistrationScheme,
    issuerVatNumber,
    currencyCode,
  }
}

/**
 * Devise à snapshoter sur un NOUVEAU brouillon de facture (LOT 2B.1 hardening).
 *
 * La devise doit appartenir à la facture dès sa création pour éviter tout écart
 * aperçu (DRAFT) vs émission (ISSUED). Règles :
 * - Profil vendeur confirmé (billingProfileConfirmedAt != null) ET
 *   settings.defaultCurrency non vide => cette devise (normalisée majuscules).
 * - Profil NON confirmé => null (jamais de devise déduite d'un profil non
 *   validé, ni de companies.currency/country). Le rendu retombe sur EUR legacy.
 * - Confirmé mais defaultCurrency absent => null (aucune valeur inventée).
 * Aucune conversion FX : on fige seulement le code, pas les montants.
 */
export function resolveDraftCurrency(
  confirmed: boolean,
  defaultCurrency: string | null | undefined,
): string | null {
  if (!confirmed) return null
  const code = (defaultCurrency ?? "").trim().toUpperCase()
  return code || null
}

/** Libellé court d'un scheme d'identifiant légal (affichage PDF/UI). */
const SCHEME_LABEL: Record<string, string> = {
  FR_SIREN: "SIREN",
  FR_SIRET: "SIRET",
  BE_BCE: "BCE",
  CH_UID: "IDE / UID",
  GENERIC: "Identifiant légal",
}

/**
 * Identité légale VENDEUR à AFFICHER sur une facture, résolue UNIQUEMENT depuis
 * le snapshot de la facture (LOT 2B.2, logique pure/testable).
 *
 * Priorité :
 * 1. `legalRegistrationNumber` présent => libellé dérivé du scheme snapshoté
 *    (SIREN / SIRET / BCE / IDE-UID). Scheme NULL/inconnu => « Identifiant légal ».
 *    On ne DEVINE jamais le scheme depuis le pays s'il n'est pas snapshoté.
 * 2. Sinon, fallback historique `legacySiret` UNIQUEMENT si aucun `issuerCountry`
 *    n'est snapshoté (vraie facture FR legacy sans champs multi-pays). Dès qu'un
 *    pays est snapshoté (ex. BE/CH), le legacy SIRET est ignoré : on ne réétiquette
 *    JAMAIS un issuerSiret en BCE/UID, et une facture BE/CH sans identité moderne
 *    retourne null (=> le warning pays-spécifique prend le relais).
 * 3. Sinon null (rien à afficher).
 */
export function resolveIssuerLegalIdentityDisplay(input: {
  issuerCountry: string | null | undefined
  legalRegistrationNumber: string | null | undefined
  legalRegistrationScheme: string | null | undefined
  legacySiret: string | null | undefined
}): { label: string; value: string } | null {
  const number = input.legalRegistrationNumber?.trim() || null
  if (number) {
    const scheme = input.legalRegistrationScheme?.trim().toUpperCase() || ""
    const label = SCHEME_LABEL[scheme] ?? "Identifiant légal"
    return { label, value: number }
  }
  const country = (input.issuerCountry ?? "").trim()
  const legacy = input.legacySiret?.trim() || null
  // Fallback SIRET réservé aux factures legacy SANS pays snapshoté.
  if (!country && legacy) return { label: "SIRET", value: legacy }
  return null
}

/**
 * Warning NON BLOQUANT d'identité vendeur incomplète, basé EXCLUSIVEMENT sur le
 * snapshot facture (LOT 2B.2). Retourne un message ou null.
 *
 * - `issuerCountry` NULL / non supporté => null (on ne DÉDUIT jamais un pays
 *   depuis le tenant courant ; une facture legacy sans pays ne déclenche rien).
 * - Pays supporté (FR/BE/CH) + identité légale absente => message indiquant
 *   l'identifiant manquant (libellé issu du CountryBillingProfile).
 * Aucune affirmation juridique absolue (« conforme » / « non conforme »).
 */
export function buildIssuerIdentityWarning(
  issuerCountry: string | null | undefined,
  hasLegalIdentity: boolean,
): string | null {
  const code = (issuerCountry ?? "").trim().toUpperCase()
  const supported = code === "FR" || code === "BE" || code === "CH"
  if (!supported || hasLegalIdentity) return null
  const label = getCountryProfile(code).sellerLegalIdLabel
  return `Informations légales du vendeur incomplètes sur cette facture (${label} manquant). Vérifiez ce document et complétez votre profil de facturation pour les prochaines factures.`
}

/**
 * Affichage du n° de TVA suisse avec suffixe français (le stockage reste
 * canonique CHE-123.456.789, sans suffixe). Pour les autres pays : renvoie tel quel.
 */
export function formatSwissVatForDisplay(canonical: string | null | undefined): string {
  const v = (canonical ?? "").trim()
  if (!v) return ""
  return /^CHE-\d{3}\.\d{3}\.\d{3}$/.test(v) ? `${v} TVA` : v
}

/* -------------------------------------------------------------------------- */
/*  CLIENT (LOT 2B.3) — rendu depuis le SNAPSHOT facture uniquement           */
/* -------------------------------------------------------------------------- */

/**
 * Identité légale CLIENT à afficher, résolue UNIQUEMENT depuis le snapshot
 * facture. Symétrique du helper vendeur mais totalement indépendante (aucune
 * donnée vendeur en entrée).
 *
 * - `customerType` ≠ "business" => null (un particulier / type inconnu n'affiche
 *   jamais d'identifiant d'entreprise).
 * - numéro absent => null.
 * - libellé dérivé du scheme snapshoté ; scheme NULL/inconnu => « Identifiant légal ».
 *   Le scheme n'est JAMAIS deviné depuis le pays.
 */
export function resolveCustomerLegalIdentityDisplay(input: {
  customerType: string | null | undefined
  customerCountry: string | null | undefined
  legalRegistrationNumber: string | null | undefined
  legalRegistrationScheme: string | null | undefined
}): { label: string; value: string } | null {
  if ((input.customerType ?? "").trim() !== "business") return null
  const number = input.legalRegistrationNumber?.trim() || null
  if (!number) return null
  const scheme = input.legalRegistrationScheme?.trim().toUpperCase() || ""
  return { label: SCHEME_LABEL[scheme] ?? "Identifiant légal", value: number }
}

/**
 * Nom de pays CLIENT à afficher (France / Belgique / Suisse / Autre pays), depuis
 * le snapshot facture. Réservé aux clients "business" : un particulier ou un type
 * inconnu/legacy n'affiche jamais de pays via le bloc B2B, même si customerCountry
 * subsiste dans le snapshot (on ne l'efface pas en DB, on contrôle l'affichage).
 * Retourne null si absent. N'utilise JAMAIS issuerCountry.
 */
export function resolveCustomerCountryLabel(input: {
  customerType: string | null | undefined
  customerCountry: string | null | undefined
}): string | null {
  if ((input.customerType ?? "").trim() !== "business") return null
  const code = (input.customerCountry ?? "").trim().toUpperCase()
  if (!code) return null
  return getCountryProfile(code).countryName
}

/**
 * TVA CLIENT à afficher (donnée d'IDENTITÉ uniquement, aucune règle fiscale).
 * Réservé aux clients "business" avec un numéro snapshoté. Libellé issu du
 * CountryBillingProfile ; formatage CH via formatSwissVatForDisplay. Retourne null sinon.
 */
export function resolveCustomerVatDisplay(input: {
  customerType: string | null | undefined
  customerCountry: string | null | undefined
  vatNumber: string | null | undefined
}): { label: string; value: string } | null {
  if ((input.customerType ?? "").trim() !== "business") return null
  const raw = (input.vatNumber ?? "").trim()
  if (!raw) return null
  const code = (input.customerCountry ?? "").trim().toUpperCase()
  const label = code ? getCountryProfile(code).vatNumberLabel : "Numéro de TVA"
  const value = code === "CH" ? formatSwissVatForDisplay(raw) : raw
  return { label, value }
}

/**
 * Numéro de TVA VENDEUR à afficher (donnée d'IDENTITÉ uniquement, aucune règle
 * fiscale ni validation d'existence). Résolu EXCLUSIVEMENT depuis le snapshot
 * facture (jamais les settings courants). Libellé issu du CountryBillingProfile
 * du pays vendeur ; formatage CH via formatSwissVatForDisplay. Le stockage reste
 * la valeur canonique (ex. CHE-123.456.789) — seul l'affichage change.
 * Retourne null si le numéro est vide. Aucune affirmation « TVA valide ».
 */
export function resolveIssuerVatDisplay(input: {
  issuerCountry: string | null | undefined
  vatNumber: string | null | undefined
}): { label: string; value: string } | null {
  const raw = (input.vatNumber ?? "").trim()
  if (!raw) return null
  const code = (input.issuerCountry ?? "").trim().toUpperCase()
  const label = code ? getCountryProfile(code).vatNumberLabel : "Numéro de TVA"
  const value = code === "CH" ? formatSwissVatForDisplay(raw) : raw
  return { label, value }
}
