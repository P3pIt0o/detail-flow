/**
 * ============================================================================
 *  CONFIGURATEUR SPIRIT ACS — DONNÉES & TARIFS DU PARCOURS 9 ÉTAPES (module PUR)
 * ============================================================================
 *
 *  Ce module alimente le parcours de demande en production (UI reproduite à
 *  l'identique de la maquette validée `app/mockups/spirit-request`). Il ne
 *  contient AUCUNE UI ni logique serveur : uniquement les familles de
 *  prestations, la grille tarifaire NETTOYAGE fournie par Spirit ACS, les
 *  suppléments/options, les fonctions PURES de calcul d'estimation et la
 *  projection de la sélection vers le champ `description` de `custom_requests`.
 *
 *  MOTEUR UNIQUE : le configurateur ne fait qu'ALIMENTER la Server Action
 *  existante `submitCustomRequest`. L'estimation affichée est PARTIELLE et
 *  jamais un devis ferme : Spirit ACS confirme toujours après étude/analyse.
 *
 *  SOURCE DE VÉRITÉ TARIFAIRE :
 *   - NETTOYAGE : grille officielle Spirit ACS (ci-dessous), qui remplace toute
 *     valeur d'exemple. Intérieur + Extérieur = (Int + Ext − 10 €).
 *   - Polissage / Céramique / Phares / Moto : prix réels dérivés de
 *     `seo-content.ts` (« dès » = prix d'entrée, « exact » = ferme,
 *     « quote » = sur devis). Rien n'est inventé.
 * ============================================================================
 */

export const BASE = "/custom-sites/spirit-acs"

export type PriceKind = "from" | "exact" | "quote"

export type Formula = {
  label: string
  priceCents?: number
  kind: PriceKind
  note?: string
  /**
   * Protection céramique CARROSSERIE : ne peut être choisie qu'après un
   * polissage (§4). Les céramiques vitres / pare-brise / jantes en sont
   * exemptes (elles vivent dans les options).
   */
  requiresPolish?: boolean
  /** Explication commerciale « En savoir plus » (accordéon, §5). */
  blurb?: string
}

export type Option = {
  id: string
  label: string
  benefit: string
  /** Libellé affiché (« 30 € », « dès 80 € », « Sur devis »). */
  price: string
  /** Montant pris en compte dans l'estimation (absent → non chiffré). */
  priceCents?: number
  kind?: PriceKind
  /**
   * Option de nettoyage rattachée à un périmètre : n'est proposée que si le
   * client a choisi ce périmètre (ou « Intérieur + Extérieur »). Absente →
   * option toujours proposée (§9).
   */
  scope?: "interieur" | "exterieur"
}

/** Familles particulières nécessitant un rendu/tarif dédié. */
export type FamilyKind = "nettoyage" | "formulas" | "devis" | "textile" | "entretien"

export type Family = {
  key: string
  /** Slug canonique réel transmis au moteur (`custom_requests`). */
  serviceSlug: string
  title: string
  tagline: string
  priceLabel: string
  image: string
  alt: string
  kind: FamilyKind
  included: string[]
  formulaGroups: { title?: string; note?: string; formulas: Formula[] }[]
  caveat?: string
  options: Option[]
  /** Question contextuelle courte (étape « Votre demande »). */
  contextual?: { question: string; choices: string[]; multi?: boolean }
  /**
   * Prestation dont le tarif ne dépend PAS du véhicule → l'étape « Véhicule »
   * est retirée du parcours (parcours court, ex. rénovation de phares) ou
   * inutile (le textile est déjà identifié par les éléments choisis).
   */
  skipVehicle?: boolean
}

/* -------------------------------------------------------------------------- */
/*  GRILLE TARIFAIRE NETTOYAGE (officielle Spirit ACS — en centimes)          */
/* -------------------------------------------------------------------------- */

export type CleaningLevel = "indispensable" | "comme-neuf"
export type CleaningZone = "interieur" | "exterieur" | "les-deux"
/** Clés tarifaires de la grille nettoyage (gabarits officiels Spirit ACS). */
export type CleaningVehicleKey = "citadine" | "berline" | "sportive" | "suv" | "monospace5" | "monospace7"

// Grille officielle Spirit ACS (cahier de corrections). Les valeurs non
// explicitement modifiées par le cahier sont conservées telles quelles
// (ex. citadine « intérieur comme neuf », SUV « intérieur comme neuf »).
const CLEANING_INTERIOR: Record<CleaningLevel, Record<CleaningVehicleKey, number>> = {
  indispensable: { citadine: 9000, berline: 10000, sportive: 10000, suv: 11000, monospace5: 12000, monospace7: 13000 },
  "comme-neuf": { citadine: 10000, berline: 12000, sportive: 12000, suv: 13000, monospace5: 15000, monospace7: 16000 },
}

const CLEANING_EXTERIOR: Record<CleaningLevel, Record<CleaningVehicleKey, number>> = {
  indispensable: { citadine: 6000, berline: 7000, sportive: 7000, suv: 8000, monospace5: 8000, monospace7: 8000 },
  "comme-neuf": { citadine: 10000, berline: 11000, sportive: 11000, suv: 12000, monospace5: 12000, monospace7: 12000 },
}

/**
 * Formule COMBINÉE unique « Intérieur + Extérieur complet » (§8) = Intérieur
 * Comme neuf + Extérieur Indispensable. Tarifs FERMES fournis par Spirit ACS
 * (la remise éventuelle est déjà intégrée : aucun calcul dérivé, aucun niveau
 * à choisir).
 */
const CLEANING_COMBO: Record<CleaningVehicleKey, number> = {
  citadine: 16000, berline: 18000, sportive: 18000, suv: 20000, monospace5: 22000, monospace7: 23000,
}

