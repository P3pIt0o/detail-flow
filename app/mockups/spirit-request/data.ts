/**
 * DONNÉES DU PROTOTYPE — Parcours de demande Spirit ACS (mockup interactif).
 *
 * TOUT ce fichier est dérivé des données RÉELLES du projet
 * (`components/custom-sites/spirit-acs/seo-content.ts`). Aucun prix, aucune
 * prestation, aucune formule n'est inventé :
 *   - « from »  → « dès X € » (prix d'entrée, total selon véhicule / analyse) ;
 *   - « exact » → montant ferme confirmé ;
 *   - « quote » → sur devis (aucun montant).
 *
 * Le regroupement en 5 familles reprend la landing validée par Corentin. Il ne
 * préjuge pas de l'architecture SEO (chaque prestation garde sa page). La carte
 * « Polissage & Céramique » agrège les 2 prestations réelles polissage +
 * céramique (la céramique nécessite un polissage : dépendance réelle affichée).
 *
 * En production, ces données proviendront du `PublicSiteCatalog` (cf.
 * v0_plans/practical-sketch.md) ; ici elles sont figées pour la validation.
 */

export const BASE = "/custom-sites/spirit-acs"

export type PriceKind = "from" | "exact" | "quote"

export type Formula = {
  label: string
  priceCents?: number
  kind: PriceKind
  note?: string
}

export type Option = {
  id: string
  label: string
  benefit: string
  /** Prix affiché uniquement s'il est confirmé, sinon « Sur devis ». */
  price: string
}

export type Family = {
  key: string
  /** Nom court (carte + fil du parcours). */
  title: string
  /** Accroche courte. */
  tagline: string
  /** Indication tarifaire de la carte (jamais un faux total). */
  priceLabel: string
  image: string
  alt: string
  /** Prestations réelles regroupées (slugs seo-content) — trace SEO. */
  serviceSlugs: string[]
  /** Ce qui est inclus / présenté avant les formules. */
  included: string[]
  /** Groupes de formules réelles (vide → prestation « sur devis »). */
  formulaGroups: { title?: string; note?: string; formulas: Formula[] }[]
  /** Note de dépendance / caveat réel affiché sous les formules. */
  caveat?: string
  /** Options d'upsell RÉELLES compatibles (2 à 4, ignorables). */
  options: Option[]
  /** Question contextuelle courte propre à la prestation. */
  contextual?: { question: string; choices: string[]; multi?: boolean }
}

/** Formatage « dès 299 € » / « 350 € » / « Sur devis ». */
export function priceText(f: Formula): string {
  if (f.kind === "quote" || f.priceCents == null) return "Sur devis"
  const eur = Math.round(f.priceCents / 100)
  return f.kind === "from" ? `dès ${eur} €` : `${eur} €`
}

