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
    name: "Infomaniak",
    address: "Rue Eugène-Marziano 25, 1227 Les Acacias, Genève, Suisse",
    website: "https://www.infomaniak.com",
  },
  /** Concepteur / développement du site */
  developer: {
    name: "SiteAlpha",
    address: "14 rue Boulevard Carl-Vogt, 1205 Genève, Suisse",
    contact: "support@detailflow.fr",
    website: "",
  },
  /** Date de dernière mise à jour des documents légaux */
  lastUpdated: "01/01/2026",
} as const