/** Plancher « dès » affiché à l'étape Formules (citadine, véhicule inconnu). */
export const CLEANING_FLOOR: Record<CleaningLevel, number> = {
  indispensable: CLEANING_INTERIOR.indispensable.citadine,
  "comme-neuf": CLEANING_INTERIOR["comme-neuf"].citadine,
}

/** Plancher « dès » de la formule combinée Intérieur + Extérieur (citadine). */
export const CLEANING_COMBO_FLOOR = CLEANING_COMBO.citadine

/** Prix de base nettoyage (centimes) pour un couple zone/niveau/gabarit. */
export function cleaningBaseCents(zone: CleaningZone, level: CleaningLevel, vk: CleaningVehicleKey): number {
  // Formule combinée : tarif ferme unique, indépendant du niveau (§8).
  if (zone === "les-deux") return CLEANING_COMBO[vk]
  if (zone === "interieur") return CLEANING_INTERIOR[level][vk]
  return CLEANING_EXTERIOR[level][vk]
}

/** Tarif de la formule combinée Intérieur + Extérieur complet pour un gabarit. */
export function cleaningComboCents(vk: CleaningVehicleKey): number {
  return CLEANING_COMBO[vk]
}

/**
 * Tarif de l'option « Nettoyage intérieur » (§3) selon le TYPE de véhicule
 * sélectionné : nettoyage intérieur « Indispensable » du gabarit. `null` si le
 * gabarit est hors grille (→ sur devis). Sert au libellé de l'option ET à
 * l'estimation.
 */
export function interiorAddonCentsFor(vehType: string | null): number | null {
  const vk = cleaningVehicleKey(vehType)
  return vk ? CLEANING_INTERIOR.indispensable[vk] : null
}

export const CLEANING_LEVEL_LABEL: Record<CleaningLevel, string> = {
  indispensable: "Indispensable",
  "comme-neuf": "Comme neuf",
}

export const CLEANING_ZONE_LABEL: Record<CleaningZone, string> = {
  interieur: "Intérieur",
  exterieur: "Extérieur",
  "les-deux": "Intérieur + Extérieur",
}

/**
 * Opérations détaillées incluses par périmètre et par niveau (listes fournies
 * par Spirit ACS — aucune invention). Affichées dans les cartes comparatives du
 * parcours nettoyage. La formule combinée « Intérieur + Extérieur » (§8) =
 * Intérieur « Comme neuf » + Extérieur « Indispensable » : elle réutilise donc
 * ces mêmes listes, sans nouveau contenu.
 */
export const CLEANING_DETAILS: Record<"interieur" | "exterieur", Record<CleaningLevel, string[]>> = {
  interieur: {
    indispensable: [
      "Dépoussiérage",
      "Nettoyage des plastiques",
      "Aspiration de l'habitacle et du coffre",
      "Nettoyage du volant",
      "Nettoyage des vitres",
      "Nettoyage des tours de portes",
      "Shampoing des tapis",
    ],
    "comme-neuf": [
      "Tout le contenu de l'Indispensable",
      "Shampoing des sièges cuir / tissus / Alcantara",
      "Rénovateur plastique",
    ],
  },
  exterieur: {
    indispensable: [
      "Jantes en profondeur",
      "Pré-lavage",
      "Lavage",
      "Cire de finition toutes surfaces",
      "Brillant pneus",
    ],
    "comme-neuf": [
      "Jantes en profondeur",
      "Pré-lavage",
      "Décontamination chimique",
      "Lavage",
      "Suppression du goudron",
      "Cire de finition toutes surfaces",
      "Brillant pneus",
      "Rénovation des plastiques",
      "Rénovation des échappements",
    ],
  },
}

/**
 * Projette un type de véhicule (catégories visuelles du parcours) vers une clé
 * de la grille nettoyage. `null` = gabarit hors grille (utilitaire, moto) →
 * la prestation reste « sur devis » (aucun prix inventé).
 * Le monospace utilise le palier « 5 places » comme plancher chiffré ; un
 * 7 places est ajusté par Spirit ACS (l'estimation reste partielle).
 */
/**
 * Ids d'options nettoyage DÉJÀ COUVERTES par la formule sélectionnée : une
 * prestation incluse dans le pack ne doit jamais être reproposée (ni repayée)
 * en option. Le lien est fait par IDENTIFIANT d'option — jamais par comparaison
 * du texte affiché, volontairement fragile (« Rénovation d'échappement »
 * l'option vs « Rénovation des échappements » le pack). Règle métier réelle
 * Spirit ACS : seule la formule Extérieur « Comme neuf » embarque la rénovation
 * des échappements ; la formule combinée fixe l'extérieur à « Indispensable »
 * (§8) et ne la couvre donc pas.
 */
export function includedCleaningOptionIds(
  zone: CleaningZone | null,
  level: CleaningLevel | null,
): string[] {
  // Niveau extérieur réellement appliqué au périmètre choisi.
  const exteriorLevel: CleaningLevel | null =
    zone === "les-deux" ? "indispensable" : zone === "exterieur" ? level : null
  const ids: string[] = []
  if (exteriorLevel === "comme-neuf") ids.push("renovation-echappement")
  return ids
}

export function cleaningVehicleKey(vehType: string | null): CleaningVehicleKey | null {
  switch (vehType) {
    case "Citadine":
      return "citadine"
    case "Berline":
      return "berline"
    case "Sportive":
      return "sportive"
    case "SUV":
      return "suv"
    case "Monospace 5 places":
      return "monospace5"
    case "Monospace 7 places":
      return "monospace7"
    default:
      return null
  }
}

/* -------------------------------------------------------------------------- */
/*  GRILLE ENTRETIEN RÉGULIER (officielle Spirit ACS — en centimes)           */
/* -------------------------------------------------------------------------- */

export type EntretienFrequency = "mensuel" | "trimestriel"

