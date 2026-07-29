/**
 * ============================================================================
 *  MENTIONS LÉGALES — Données de l'entreprise
 * ============================================================================
 *
 *  À COMPLÉTER OBLIGATOIREMENT par le professionnel avant mise en ligne.
 *  Ces informations sont légalement requises en France.
 *
 *  ⚠️ Les textes juridiques ci-dessous (CGV, confidentialité) sont des
 *  MODÈLES à faire valider par un professionnel du droit. Ils ne
 *  constituent pas un conseil juridique.
 * ============================================================================
 */

export const legalConfig = {
  /** Raison sociale / nom de l'entreprise */
  companyName: "DetailFlow SARL",
  /** Forme juridique (SARL, EI, auto-entrepreneur, etc.) */
  legalForm: "SARL au capital de 5 000 €",
  /** Numéro SIRET */
  siret: "000 000 000 00000",
  /** Numéro de TVA intracommunautaire (si applicable) */
  vat: "FR00000000000",
  /** Directeur de la publication */
  publicationDirector: "Prénom Nom",
  /** Adresse du siège */
  headquarters: "12 rue des Artisans, 75011 Paris, France",
  /** Hébergeur du site */
  host: {
    name: "Vercel Inc.",
    address: "440 N Barranca Ave #4133, Covina, CA 91723, USA",
    website: "https://vercel.com",
  },
  /** Date de dernière mise à jour des documents légaux */
  lastUpdated: "01/01/2026",
} as const
