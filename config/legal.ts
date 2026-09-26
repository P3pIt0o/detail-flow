/**
 * ============================================================================
 *  CONFIGURATION LÉGALE CENTRALE — DetailFlow
 * ============================================================================
 *
 *  SOURCE UNIQUE DE VÉRITÉ des informations juridiques publiques de DetailFlow
 *  (mentions légales, conditions, confidentialité, cookies). Aucune donnée
 *  d'adresse / d'éditeur / d'hébergeur ne doit être dupliquée ailleurs : les
 *  pages légales consomment ce fichier.
 *
 *  EXPLOITANT : DetailFlow est exploité sous forme d'ENTREPRISE INDIVIDUELLE
 *  de droit français, basée à Chevry (01). La même entreprise individuelle
 *  exploite l'agence web SiteAlpha, qui assure la conception et la gestion
 *  technique de la plateforme (SiteAlpha n'est pas une société distincte).
 *
 *  ⚠️ Les textes juridiques (mentions, conditions, confidentialité, cookies)
 *  sont des MODÈLES cohérents avec le fonctionnement réel du produit. Ils ne
 *  constituent pas un conseil juridique et devraient être relus par un
 *  professionnel du droit avant un usage contentieux.
 *
 *  DONNÉES MANQUANTES : certaines informations légales ne sont pas encore
 *  connues (nom légal exact du titulaire, TVA intracommunautaire). Elles sont
 *  marquées `null` ci-dessous et listées dans `LEGAL_MISSING_INFO`. Ne JAMAIS
 *  inventer ces valeurs : tant qu'elles sont `null`, les pages légales masquent
 *  proprement la ligne concernée (aucun « [À compléter] » affiché publiquement).
 * ============================================================================
 */

/** Adresse structurée de l'exploitant (entreprise individuelle, France). */
const OPERATOR_ADDRESS = {
  street: "243 rue la Pièce",
  postalCode: "01170",
  city: "Chevry",
  country: "France",
} as const

/** Adresse formatée sur une ligne (repli d'affichage). */
const OPERATOR_ADDRESS_LINE = `${OPERATOR_ADDRESS.street}, ${OPERATOR_ADDRESS.postalCode} ${OPERATOR_ADDRESS.city}, ${OPERATOR_ADDRESS.country}`

export const legalConfig = {
  /* --- Marque / service ------------------------------------------------- */
  /** Nom commercial du service. */
  brandName: "DetailFlow",
  /** Alias rétro-compatible (pages tenant existantes). = brandName. */
  companyName: "DetailFlow",
  /** Site officiel. */
  website: "https://detailflow.fr",
  websiteLabel: "detailflow.fr",
  /** Email de contact public. */
  email: "contact@detailflow.fr",
  /** Contact dédié aux questions de protection des données. */
  privacyContact: "contact@detailflow.fr",

  /* --- Exploitant (entreprise individuelle, droit français) ------------- */
  /**
   * Nom légal exact du titulaire de l'entreprise individuelle (nom + prénom de
   * l'entrepreneur individuel). `null` tant qu'il n'est pas fourni → NE PAS
   * INVENTER (cf. LEGAL_MISSING_INFO).
   */
  legalBusinessName: null as string | null,
  /** Forme juridique. */
  legalForm: "Entreprise individuelle (droit français)",
  /** Numéro SIREN. */
  siren: "931 535 587",
  /** Numéro SIRET (établissement). */
  siret: "931 535 587 00014",
  /** Immatriculation au registre du commerce et des sociétés. */
  rcs: "RCS Bourg-en-Bresse",
  /** Numéro de TVA intracommunautaire, si l'exploitant y est assujetti. `null` tant qu'inconnu. */
  vatNumber: null as string | null,
  /**
   * Responsable de la publication. `null` → repli sur le nom légal du titulaire
   * lorsqu'il sera renseigné. NE PAS INVENTER un nom.
   */
  publicationDirector: null as string | null,
  /** Adresse de l'exploitant (structurée + ligne formatée). */
  address: OPERATOR_ADDRESS,
  addressLine: OPERATOR_ADDRESS_LINE,
  /** Alias rétro-compatible (pages tenant existantes). */
  headquarters: OPERATOR_ADDRESS_LINE,

  /* --- Conception & gestion technique ----------------------------------- */
  /**
   * SiteAlpha assure la conception, le développement et la gestion technique de
   * la plateforme. Agence web exploitée par la même entreprise individuelle que
   * DetailFlow — présentée comme prestataire technique, PAS comme une société
   * juridiquement distincte (aucune raison sociale distincte inventée).
   */
  technicalManager: {
    name: "SiteAlpha",
    role: "Agence web",
    address: OPERATOR_ADDRESS_LINE,
    city: OPERATOR_ADDRESS.city,
    website: "https://www.sitealpha.ch",
    websiteLabel: "www.sitealpha.ch",
  },
  /** Alias rétro-compatible (pages tenant existantes consommant `developer`). */
  developer: {
    name: "SiteAlpha",
    address: OPERATOR_ADDRESS_LINE,
    contact: "contact@detailflow.fr",
    website: "https://www.sitealpha.ch",
  },

  /* --- Hébergement ------------------------------------------------------ */
  /**
   * Hébergeur réel (coordonnées suisses factuelles d'Infomaniak — inchangées).
   */
  host: {
    name: "Infomaniak Network SA",
    address: "Rue Eugène-Marziano 25, 1227 Les Acacias (GE), Suisse",
    ide: "CHE-103.167.648",
    website: "https://www.infomaniak.com",
    websiteLabel: "www.infomaniak.com",
  },

  /* --- Métadonnées documentaires ---------------------------------------- */
  /** Date de dernière mise à jour affichée sur tous les documents légaux. */
  lastUpdated: "26/09/2026",
} as const