const ENTRETIEN: Record<EntretienFrequency, Record<CleaningVehicleKey, number>> = {
  mensuel: { citadine: 7500, berline: 8000, sportive: 8000, suv: 9000, monospace5: 10000, monospace7: 11000 },
  trimestriel: { citadine: 9500, berline: 10000, sportive: 10000, suv: 11000, monospace5: 13000, monospace7: 14000 },
}

export const ENTRETIEN_FLOOR: Record<EntretienFrequency, number> = {
  mensuel: ENTRETIEN.mensuel.citadine,
  trimestriel: ENTRETIEN.trimestriel.citadine,
}

export const ENTRETIEN_FREQUENCY_LABEL: Record<EntretienFrequency, string> = {
  mensuel: "Entretien mensuel",
  trimestriel: "Entretien trimestriel",
}

/** Prix entretien (centimes) pour une fréquence + gabarit, ou `null` hors grille. */
export function entretienBaseCents(freq: EntretienFrequency, vk: CleaningVehicleKey | null): number | null {
  if (!vk) return null
  return ENTRETIEN[freq][vk]
}

/* -------------------------------------------------------------------------- */
/*  FAMILLES DE PRESTATIONS                                                    */
/* -------------------------------------------------------------------------- */

export const FAMILIES: Family[] = [
  {
    key: "nettoyage",
    serviceSlug: "nettoyage-automobile",
    title: "Nettoyage intérieur et extérieur",
    tagline: "Habitacle et extérieur nettoyés avec soin",
    priceLabel: "dès 90 €",
    image: `${BASE}/nettoyage-interieur-cuir.jpg`,
    alt: "Habitacle cuir nettoyé et soigné par Spirit ACS",
    kind: "nettoyage",
    included: [
      "Habitacle : textiles, plastiques, vitres et finitions",
      "Extérieur : carrosserie, jantes et détails",
      "Deux niveaux : Indispensable ou Comme neuf",
    ],
    formulaGroups: [],
    caveat:
      "Le tarif dépend du type de véhicule et du périmètre choisi ; il est confirmé par Spirit ACS après étude de votre demande.",
    // Options rattachées à un périmètre (§9) : les options « intérieur » ne sont
    // proposées que pour un nettoyage intérieur ou la formule complète ; « très
    // sale » reste pertinent quel que soit le périmètre (aucun `scope`).
    options: [
      { id: "tres-sale", label: "Véhicule très sale / sable / poils", benefit: "Nettoyage renforcé", price: "+30 €", priceCents: 3000, kind: "exact" },
      { id: "hydratation-cuir", label: "Hydratation cuir", benefit: "Cuir nourri et protégé", price: "+30 €", priceCents: 3000, kind: "exact", scope: "interieur" },
      { id: "nettoyage-5-sieges", label: "Nettoyage 5 sièges", benefit: "Sièges détachés en profondeur", price: "+50 €", priceCents: 5000, kind: "exact", scope: "interieur" },
      { id: "desinfection-vapeur", label: "Désinfection vapeur", benefit: "Habitacle assaini", price: "+30 €", priceCents: 3000, kind: "exact", scope: "interieur" },
      { id: "ceramique-cuir", label: "Céramique cuir", benefit: "Protection durable du cuir", price: "249 €", priceCents: 24900, kind: "exact", scope: "interieur" },
      // « Moteur & échappement » n'est plus une prestation distincte : ce sont des
      // compléments proposés en option du nettoyage (tarifs réels Spirit ACS).
      { id: "nettoyage-moteur", label: "Nettoyage moteur", benefit: "Compartiment moteur dégraissé et nettoyé", price: "Sur devis", kind: "quote" },
      { id: "renovation-echappement", label: "Rénovation d'échappement", benefit: "Sorties d'échappement ravivées", price: "dès 20 €", priceCents: 2000, kind: "from", scope: "exterieur" },
    ],
  },
  {
    key: "polissage-ceramique",
    serviceSlug: "polissage-automobile",
    title: "Polissage & Céramique",
    tagline: "Correction de la carrosserie puis protection durable",
    priceLabel: "dès 299 €",
    image: `${BASE}/polissage-porsche-911.jpg`,
    alt: "Porsche 911 noire à la carrosserie brillante après polissage par Spirit ACS",
    kind: "formulas",
    included: [
      "Lavage + décontamination",
      "Correction des défauts et gain de brillance",
      "Surface préparée pour une protection durable",
      "Protection céramique adaptée au véhicule",
      "Sealant durée 2 mois offert",
    ],
    formulaGroups: [
      {
        title: "Polissage",
        note: "Citadine · Berline · SUV — le niveau est déterminé après inspection.",
        formulas: [
          { label: "Niveau 1 — éclat", priceCents: 29900, kind: "from", note: "Citadine 299 € · Berline 349 € · SUV 399 €" },
          { label: "Niveau 2 — correction en deux étapes", priceCents: 39900, kind: "from", note: "Citadine 399 € · Berline 449 € · SUV 499 €" },
          { label: "Niveau 3 — correction en trois étapes", priceCents: 49900, kind: "from", note: "Citadine 499 € · Berline 549 € · SUV 599 €" },
        ],
      },
      {
        // §4 : les protections céramiques CARROSSERIE nécessitent un polissage
        // préalable (verrouillé côté UI). Les céramiques vitres / pare-brise /
        // jantes en sont exemptées et vivent dans les options ci-dessous.
        title: "Protection céramique (carrosserie)",
        note: "Nécessite un polissage préalable — sélectionnez d'abord un niveau ci-dessus.",
        formulas: [
          {
            label: "Cire (~9 à 12 mois)",
            priceCents: 12000,
            kind: "exact",
            requiresPolish: true,
            blurb:
              "Une cire de protection qui ravive la brillance et fait perler l'eau. Protection d'entrée idéale, d'une durée d'environ 9 à 12 mois, à renouveler ensuite.",
          },
          {
            label: "Céramique CarPro CQ.UK 3.0 (~2 ans)",
            priceCents: 17000,
            kind: "exact",
            requiresPolish: true,
            blurb:
              "Une protection céramique qui facilite l'entretien et préserve l'aspect du vernis, pour une tenue d'environ 2 ans. Bon compromis entre durée et budget.",
          },
          {
            label: "Céramique Gyeon (~36 mois)",
            priceCents: 30000,
            kind: "exact",
            requiresPolish: true,
            blurb:
              "Une protection céramique haut de gamme, d'une durée annoncée d'environ 36 mois. Pour ceux qui veulent une protection longue durée et un entretien simplifié.",
          },
          {
            label: "Céramique Gtechniq — bicouche, garantie ~5 ans",
            priceCents: 35000,
            kind: "exact",
            requiresPolish: true,
            blurb:
              "Notre protection céramique la plus durable : une pose bicouche Gtechniq garantie environ 5 ans, pour une tranquillité maximale sur la durée.",
          },
        ],
      },
    ],
    caveat:
      "Une protection céramique carrosserie nécessite un polissage préalable (déterminé par Spirit ACS après examen). Les céramiques surfaces vitrées, pare-brise et jantes peuvent, elles, être ajoutées sans polissage.",
    // §3 : options proposées après le choix d'un niveau de polissage. La
    // « Céramique jantes 1 an » est sur devis ; le « Nettoyage intérieur » est
    // chiffré selon le gabarit sélectionné (cf. computeEstimate).
    options: [
      { id: "ceramique-vitres", label: "Céramique surfaces vitrées (dont pare-brise)", benefit: "Vision et entretien facilités par tous temps", price: "90 €", priceCents: 9000, kind: "exact" },
      { id: "ceramique-parebrise", label: "Céramique pare-brise", benefit: "Pare-brise protégé, meilleure vision sous la pluie", price: "50 €", priceCents: 5000, kind: "exact" },
      { id: "renovation-echappements", label: "Rénovation des échappements", benefit: "Sorties d'échappement ravivées", price: "dès 20 €", priceCents: 2000, kind: "from" },
      { id: "nettoyage-interieur", label: "Nettoyage intérieur", benefit: "Habitacle nettoyé — tarif selon le véhicule", price: "Selon véhicule", kind: "from" },
      { id: "renovation-optiques", label: "Rénovation des optiques de phare", benefit: "Optiques plus claires", price: "dès 80 €", priceCents: 8000, kind: "from" },
      { id: "ceramique-jantes-1an", label: "Céramique jantes 1 an", benefit: "Jantes protégées un an, entretien facilité", price: "Sur devis", kind: "quote" },
    ],
  },
  {
    key: "ppf-personnalisation",
    serviceSlug: "protection-ppf",
    title: "PPF & Personnalisation",
    tagline: "Film transparent de protection et personnalisation",
    priceLabel: "Sur devis",
    image: `${BASE}/ppf-porsche-911.jpg`,
    alt: "Avant de Porsche 911 aux surfaces exposées préservées",
    kind: "devis",
    included: [
      "PPF : film transparent sur les zones exposées de la carrosserie",
      "Personnalisation : peinture d'étriers, passages de roues, dépose covering…",
      "Pose et personnalisation définies selon le véhicule",
    ],
    formulaGroups: [],
    caveat:
      "Le PPF est réalisé sur devis, après analyse des zones à traiter. Sélectionnez ci-dessous les zones PPF et/ou les prestations de personnalisation souhaitées.",
    options: [
      { id: "peinture-etriers", label: "Peinture d'étriers", benefit: "Étriers repeints, aspect sportif", price: "200 €", priceCents: 20000, kind: "exact" },
      { id: "peinture-etriers-sticker", label: "Peinture d'étriers avec sticker", benefit: "Étriers repeints + logo/sticker", price: "220 €", priceCents: 22000, kind: "exact" },
      { id: "passages-roues", label: "Traitement des passages de roues", benefit: "Passages de roues protégés et nets", price: "Sur devis", kind: "quote" },
      { id: "depose-covering", label: "Dépose de covering", benefit: "Retrait du covering sans abîmer la peinture", price: "Sur devis", kind: "quote" },
      { id: "destickage", label: "Destickage / dépose d'autocollants", benefit: "Retrait des autocollants et adhésifs", price: "Sur devis", kind: "quote" },
      { id: "ceramique-jantes", label: "Céramique jantes 1 an", benefit: "Jantes protégées, entretien facilité", price: "Sur devis", kind: "quote" },
      { id: "ceramique", label: "Protection céramique", benefit: "Entretien facilité en complément", price: "Sur devis", kind: "quote" },
    ],
    contextual: {
      question: "Zones PPF souhaitées :",
      choices: ["Phares", "Montants de portes", "Vitres", "Bas de coffre", "Pare-pierre latéraux"],
      multi: true,
    },
  },
  {
    key: "renovation-phares",
    serviceSlug: "renovation-phares",
    title: "Rénovation de phares",
    tagline: "Optiques ternies rendues plus claires",
    priceLabel: "dès 80 €",
    image: `${BASE}/renovation-phares-apres.jpg`,
    alt: "Optique de phare rénovée et de nouveau claire par Spirit ACS",
    kind: "formulas",
    included: ["Optiques plus claires", "Aspect de l'avant amélioré", "Intervention adaptée à l'état des phares"],
    formulaGroups: [{ formulas: [{ label: "Rénovation de phares", priceCents: 8000, kind: "from" }] }],
    caveat: "Le tarif final dépend de l'état initial des optiques, évalué avant l'intervention.",
    // Parcours court (§10) : prix unique quel que soit le modèle → ni étape
    // véhicule ni options superflues. On ne demande que l'essentiel pour
    // transmettre la demande.
    options: [],
    skipVehicle: true,
  },
  {
    key: "moto",
    serviceSlug: "detailing-moto",
    title: "Moto",
    tagline: "Entretien esthétique et protection deux-roues",
    priceLabel: "dès 50 €",
    image: `${BASE}/detailing-moto-kymco.jpg`,
    alt: "Scooter trois-roues Kymco entretenu par Spirit ACS",
    kind: "formulas",
    included: ["Prestations adaptées aux motos", "Protection et personnalisation selon le véhicule", "Soin défini après analyse"],
    formulaGroups: [
      {
        formulas: [
          { label: "Nettoyage moto", priceCents: 5000, kind: "from" },
          { label: "Polissage moto", priceCents: 15000, kind: "from", note: "Sur devis selon l'état de la carrosserie" },
          { label: "Cire / céramique carrosserie (1 à 5 ans)", priceCents: 7000, kind: "from", note: "Sur devis selon la protection retenue" },
          { label: "Céramique plastique", priceCents: 3000, kind: "from", note: "Sur devis selon la moto" },
          { label: "Protection sellerie", priceCents: 4000, kind: "from", note: "Sur devis selon la moto" },
          { label: "PPF moto", kind: "quote" },
        ],
      },
    ],
    caveat: "Les prestations moto sont ajustées à la moto et au résultat recherché ; le tarif final est confirmé après analyse.",
    options: [
      { id: "cire3", label: "Cire carrosserie (~3 mois)", benefit: "Brillance et protection courte", price: "30 €", priceCents: 3000, kind: "exact" },
      { id: "cire12", label: "Cire (~1 an)", benefit: "Protection prolongée", price: "45 €", priceCents: 4500, kind: "exact" },
      { id: "visiere", label: "Céramique visière de casque (~1 an)", benefit: "Vision facilitée par tous temps", price: "20 €", priceCents: 2000, kind: "exact" },
      { id: "plastique", label: "Rénovation / céramique plastique (~2 ans)", benefit: "Plastiques ravivés et protégés", price: "20 €", priceCents: 2000, kind: "exact" },
    ],
  },
  {
    key: "nettoyage-textile",
    serviceSlug: "nettoyage-textile",
    title: "Nettoyage textile",
    tagline: "Canapés, fauteuils et chaises nettoyés en profondeur",
    priceLabel: "dès 50 €",
    image: `${BASE}/nettoyage-textile.png`,
    alt: "Canapé et textiles d'ameublement nettoyés en profondeur par Spirit ACS",
    kind: "textile",
    // §16 : la famille « Nettoyage textile » ne concerne QUE les textiles
    // d'ameublement (aucun textile de véhicule ici — le nettoyage intérieur
    // auto reste dans la famille « Nettoyage automobile »).
    included: [
      "Aspiration puis nettoyage en profondeur des textiles",
      "Canapés, fauteuils, chaises et assises",
      "Soin et protection du cuir en complément si besoin",
    ],
    formulaGroups: [
      {
        title: "Élément à nettoyer",
        note: "Déplacement offert à moins de 10 km, puis 0,70 €/km au-delà.",
        formulas: [
          { label: "Canapé 2 places", priceCents: 8000, kind: "exact" },
          { label: "Canapé 3 places", priceCents: 9000, kind: "exact" },
          { label: "Canapé 4 places ou canapé d'angle", priceCents: 11000, kind: "exact" },
          { label: "Canapé 5 places ou canapé d'angle", priceCents: 12000, kind: "exact" },
          { label: "Fauteuil", priceCents: 5000, kind: "exact" },
          { label: "Chaise", priceCents: 2000, kind: "exact" },
          { label: "À partir de 5 chaises", priceCents: 1500, kind: "from", note: "15 € par chaise" },
          { label: "Nettoyage cuir", priceCents: 5000, kind: "exact" },
        ],
      },
    ],
    caveat:
      "Le tarif dépend des éléments à traiter et de leur état ; il est confirmé par Spirit ACS après étude. Déplacement offert à moins de 10 km, puis 0,70 €/km.",
    options: [
      { id: "hydratation-cuir", label: "Hydratation du cuir", benefit: "Cuir nourri et protégé", price: "Sur devis", kind: "quote" },
    ],
    // Les éléments choisis identifient déjà ce qui est traité → pas d'étape
    // « type de véhicule » (le textile n'est pas rattaché à un gabarit).
    skipVehicle: true,
  },
  {
    key: "entretien-regulier",
    serviceSlug: "entretien-regulier",
    title: "Entretien régulier",
    tagline: "Véhicule entretenu toute l'année à tarif préférentiel",
    priceLabel: "dès 75 €",
    image: `${BASE}/nettoyage-interieur-cuir.jpg`,
    alt: "Véhicule entretenu régulièrement par Spirit ACS",
    kind: "entretien",
    included: [
      "Entretien récurrent à tarif préférentiel",
      "Fréquence mensuelle ou trimestrielle au choix",
      "Véhicule maintenu propre toute l'année",
    ],
    formulaGroups: [],
    caveat:
      "L'entretien régulier maintient votre véhicule propre toute l'année à un tarif préférentiel. Le tarif dépend de la fréquence et du type de véhicule.",
    options: [],
  },
  {
    key: "moteur-echappement",
    serviceSlug: "nettoyage-moteur",
    title: "Moteur & échappement",
    tagline: "Nettoyage moteur et rénovation d'échappement",
    priceLabel: "Sur devis",
    image: `${BASE}/echappement-titane.jpg`,
    alt: "Sorties d'échappement en titane rénovées par Spirit ACS",
    kind: "devis",
    included: [
      "Nettoyage du compartiment moteur",
      "Rénovation des sorties d'échappement",
      "Intervention adaptée après analyse",
    ],
    formulaGroups: [],
    caveat: "Ces prestations sont réalisées sur devis, après analyse de l'état du véhicule.",
    options: [],
    contextual: {
      question: "Prestation souhaitée :",
      choices: ["Nettoyage moteur", "Rénovation d'échappement"],
      multi: true,
    },
  },
]