export const FAMILIES: Family[] = [
  {
    key: "nettoyage",
    title: "Nettoyage intérieur et extérieur",
    tagline: "Habitacle et extérieur nettoyés avec soin",
    priceLabel: "Sur devis",
    image: `${BASE}/nettoyage-interieur-cuir.jpg`,
    alt: "Habitacle cuir nettoyé et soigné par Spirit ACS",
    serviceSlugs: ["nettoyage-automobile"],
    included: [
      "Habitacle : textiles, plastiques, vitres et finitions",
      "Extérieur : carrosserie, jantes et détails",
      "Rendu adapté à l'état du véhicule",
    ],
    formulaGroups: [],
    caveat: "Le périmètre exact et le tarif sont définis après étude de votre demande.",
    options: [
      { id: "phares", label: "Rénovation de phares", benefit: "Optiques plus claires", price: "dès 80 €" },
      { id: "vitres", label: "Céramique surfaces vitrées", benefit: "Vision et entretien facilités", price: "90 €" },
    ],
    contextual: {
      question: "Que souhaitez-vous nettoyer ?",
      choices: ["Intérieur", "Extérieur", "Intérieur et extérieur"],
    },
  },
  {
    key: "polissage-ceramique",
    title: "Polissage & Céramique",
    tagline: "Correction de la carrosserie puis protection durable",
    priceLabel: "Voir les formules",
    image: `${BASE}/polissage-porsche-911.jpg`,
    alt: "Porsche 911 noire à la carrosserie brillante après polissage par Spirit ACS",
    serviceSlugs: ["polissage-automobile", "protection-ceramique"],
    included: [
      "Correction des défauts légers et gain de brillance",
      "Surface préparée pour une protection durable",
      "Protection céramique adaptée au véhicule",
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
        title: "Protection céramique",
        formulas: [
          { label: "Cire (~9 à 12 mois)", priceCents: 12000, kind: "exact" },
          { label: "Céramique CarPro CQ.UK 3.0 (~2 ans)", priceCents: 17000, kind: "exact" },
          { label: "Céramique Gyeon (~36 mois)", priceCents: 30000, kind: "exact" },
          { label: "Céramique Gtechniq — bicouche, garantie ~5 ans", priceCents: 35000, kind: "exact" },
          { label: "Céramique surfaces vitrées", priceCents: 9000, kind: "exact" },
          { label: "Céramique jantes (~1 an)", kind: "quote" },
        ],
      },
    ],
    caveat:
      "Une protection céramique nécessite un polissage préalable. Le niveau de polissage est déterminé par Spirit ACS après examen de la carrosserie.",
    options: [
      { id: "vitres", label: "Céramique surfaces vitrées", benefit: "Vision et entretien facilités", price: "90 €" },
      { id: "jantes", label: "Céramique jantes", benefit: "Jantes protégées, entretien facilité", price: "Sur devis" },
    ],
  },
  {
    key: "ppf-personnalisation",
    title: "PPF & Personnalisation",
    tagline: "Film transparent de protection et personnalisation",
    priceLabel: "Sur devis",
    image: `${BASE}/ppf-porsche-911.jpg`,
    alt: "Avant de Porsche 911 aux surfaces exposées préservées",
    serviceSlugs: ["protection-ppf"],
    included: [
      "Film transparent sur les zones exposées (avant, arêtes, seuils)",
      "Limitation des impacts sur les surfaces sensibles",
      "Pose et personnalisation définies selon le véhicule",
    ],
    formulaGroups: [],
    caveat: "La pose PPF et la personnalisation sont réalisées sur devis, après analyse des zones à traiter.",
    options: [
      { id: "ceramique", label: "Protection céramique", benefit: "Entretien facilité en complément", price: "Sur devis" },
    ],
    contextual: {
      question: "Zones à protéger (indicatif) :",
      choices: ["Avant complet", "Arêtes et seuils", "Éléments ciblés", "À définir avec Spirit ACS"],
      multi: true,
    },
  },
  {
    key: "renovation-phares",
    title: "Rénovation de phares",
    tagline: "Optiques ternies rendues plus claires",
    priceLabel: "dès 80 €",
    image: `${BASE}/renovation-phares-apres.jpg`,
    alt: "Optique de phare rénovée et de nouveau claire par Spirit ACS",
    serviceSlugs: ["renovation-phares"],
    included: ["Optiques plus claires", "Aspect de l'avant amélioré", "Intervention adaptée à l'état des phares"],
    formulaGroups: [
      { formulas: [{ label: "Rénovation de phares", priceCents: 8000, kind: "from" }] },
    ],
    caveat: "Le tarif final dépend de l'état initial des optiques, évalué avant l'intervention.",
    options: [{ id: "nettoyage", label: "Nettoyage extérieur", benefit: "Un avant net et homogène", price: "Sur devis" }],
  },
  {
    key: "moto",
    title: "Moto",
    tagline: "Entretien esthétique et protection deux-roues",
    priceLabel: "dès 50 €",
    image: `${BASE}/detailing-moto-kymco.jpg`,
    alt: "Scooter trois-roues Kymco entretenu par Spirit ACS",
    serviceSlugs: ["detailing-moto"],
    included: ["Prestations adaptées aux motos", "Protection et personnalisation selon le véhicule", "Soin défini après analyse"],
    formulaGroups: [
      {
        formulas: [
          { label: "Nettoyage moto", priceCents: 5000, kind: "from" },
          { label: "Polissage moto", priceCents: 15000, kind: "from", note: "Sur devis selon l'état de la carrosserie" },
          { label: "Cire / céramique carrosserie (1 à 5 ans)", priceCents: 7000, kind: "from" },
          { label: "Céramique plastique", priceCents: 3000, kind: "from" },
          { label: "Protection sellerie", priceCents: 4000, kind: "from" },
          { label: "PPF moto", kind: "quote" },
        ],
      },
    ],
    caveat: "Les prestations moto sont ajustées à la moto et au résultat recherché ; le tarif final est confirmé après analyse.",
    options: [
      { id: "cire3", label: "Cire carrosserie (~3 mois)", benefit: "Brillance et protection courte", price: "30 €" },
      { id: "cire12", label: "Cire (~1 an)", benefit: "Protection prolongée", price: "45 €" },
      { id: "visiere", label: "Céramique visière de casque (~1 an)", benefit: "Vision facilitée par tous temps", price: "20 €" },
      { id: "plastique", label: "Rénovation / céramique plastique (~2 ans)", benefit: "Plastiques ravivés et protégés", price: "20 €" },
    ],
  },
]

export function getFamily(key: string | null): Family | undefined {
  return FAMILIES.find((f) => f.key === key)
}

/**
 * Types de véhicule proposés en sélection visuelle. Ce sont des CATÉGORIES
 * génériques (aucune marque, aucun logo, aucun référentiel) : elles rejoignent
 * les catégories réellement employées par Spirit pour ses tarifs (citadine /
 * berline / SUV) et l'usage courant. Marque et modèle restent en saisie libre,
 * exactement comme le moteur actuel (`custom_requests.vehicleBrand/Model`).
 */
export const VEHICLE_TYPES = ["Citadine", "Berline", "SUV / 4x4", "Monospace", "Utilitaire / Van", "Moto / Scooter"] as const

/** Préférences de disponibilité (NON confirmées — Spirit ACS valide ensuite). */
export const AVAILABILITY_CHOICES = ["En semaine", "Week-end", "Matin", "Après-midi", "Flexible"] as const
