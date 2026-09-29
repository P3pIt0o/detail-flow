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
 *  IDENTITÉ LÉGALE : l'exploitant est Clément Roig, entrepreneur individuel (EI).
 *  Il est également responsable de la publication. La seule donnée encore
 *  inconnue est le numéro de TVA intracommunautaire (marqué `null`, listé dans
 *  `LEGAL_MISSING_INFO`). Ne JAMAIS inventer une valeur `null` : tant qu'elle
 *  l'est, les pages légales masquent proprement la ligne concernée (aucun
 *  « [À compléter] » affiché publiquement).
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
   * Nom légal du titulaire de l'entreprise individuelle (nom + prénom de
   * l'entrepreneur individuel).
   */
  legalBusinessName: "Clément Roig" as string | null,
  /** Forme juridique. */
  legalForm: "Entrepreneur individuel (EI)",
  /** Numéro SIREN. */
  siren: "931 535 587",
  /** Numéro SIRET (établissement). */
  siret: "931 535 587 00014",
  /** Immatriculation au registre du commerce et des sociétés. */
  rcs: "RCS Bourg-en-Bresse",
  /** Numéro de TVA intracommunautaire, si l'exploitant y est assujetti. `null` tant qu'inconnu. */
  vatNumber: null as string | null,
  /** Responsable de la publication (le titulaire de l'entreprise individuelle). */
  publicationDirector: "Clément Roig" as string | null,
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
   * Hébergeur applicatif RÉEL. L'application `detailflow.fr` (Next.js) est
   * déployée, exécutée et diffusée par Vercel (build, fonctions serverless,
   * réseau de diffusion). C'est l'hébergeur au sens des mentions légales.
   *
   * ⚠️ L'adresse postale de Vercel doit être confirmée par l'exploitant avant
   * usage contentieux (cf. LEGAL_MISSING_INFO).
   */
  appHost: {
    name: "Vercel Inc.",
    role: "Hébergement et diffusion de l'application",
    address: "340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis",
    website: "https://vercel.com",
    websiteLabel: "vercel.com",
  },
  /**
   * Infomaniak : prestataire d'infrastructure de l'exploitant pour le NOM DE
   * DOMAINE et la MESSAGERIE électronique (adresse contact@detailflow.fr).
   * Coordonnées suisses factuelles inchangées. Ce n'est PAS l'hébergeur de
   * l'application (celle-ci est servie par Vercel).
   *
   * ⚠️ Le périmètre exact des services Infomaniak est à confirmer par
   * l'exploitant (cf. LEGAL_MISSING_INFO).
   */
  host: {
    name: "Infomaniak Network SA",
    role: "Nom de domaine et messagerie électronique",
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
    name: "Vercel Inc.",
    purpose: "Hébergement, exécution et diffusion de l'application ; mesure d'audience agrégée (sans cookie)",
    location: "États-Unis / international",
    crossBorder: true,
  },
  {
    name: "Infomaniak Network SA",
    purpose: "Nom de domaine et messagerie électronique",
    location: "Suisse (décision d'adéquation)",
    crossBorder: false,
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
  "Numéro de TVA intracommunautaire, si l'exploitant est assujetti",
  "Adresse postale exacte de l'hébergeur applicatif (Vercel Inc.) — à confirmer",
  "Périmètre exact des services fournis par Infomaniak (nom de domaine, messagerie) — à confirmer par l'exploitant",
] as const

/** Nom d'éditeur affichable : nom légal si connu, sinon nom commercial. */
export const legalEditorName: string = legalConfig.legalBusinessName ?? legalConfig.brandName