export function getFamily(key: string | null): Family | undefined {
  return FAMILIES.find((f) => f.key === key)
}

/** Slug (URL `?prestation=`) → clé de PROFIL de prestation (usage interne). */
export function familyKeyForSlug(slug: string | null | undefined): string | null {
  if (!slug) return null
  // La céramique carrosserie ne se commande jamais seule → ramenée au polissage.
  if (slug === "protection-ceramique") return "polissage-ceramique"
  const match = FAMILIES.find((f) => f.serviceSlug === slug)
  return match?.key ?? null
}

/* -------------------------------------------------------------------------- */
/*  NIVEAU 1 — LES 6 GRANDES FAMILLES DE PRESTATIONS                          */
/* -------------------------------------------------------------------------- */
/*
 *  Le parcours suit une hiérarchie stricte (cf. cahier des charges) :
 *    NIVEAU 1  → choix de l'UNE des 6 familles ci-dessous ;
 *    NIVEAU 2  → choix de la prestation / formule de cette famille ;
 *    NIVEAU 3+ → uniquement les étapes pertinentes pour cette prestation.
 *
 *  Une famille regroupe une ou plusieurs PRESTATIONS (profils `Family`
 *  ci-dessus). La famille « Nettoyage intérieur & extérieur » regroupe ainsi
 *  la prestation ponctuelle, l'entretien régulier et les prestations
 *  complémentaires moteur & échappement — qui ne sont donc PAS des familles.
 */