/**
 * Prestataires / sous-traitants techniques RÉELLEMENT utilisés, pour la
 * politique de confidentialité. Audit basé sur le code et les variables
 * d'environnement du projet. `crossBorder: true` = traitement susceptible
 * d'avoir lieu hors de l'Union européenne (à encadrer côté RGPD).
 *
 * NB : les outils de développement (ex. plateformes de build) NE SONT PAS des
 * prestataires publics à citer ici.
 */
export const DATA_PROCESSORS = [
  {
    name: "Infomaniak Network SA",
    purpose: "Hébergement et infrastructure",
    location: "Suisse (décision d'adéquation)",
    crossBorder: false,
  },
  {
    name: "Vercel Inc.",
    purpose: "Diffusion de l'application et mesure d'audience agrégée (sans cookie)",
    location: "États-Unis / international",
    crossBorder: true,
  },
  {
    name: "Neon",
    purpose: "Base de données (comptes, réservations, contenus professionnels)",
    location: "Union européenne / international",
    crossBorder: true,
  },
  {
    name: "Stripe",
    purpose: "Traitement des paiements et des abonnements",
    location: "International",
    crossBorder: true,
  },
  {
    name: "Resend",
    purpose: "Envoi des emails transactionnels (confirmations, liens, notifications)",
    location: "International",
    crossBorder: true,
  },
  {
    name: "AllMySMS",
    purpose: "Envoi des SMS (rappels et notifications), lorsque la fonction est activée",
    location: "Union européenne",
    crossBorder: false,
  },
  {
    name: "Google Maps Platform (Google)",
    purpose: "Calcul des distances et frais de déplacement à partir d'une adresse",
    location: "International",
    crossBorder: true,
  },
] as const

/**
 * Informations légales encore à fournir. Affichées nulle part publiquement —
 * servent uniquement de rappel interne et sont reprises dans le compte-rendu.
 */
export const LEGAL_MISSING_INFO = [
  "Nom légal exact du titulaire de l'entreprise individuelle (nom et prénom de l'entrepreneur individuel)",
  "Numéro de TVA intracommunautaire, si l'exploitant est assujetti",
  "Nom du responsable de la publication (si différent du titulaire)",
] as const

/** Nom d'éditeur affichable : nom légal si connu, sinon nom commercial. */
export const legalEditorName: string = legalConfig.legalBusinessName ?? legalConfig.brandName