export type MainFamily = {
  key: string
  title: string
  tagline: string
  priceLabel: string
  image: string
  alt: string
  /** Slug de la page SEO dédiée (« En savoir plus »). */
  seoSlug: string
  /** Clés des profils `Family` (niveau 2) rattachés à cette famille. */
  prestationKeys: string[]
}

function buildMainFamily(
  key: string,
  seoSlug: string,
  prestationKeys: string[],
  overrides?: Partial<Pick<MainFamily, "title" | "tagline" | "priceLabel">>,
): MainFamily {
  const p = getFamily(key)
  if (!p) throw new Error(`MainFamily: profil introuvable « ${key} »`)
  return {
    key,
    title: overrides?.title ?? p.title,
    tagline: overrides?.tagline ?? p.tagline,
    priceLabel: overrides?.priceLabel ?? p.priceLabel,
    image: p.image,
    alt: p.alt,
    seoSlug,
    prestationKeys,
  }
}

/** LES 6 FAMILLES — exactement, dans l'ordre affiché. Aucune autre. */
export const MAIN_FAMILIES: MainFamily[] = [
  // « Nettoyage intérieur & extérieur » va directement au parcours nettoyage :
  // le type de véhicule d'abord, puis le choix de la formule. « Entretien
  // régulier » a été retiré du parcours ; « Moteur & échappement » devient une
  // option (cf. profil « nettoyage »). Une seule sous-prestation → aucun écran
  // intermédiaire de choix de prestation.
  buildMainFamily("nettoyage", "nettoyage-automobile", ["nettoyage"], {
    title: "Nettoyage intérieur & extérieur",
    tagline: "Intérieur et extérieur, deux niveaux au choix",
    priceLabel: "dès 90 €",
  }),
  buildMainFamily("polissage-ceramique", "polissage-automobile", ["polissage-ceramique"], {
    title: "Polissage & protection céramique",
  }),
  buildMainFamily("ppf-personnalisation", "protection-ppf", ["ppf-personnalisation"], {
    title: "PPF & personnalisation",
  }),
  buildMainFamily("renovation-phares", "renovation-phares", ["renovation-phares"]),
  buildMainFamily("moto", "detailing-moto", ["moto"]),
  buildMainFamily("nettoyage-textile", "nettoyage-textile", ["nettoyage-textile"]),
]

export function getMainFamily(key: string | null): MainFamily | undefined {
  return MAIN_FAMILIES.find((f) => f.key === key)
}

/**
 * Slug (URL `?prestation=<seoSlug>`) → clé de la GRANDE FAMILLE (niveau 1).
 * Une carte de la homepage ne présélectionne QUE la famille, jamais une
 * prestation interne. Les anciens slugs (entretien, moteur) sont rattachés à
 * la famille « Nettoyage » — le client choisit ensuite la prestation.
 */
export function mainFamilyKeyForSlug(slug: string | null | undefined): string | null {
  if (!slug) return null
  if (slug === "protection-ceramique") return "polissage-ceramique"
  if (slug === "entretien-regulier" || slug === "nettoyage-moteur") return "nettoyage"
  const match = MAIN_FAMILIES.find((f) => f.seoSlug === slug)
  return match?.key ?? null
}

/** Profils (niveau 2) d'une famille, dans l'ordre. */
export function prestationsForFamily(familyKey: string | null): Family[] {
  const mf = getMainFamily(familyKey)
  if (!mf) return []
  return mf.prestationKeys.map((k) => getFamily(k)).filter((p): p is Family => Boolean(p))
}

/**
 * Catégories de véhicule du parcours AUTO (§10) : Citadine, Berline, Sportive,
 * SUV, Monospace 5 places, Monospace 7 places. Ni moto ni scooter (la moto a
 * son propre parcours), ni « Utilitaire / Van » (remplacé par Monospace 7).
 */
export const AUTO_VEHICLE_TYPES = ["Citadine", "Berline", "Sportive", "SUV", "Monospace 5 places", "Monospace 7 places"] as const
/** Parcours Moto (§13) : le type de véhicule ne propose que « Moto ». */
export const MOTO_VEHICLE_TYPES = ["Moto"] as const
/** Liste par défaut (auto) — conservée pour compat d'import. */
export const VEHICLE_TYPES = AUTO_VEHICLE_TYPES

/** Types de véhicule proposés selon la famille (moto → « Moto » uniquement). */
export function vehicleTypesForFamily(familyKey: string | null | undefined): readonly string[] {
  return familyKey === "moto" ? MOTO_VEHICLE_TYPES : AUTO_VEHICLE_TYPES
}

/** Préférences de disponibilité (NON confirmées — Spirit ACS valide ensuite). */
export const AVAILABILITY_CHOICES = ["En semaine", "Week-end", "Matin", "Après-midi", "Flexible"] as const

/* -------------------------------------------------------------------------- */
/*  FORMATAGE & ESTIMATION                                                    */
/* -------------------------------------------------------------------------- */

/** « 90 € » — arrondi à l'euro (les tarifs Spirit sont en euros pleins). */
export function euros(cents: number): string {
  return `${Math.round(cents / 100)} €`
}

/** « dès 299 € » / « 350 € » / « Sur devis ». */
export function priceText(f: Formula): string {
  if (f.kind === "quote" || f.priceCents == null) return "Sur devis"
  return f.kind === "from" ? `dès ${euros(f.priceCents)}` : euros(f.priceCents)
}

export type EstimateLine = { label: string; value: string }

export type Estimate = {
  lines: EstimateLine[]
  /** Total chiffré (centimes) des composantes fermes + options chiffrées. */
  totalCents: number
  /** Réduction Intérieur + Extérieur appliquée (centimes). */
  discountCents: number
  /**
   * `true` si une partie n'est pas ferme (« dès », « sur devis », gabarit hors
   * grille) : l'affichage indique alors « à partir de » / estimation partielle.
   */
  partial: boolean
  /** `true` si aucune composante n'est chiffrable → « Sur devis ». */
  quoteOnly: boolean
}

export type FlowSelection = {
  family: Family
  vehType: string | null
  /** Formule choisie par index de groupe (polissage/céramique/moto/phares). */
  formulas: Record<number, string>
  inspection: boolean
  /** Nettoyage : niveau + zone. */
  cleaningLevel: CleaningLevel | null
  cleaningZone: CleaningZone | null
  /** Entretien régulier : fréquence choisie. */
  entretienFrequency: EntretienFrequency | null
  /** Nettoyage textile : éléments à traiter (MULTI-sélection, libellés). */
  textileItems: string[]
  /** Ids d'options sélectionnées. */
  options: string[]
}

/**
 * Calcule l'estimation PARTIELLE affichée au client. Ne renvoie jamais un devis
 * ferme : toute composante « dès » / « sur devis » rend l'estimation partielle.
 */
export function computeEstimate(sel: FlowSelection): Estimate {
  const { family } = sel
  const lines: EstimateLine[] = []
  let total = 0
  let discount = 0
  let partial = false
  let priced = false

  if (family.kind === "nettoyage") {
    const level = sel.cleaningLevel
    const zone = sel.cleaningZone
    const vk = cleaningVehicleKey(sel.vehType)
    // La formule combinée (§8) n'exige pas de niveau ; les périmètres simples oui.
    if (zone && (zone === "les-deux" || level)) {
      if (!vk) {
        // Gabarit hors grille → sur devis (aucun prix inventé).
        partial = true
        const lbl = zone === "les-deux" ? "Intérieur + Extérieur complet" : `${CLEANING_ZONE_LABEL[zone]} · ${CLEANING_LEVEL_LABEL[level!]}`
        lines.push({ label: lbl, value: "Sur devis" })
      } else if (zone === "les-deux") {
        const combo = CLEANING_COMBO[vk]
        total += combo
        priced = true
        lines.push({ label: "Formule Intérieur + Extérieur complet", value: euros(combo) })
      } else if (zone === "interieur") {
        const int = CLEANING_INTERIOR[level!][vk]
        total += int
        priced = true
        lines.push({ label: `Nettoyage intérieur · ${CLEANING_LEVEL_LABEL[level!]}`, value: euros(int) })
      } else {
        const ext = CLEANING_EXTERIOR[level!][vk]
        total += ext
        priced = true
        lines.push({ label: `Nettoyage extérieur · ${CLEANING_LEVEL_LABEL[level!]}`, value: euros(ext) })
      }
    }
  } else if (family.kind === "textile") {
    // MULTI-sélection : somme des éléments choisis (§6).
    const flatFormulas = family.formulaGroups.flatMap((g) => g.formulas)
    for (const label of sel.textileItems) {
      const f = flatFormulas.find((x) => x.label === label)
      if (!f) continue
      if (f.kind === "quote" || f.priceCents == null) {
        partial = true
        lines.push({ label: f.label, value: "Sur devis" })
      } else {
        total += f.priceCents
        priced = true
        if (f.kind === "from") partial = true
        lines.push({ label: f.label, value: priceText(f) })
      }
    }
  } else if (family.kind === "formulas") {
    sel.family.formulaGroups.forEach((g, gi) => {
      const label = sel.formulas[gi]
      if (!label) return
      const f = g.formulas.find((x) => x.label === label)
      if (!f) return
      if (f.kind === "quote" || f.priceCents == null) {
        partial = true
        lines.push({ label: f.label, value: "Sur devis" })
      } else {
        total += f.priceCents
        priced = true
        if (f.kind === "from") partial = true
        lines.push({ label: f.label, value: priceText(f) })
      }
    })
    if (sel.inspection) {
      partial = true
      lines.push({ label: "Formule", value: "À déterminer après inspection" })
    }
  } else if (family.kind === "entretien") {
    const freq = sel.entretienFrequency
    if (freq) {
      const vk = cleaningVehicleKey(sel.vehType)
      const base = entretienBaseCents(freq, vk)
      if (base == null) {
        partial = true
        lines.push({ label: ENTRETIEN_FREQUENCY_LABEL[freq], value: "Sur devis" })
      } else {
        total += base
        priced = true
        lines.push({ label: ENTRETIEN_FREQUENCY_LABEL[freq], value: euros(base) })
      }
    }
  } else {
    // Famille « sur devis » (PPF & personnalisation, moteur & échappement).
    partial = true
  }

  // Options / suppléments chiffrés.
  for (const id of sel.options) {
    const opt = family.options.find((o) => o.id === id)
    if (!opt) continue
    // Option « Nettoyage intérieur » du polissage (§3) : prix = nettoyage
    // intérieur « Indispensable » du gabarit sélectionné (jamais un prix
    // générique). Hors grille → sur devis.
    if (opt.id === "nettoyage-interieur") {
      const vk = cleaningVehicleKey(sel.vehType)
      const c = vk ? CLEANING_INTERIOR.indispensable[vk] : null
      if (c == null) {
        partial = true
        lines.push({ label: opt.label, value: "Sur devis" })
      } else {
        total += c
        priced = true
        lines.push({ label: opt.label, value: euros(c) })
      }
      continue
    }
    if (opt.priceCents == null || opt.kind === "quote") {
      partial = true
      lines.push({ label: opt.label, value: "Sur devis" })
    } else {
      total += opt.priceCents
      priced = true
      if (opt.kind === "from") partial = true
      lines.push({ label: opt.label, value: opt.price })
    }
  }

  return { lines, totalCents: Math.max(0, total), discountCents: discount, partial, quoteOnly: !priced }
}

/** Libellé de synthèse du total (« 130 € », « À partir de 90 € », « Sur devis »). */
export function estimateHeadline(est: Estimate): string {
  if (est.quoteOnly) return "Sur devis"
  return est.partial ? `À partir de ${euros(est.totalCents)}` : euros(est.totalCents)
}

/* -------------------------------------------------------------------------- */
/*  SÉRIALISATION VERS `description` (approche ZÉRO-MIGRATION)                 */
/* -------------------------------------------------------------------------- */

export type SerializeInput = FlowSelection & {
  description: string
  contextual: string[]
  availability: string[]
  availabilityNote: string
  photoCount: number
}

/**
 * Projette la sélection complète du parcours vers le champ `description` de
 * `custom_requests`. Lisible tel quel dans la fiche admin, sans nouvelle
 * colonne. L'estimation est explicitement notée PARTIELLE.
 */
export function serializeFlow(input: SerializeInput): string {
  const { family } = input
  const lines: string[] = []
  lines.push(`Prestation : ${family.title}`)

  if (family.kind === "nettoyage") {
    if (input.cleaningZone === "les-deux") {
      lines.push("Périmètre : Intérieur + Extérieur complet")
      lines.push("Formule : Intérieur comme neuf + Extérieur indispensable (formule unique)")
    } else {
      if (input.cleaningZone) lines.push(`Périmètre : ${CLEANING_ZONE_LABEL[input.cleaningZone]}`)
      if (input.cleaningLevel) lines.push(`Formule : ${CLEANING_LEVEL_LABEL[input.cleaningLevel]}`)
    }
  } else if (family.kind === "entretien") {
    if (input.entretienFrequency) lines.push(`Fréquence : ${ENTRETIEN_FREQUENCY_LABEL[input.entretienFrequency]}`)
  } else if (family.kind === "textile") {
    const flatFormulas = family.formulaGroups.flatMap((g) => g.formulas)
    for (const label of input.textileItems) {
      const f = flatFormulas.find((x) => x.label === label)
      lines.push(`Élément : ${label}${f ? ` (${priceText(f)})` : ""}`)
    }
  } else if (family.kind === "formulas") {
    if (input.inspection) {
      lines.push("Formule : à déterminer par Spirit ACS après inspection")
    } else {
      family.formulaGroups.forEach((g, gi) => {
        const label = input.formulas[gi]
        if (!label) return
        const f = g.formulas.find((x) => x.label === label)
        lines.push(`${g.title ?? "Formule"} : ${label}${f ? ` (${priceText(f)})` : ""}`)
      })
    }
  }

  if (input.contextual.length) lines.push(`Précisions : ${input.contextual.join(", ")}`)

  const optionLabels = input.options
    .map((id) => family.options.find((o) => o.id === id))
    .filter((o): o is Option => Boolean(o))
    .map((o) => `${o.label} (${o.price})`)
  if (optionLabels.length) lines.push(`Options : ${optionLabels.join(", ")}`)

  const est = computeEstimate(input)
  if (!est.quoteOnly) {
    lines.push(
      `Estimation ${est.partial ? "partielle (à partir de) " : ""}: ${estimateHeadline(est)} — à confirmer par Spirit ACS après étude.`,
    )
    if (est.discountCents > 0) lines.push(`(Réduction Intérieur + Extérieur : −${euros(est.discountCents)})`)
  } else {
    lines.push("Estimation : sur devis (confirmée par Spirit ACS après étude).")
  }

  if (input.availability.length || input.availabilityNote.trim()) {
    const avail = [input.availability.join(", "), input.availabilityNote.trim()].filter(Boolean).join(" — ")
    lines.push(`Disponibilités souhaitées (non confirmées) : ${avail}`)
  }

  if (input.photoCount > 0) lines.push(`Photos jointes : ${input.photoCount}`)

  lines.push("")
  lines.push("Message du client :")
  lines.push(input.description.trim() || "(aucun message ajouté)")
  return lines.join("\n")
}
