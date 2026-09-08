/**
 * ============================================================================
 *  CONTENU ÉDITORIAL SEO — SPÉCIFIQUE À SPIRIT ACS (isolé, remplaçable)
 * ============================================================================
 *
 *  Ce fichier centralise TOUT le contenu rédactionnel SEO propre à Spirit ACS :
 *  métadonnées des pages, présentation locale, prestations, étapes, zone
 *  d'intervention, FAQ et pages de prestations dédiées.
 *
 *  POURQUOI EN CODE ET NON EN BASE ?
 *  L'architecture actuelle ne permet pas de stocker ce contenu éditorial dans
 *  Neon sans migration. Conformément à la consigne, ce contenu est donc défini
 *  ici, CLAIREMENT ISOLÉ et strictement limité au tenant « spirit-acs », afin
 *  d'être facilement remplacé plus tard par du contenu administrable (une
 *  future table éditoriale) SANS toucher au reste du code.
 *
 *  RÈGLES DE RÉDACTION (impératives) :
 *   - Aucune donnée inventée : ni années d'expérience, ni certification, ni
 *     partenariat, ni marque de produit, ni garantie, ni tarif, ni délai, ni
 *     ville non confirmée.
 *   - Français correct, naturel et utile. Pas de bourrage de mots-clés.
 *   - Les FAQ restent prudentes : lorsqu'une réponse dépend de l'état du
 *     véhicule, on renvoie vers une analyse / un devis.
 * ============================================================================
 */

/** Slug du tenant concerné — ce contenu ne doit servir QUE pour lui. */
export const SPIRIT_TENANT_SLUG = "spirit-acs"

/** Ville confirmée (présente dans l'identité du site). Aucune autre inventée. */
export const SPIRIT_CITY = "Lagny-sur-Marne"

/**
 * Coordonnées professionnelles VÉRIFIÉES de Spirit ACS (repli SEO isolé).
 * Utilisées uniquement lorsque les données Neon du tenant sont incomplètes,
 * pour le JSON-LD et l'affichage des coordonnées. Aucune écriture en base,
 * aucune donnée inventée (adresse, téléphone et région réels et publics).
 */
export const SPIRIT_BUSINESS = {
  name: "Spirit Auto Clean Service",
  alternateName: "Spirit ACS",
  phone: "+33699901303",
  streetAddress: "53 Rue Pierre Semard",
  postalCode: "77400",
  addressLocality: "Lagny-sur-Marne",
  addressRegion: "Île-de-France",
  addressCountry: "FR",
} as const

/* -------------------------------------------------------------------------- */
/*  MÉTADONNÉES DES PAGES PRINCIPALES                                         */
/* -------------------------------------------------------------------------- */

export type PageMeta = { title: string; description: string }

export const SPIRIT_PAGE_META = {
  home: {
    title: "Detailing automobile à Lagny-sur-Marne | Spirit ACS",
    description:
      "Spirit ACS, spécialiste du detailing automobile à Lagny-sur-Marne : nettoyage intérieur et extérieur, polissage, protection céramique, PPF et prestations moto. Demandez votre devis.",
  },
  avis: {
    title: "Avis clients Spirit ACS | Detailing à Lagny-sur-Marne",
    description:
      "Découvrez les avis Google des clients de Spirit ACS pour ses prestations de nettoyage, polissage et detailing automobile à Lagny-sur-Marne.",
  },
  contact: {
    title: "Contact et devis | Spirit ACS Lagny-sur-Marne",
    description:
      "Contactez Spirit ACS à Lagny-sur-Marne pour une demande de devis : nettoyage automobile, polissage, protection céramique, PPF et prestations moto.",
  },
} satisfies Record<string, PageMeta>

/* -------------------------------------------------------------------------- */
/*  HERO (accueil)                                                            */
/* -------------------------------------------------------------------------- */

/** H1 précis pour le référencement local (accroche visuelle conservée à part). */
export const SPIRIT_HERO_H1 = "Detailing automobile à Lagny-sur-Marne"
/** Accroche visuelle secondaire (surtitre élégant conservé). */
export const SPIRIT_HERO_KICKER = "Prenez soin de votre véhicule"
/** Sous-titre — retours à la ligne conservés (une phrase par ligne côté rendu). */
export const SPIRIT_HERO_SUBTITLE =
  "Nettoyage, polissage, protection céramique : un detailing réalisé avec exigence. Demandez votre devis personnalisé en quelques instants."

/* -------------------------------------------------------------------------- */
/*  PRÉSENTATION LOCALE (« Qui sommes-nous ? »)                               */
/* -------------------------------------------------------------------------- */

export const SPIRIT_ABOUT_PARAGRAPHS = [
  "Spirit ACS accompagne les particuliers et les professionnels pour l'entretien esthétique, la rénovation et la protection de leurs véhicules à Lagny-sur-Marne. Chaque prestation est adaptée à l'état du véhicule et au résultat recherché, du nettoyage intérieur et extérieur au polissage, à la protection céramique, au PPF et aux prestations pour motos.",
  "Les prestations peuvent être réalisées à l'atelier ou à domicile selon la nature de la demande. Avant chaque intervention, Spirit ACS étudie le véhicule et propose une solution adaptée.",
] as const

/* -------------------------------------------------------------------------- */
/*  ÉTAPES (« Comment se déroule une prestation ? »)                          */
/* -------------------------------------------------------------------------- */

export type ProcessStep = { title: string; description: string }

export const SPIRIT_PROCESS_STEPS: ProcessStep[] = [
  { title: "Choisissez votre prestation", description: "Sélectionnez le service adapté à votre véhicule." },
  {
    title: "Précisez votre demande",
    description: "Indiquez votre véhicule, vos besoins et les informations utiles.",
  },
  {
    title: "Choisissez vos disponibilités",
    description: "Indiquez les créneaux qui vous conviennent.",
  },
  {
    title: "Validation par Spirit ACS",
    description: "Spirit ACS valide votre demande et vous confirme le rendez-vous.",
  },
]

/* -------------------------------------------------------------------------- */
/*  ZONE D'INTERVENTION                                                       */
/* -------------------------------------------------------------------------- */

export const SPIRIT_ZONE_TEXT =
  "Spirit ACS est situé à Lagny-sur-Marne et intervient également, selon la prestation, dans les communes voisines de Seine-et-Marne."

/**
 * Villes voisines confirmées. VIDE par défaut : aucune ville supplémentaire
 * n'est inventée. À compléter uniquement avec des communes réellement
 * confirmées (idéalement depuis les données du tenant, plus tard).
 */
export const SPIRIT_ZONE_CITIES: string[] = []

/* -------------------------------------------------------------------------- */
/*  FAQ (accueil) — le contenu du JSON-LD FAQPage doit être IDENTIQUE          */
/* -------------------------------------------------------------------------- */

export type FaqItem = { question: string; answer: string }

export const SPIRIT_FAQ: FaqItem[] = [
  {
    question: "Quelle différence entre le detailing et un lavage automobile classique ?",
    answer:
      "Le detailing va au-delà du lavage : il s'agit d'un entretien approfondi et méthodique des surfaces intérieures et extérieures, pouvant inclure la correction et la protection de la carrosserie. Un lavage classique se limite au nettoyage de surface.",
  },
  {
    question: "Combien de temps dure une prestation ?",
    answer:
      "La durée dépend de la prestation choisie et de l'état du véhicule. Après analyse de votre demande, Spirit ACS vous indique le déroulement adapté à votre véhicule.",
  },
  {
    question: "Comment obtenir un devis ?",
    answer:
      "Décrivez votre véhicule et la prestation souhaitée via le formulaire de demande de devis. Spirit ACS étudie votre besoin et vous propose une solution adaptée.",
  },
  {
    question: "Le polissage peut-il retirer toutes les rayures ?",
    answer:
      "Le polissage permet de corriger de nombreux défauts légers et d'améliorer la brillance. Les rayures profondes ne peuvent pas toujours être totalement supprimées : une analyse du véhicule est nécessaire pour évaluer le résultat possible.",
  },
  {
    question: "À quoi sert une protection céramique ?",
    answer:
      "Une protection céramique forme une couche protectrice sur la carrosserie afin de faciliter l'entretien du véhicule et de préserver son aspect. Le choix de la protection est adapté au véhicule et à l'usage.",
  },
  {
    question: "Quelle différence entre une protection céramique et un film PPF ?",
    answer:
      "La protection céramique est un traitement appliqué sur la carrosserie pour en faciliter l'entretien. Le film PPF est un film transparent posé sur les surfaces afin de limiter les impacts sur les zones exposées. Les deux approches répondent à des besoins différents et peuvent être conseillées après analyse.",
  },
  {
    question: "Spirit ACS travaille-t-il sur les motos ?",
    answer:
      "Oui, Spirit ACS propose des prestations esthétiques adaptées aux motos, définies selon le véhicule et le résultat recherché.",
  },
  {
    question: "Les prestations peuvent-elles être réalisées à domicile ?",
    answer:
      "Selon la nature de la prestation, l'intervention peut être réalisée à l'atelier ou à domicile. La solution adaptée est proposée après étude de votre demande.",
  },
  {
    question: "Peut-on préparer un véhicule avant sa vente ?",
    answer:
      "Oui, une remise en état esthétique peut être réalisée pour préparer un véhicule avant sa vente. La prestation est adaptée à l'état du véhicule après analyse.",
  },
  {
    question: "Proposez-vous des prestations pour les véhicules professionnels ?",
    answer:
      "Oui, Spirit ACS accompagne aussi bien les particuliers que les professionnels. La prestation est définie selon le véhicule et le besoin.",
  },
]

/* -------------------------------------------------------------------------- */
/*  PRESTATIONS — cartes accueil + pages dédiées                              */
/* -------------------------------------------------------------------------- */

/**
 * Nature d'un tarif affiché sur une page prestation.
 *   - `exact` → prix ferme confirmé (ex. formule Gtechniq bicouche 5 ans).
 *   - `from`  → « dès X » (point d'entrée, le total dépend du véhicule).
 *   - `quote` → sur devis (aucun montant : PPF et prestations analysées au cas
 *               par cas). JAMAIS de faux total lorsqu'une partie est sur devis.
 */
export type PriceKind = "exact" | "from" | "quote"

/**
 * Formule tarifaire RÉELLEMENT confirmée par Spirit ACS. Aucun prix n'est
 * inventé : `priceCents` n'est renseigné que pour un montant validé.
 */
export type ServiceFormula = {
  label: string
  /** Montant en CENTIMES (absent si `priceKind === "quote"`). */
  priceCents?: number
  priceKind: PriceKind
  /** Précision courte et factuelle (optionnelle). */
  note?: string
}

/** Modes de conversion connus (cf. lib/public-site/types.ts). Copié localement
 *  en union de chaînes pour éviter tout couplage du contenu à la couche
 *  publique ; les valeurs sont strictement identiques. */
export type SpiritConversionMode = "quote_request" | "booking" | "booking_deposit" | "booking_full"

export type ServiceContent = {
  /** Segment d'URL sous /prestations (ex. « nettoyage-automobile »). */
  slug: string
  /** Nom court affiché sur la carte d'accueil. */
  cardTitle: string
  /**
   * Accroche TRÈS courte affichée sous le titre de la carte d'accueil (grille
   * « Nos prestations »). Distincte de `cardTitle`/`cardText` : c'est le libellé
   * commercial bref de la vitrine. Source éditoriale unique (consommée via le
   * `PublicSiteCatalog`, plus aucune liste en dur dans le composant).
   */
  cardTagline: string
  /** Texte court sous la carte d'accueil. */
  cardText: string
  /** Image illustrative réelle du dépôt (ou null → pas d'image). */
  image: string | null
  /** Texte alternatif descriptif de l'image (jamais bourré de mots-clés). */
  imageAlt: string | null

  /* --- Contenu de la page dédiée --- */
  /** Titre de la balise <title> (unique). */
  metaTitle: string
  /** Meta description (unique). */
  metaDescription: string
  /** H1 unique de la page. */
  h1: string
  /** Libellé court du fil d'Ariane. */
  breadcrumbLabel: string
  /** Introduction utile (1-2 paragraphes). */
  intro: string[]
  /** Bénéfices de la prestation. */
  benefits: string[]
  /** Déroulement général (étapes). */
  steps: string[]
  /** Véhicules concernés. */
  vehicles: string[]
  /** FAQ spécifique à la prestation. */
  faq: FaqItem[]

  /* --- Tarifs (jamais inventés) --- */
  /**
   * Nature globale de la tarification. Par défaut « quote » (sur devis) :
   * conforme au modèle Spirit ACS (analyse → proposition). Ne passe à
   * `exact`/`from` que si des `formules` confirmées existent.
   */
  priceKind: PriceKind
  /** Formules tarifaires confirmées (sinon la page affiche « Sur devis »). */
  formules?: ServiceFormula[]
  /**
   * Précision courte affichée sous la grille tarifaire (ex. « Le niveau exact
   * est déterminé après examen du véhicule »). Jamais un total inventé.
   */
  priceCaveat?: string

  /* --- Conversion & CTA (préparation Phase 5) --- */
  /**
   * Mode de conversion PAR PAGE. Spirit n'utilise aujourd'hui que
   * `quote_request` ; ce champ permet d'en changer une seule sans toucher au
   * provider (cf. cahier des charges §19). Optionnel → défaut `quote_request`.
   */
  conversionMode?: SpiritConversionMode
  /** Libellé du CTA contextualisé (repli : « Demander un devis »). */
  ctaLabel?: string

  /* --- Maillage interne --- */
  /**
   * Prestations complémentaires (slugs) mises en avant en bas de page. Repli :
   * les 3 premières autres prestations. Améliore la pertinence du maillage et
   * évite l'effet « pages clones ».
   */
  related?: string[]
}

/**
 * Les 6 prestations demandées. Les 4 premières correspondent aux cartes
 * visuelles de l'accueil ; « renovation-phares » complète l'ensemble des pages
 * SEO dédiées demandées.
 */
export const SPIRIT_SERVICES: ServiceContent[] = [
  {
    slug: "nettoyage-automobile",
    cardTitle: "Nettoyage intérieur et extérieur",
    cardTagline: "Intérieur et extérieur nettoyés en profondeur.",
    cardText:
      "Nettoyage soigné de l'habitacle et de l'extérieur du véhicule : surfaces, textiles, plastiques, vitres, carrosserie, jantes et finitions.",
    image: "/custom-sites/spirit-acs/nettoyage-interieur-cuir.jpg",
    imageAlt: "Habitacle cuir nettoyé et soigné par Spirit ACS",
    metaTitle: "Nettoyage automobile à Lagny-sur-Marne | Spirit ACS",
    metaDescription:
      "Nettoyage automobile intérieur et extérieur par Spirit ACS à Lagny-sur-Marne : habitacle, textiles, plastiques, vitres, carrosserie, jantes et finitions.",
    h1: "Nettoyage automobile intérieur et extérieur",
    breadcrumbLabel: "Nettoyage automobile",
    intro: [
      "Le nettoyage automobile de Spirit ACS traite l'habitacle et l'extérieur du véhicule de façon méthodique. L'objectif est de retrouver des surfaces propres et soignées, en adaptant le soin à l'état du véhicule.",
      "Chaque étape est ajustée après observation du véhicule, qu'il s'agisse d'un entretien régulier ou d'un nettoyage plus approfondi.",
    ],
    benefits: [
      "Habitacle assaini : textiles, plastiques, vitres et finitions.",
      "Extérieur nettoyé : carrosserie, jantes et détails.",
      "Rendu soigné adapté à l'état du véhicule.",
    ],
    steps: [
      "Observation du véhicule et des zones à traiter.",
      "Nettoyage intérieur : surfaces, textiles et plastiques.",
      "Nettoyage extérieur : carrosserie, vitres et jantes.",
      "Contrôle des finitions avant restitution.",
    ],
    vehicles: ["Citadines et berlines", "SUV et monospaces", "Véhicules professionnels"],
    priceKind: "quote",
    ctaLabel: "Réserver cette prestation",
    related: ["polissage-automobile", "protection-ceramique", "renovation-phares"],
    faq: [
      {
        question: "Le nettoyage inclut-il l'intérieur et l'extérieur ?",
        answer:
          "Le nettoyage peut couvrir l'habitacle comme l'extérieur. Le périmètre exact est défini avec vous selon votre besoin et l'état du véhicule.",
      },
      {
        question: "Combien de temps prévoir ?",
        answer:
          "La durée dépend de l'état du véhicule et du périmètre choisi. Elle vous est précisée après étude de votre demande.",
      },
    ],
  },
  {
    slug: "polissage-automobile",
    cardTitle: "Polissage & protection céramique",
    cardTagline: "Correction des défauts, restauration de la brillance et protection durable.",
    cardText:
      "Correction des défauts légers de la carrosserie, amélioration de la brillance et application d'une protection adaptée pour faciliter l'entretien du véhicule.",
    image: "/custom-sites/spirit-acs/polissage-porsche-911.jpg",
    imageAlt: "Porsche 911 noire à la carrosserie brillante après polissage par Spirit ACS",
    metaTitle: "Polissage carrosserie à Lagny-sur-Marne | Spirit ACS",
    metaDescription:
      "Polissage de carrosserie par Spirit ACS à Lagny-sur-Marne : correction des défauts légers, gain de brillance et protection adaptée pour un entretien facilité.",
    h1: "Polissage de carrosserie",
    breadcrumbLabel: "Polissage automobile",
    intro: [
      "Le polissage vise à corriger les défauts légers de la carrosserie et à raviver la brillance. Il prépare également la surface à l'application d'une protection adaptée.",
      "L'intensité de la correction est déterminée après analyse de la peinture et de son état.",
    ],
    benefits: [
      "Réduction des défauts légers et des micro-rayures.",
      "Gain de brillance et d'uniformité.",
      "Surface préparée pour une protection durable.",
    ],
    steps: [
      "Analyse de la peinture et des défauts.",
      "Préparation et décontamination de la carrosserie.",
      "Polissage adapté au niveau de correction possible.",
      "Application éventuelle d'une protection.",
    ],
    vehicles: ["Véhicules du quotidien", "Véhicules de collection ou soignés", "Véhicules avant revente"],
    priceKind: "from",
    formules: [
      {
        label: "Polissage niveau 1 — éclat",
        priceCents: 29900,
        priceKind: "from",
        note: "Citadine 299 € · Berline 349 € · SUV 399 €. Inclut notamment un sealant (~2 mois) offert.",
      },
      {
        label: "Polissage niveau 2 — correction en deux étapes",
        priceCents: 39900,
        priceKind: "from",
        note: "Citadine 399 € · Berline 449 € · SUV 499 €.",
      },
      {
        label: "Polissage niveau 3 — correction en trois étapes",
        priceCents: 49900,
        priceKind: "from",
        note: "Citadine 499 € · Berline 549 € · SUV 599 €.",
      },
    ],
    priceCaveat:
      "Le niveau de polissage adapté à votre véhicule est déterminé par Spirit ACS après examen de la carrosserie.",
    ctaLabel: "Réserver cette prestation",
    related: ["protection-ceramique", "nettoyage-automobile", "protection-ppf"],
    faq: [
      {
        question: "Le polissage retire-t-il toutes les rayures ?",
        answer:
          "Il corrige de nombreux défauts légers, mais les rayures profondes ne peuvent pas toujours être totalement effacées. Une analyse préalable permet d'évaluer le résultat possible.",
      },
      {
        question: "Comment est déterminé le niveau de correction ?",
        answer:
          "Le niveau de correction n'est pas décidé à l'avance : Spirit ACS examine l'état réel de la carrosserie afin d'adapter le polissage au résultat possible sans sur-solliciter le vernis.",
      },
    ],
  },
  {
    slug: "protection-ceramique",
    cardTitle: "Protection céramique",
    cardTagline: "Protection durable et entretien facilité",
    cardText:
      "Application d'une protection adaptée à la carrosserie pour faciliter l'entretien du véhicule et préserver son aspect au fil du temps.",
    image: "/custom-sites/spirit-acs/ceramique-bmw-m4.jpg",
    imageAlt: "BMW M4 verte à la carrosserie protégée et brillante par Spirit ACS",
    metaTitle: "Protection céramique à Lagny-sur-Marne | Spirit ACS",
    metaDescription:
      "Protection céramique par Spirit ACS à Lagny-sur-Marne : une protection adaptée à la carrosserie pour faciliter l'entretien et préserver l'aspect du véhicule.",
    h1: "Protection céramique",
    breadcrumbLabel: "Protection céramique",
    intro: [
      "La protection céramique forme une couche protectrice sur la carrosserie afin de faciliter l'entretien du véhicule et de préserver son aspect.",
      "Le choix et la mise en œuvre de la protection sont adaptés au véhicule et à son usage, après préparation de la surface.",
    ],
    benefits: [
      "Entretien du véhicule facilité au quotidien.",
      "Aspect de la carrosserie préservé.",
      "Surface protégée après préparation soignée.",
    ],
    steps: [
      "Analyse de la carrosserie.",
      "Préparation et correction éventuelle de la surface.",
      "Application de la protection adaptée.",
      "Contrôle final du rendu.",
    ],
    vehicles: ["Véhicules récents", "Véhicules soignés", "Véhicules après polissage"],
    priceKind: "from",
    formules: [
      {
        label: "Cire (~9 à 12 mois)",
        priceCents: 12000,
        priceKind: "exact",
      },
      {
        label: "Céramique CarPro CQ.UK 3.0 (~2 ans)",
        priceCents: 17000,
        priceKind: "exact",
      },
      {
        label: "Céramique Gyeon (~36 mois)",
        priceCents: 30000,
        priceKind: "exact",
      },
      {
        label: "Céramique Gtechniq — bicouche, garantie ~5 ans",
        priceCents: 35000,
        priceKind: "exact",
      },
      {
        label: "Céramique surfaces vitrées",
        priceCents: 9000,
        priceKind: "exact",
      },
      {
        label: "Céramique jantes 1 an",
        priceKind: "quote",
      },
    ],
    priceCaveat:
      "La protection la mieux adaptée dépend de l'état de la carrosserie et de l'usage du véhicule ; elle est confirmée après analyse.",
    ctaLabel: "Réserver cette prestation",
    related: ["polissage-automobile", "protection-ppf", "nettoyage-automobile"],
    faq: [
      {
        question: "La protection céramique dure-t-elle dans le temps ?",
        answer:
          "Sa tenue dépend du produit adapté au v��hicule, de l'usage et de l'entretien. Ces éléments sont précisés lors de l'étude de votre demande.",
      },
    ],
  },
  {
    slug: "protection-ppf",
    cardTitle: "PPF & personnalisation",
    cardTagline: "Protection de carrosserie et personnalisation sur mesure.",
    cardText:
      "Pose d'un film de protection transparent sur les zones sensibles du véhicule afin de limiter les impacts et préserver les surfaces exposées.",
    image: "/custom-sites/spirit-acs/ppf-porsche-911.jpg",
    imageAlt: "Avant de Porsche 911 aux surfaces exposées préservées",
    metaTitle: "Protection PPF à Lagny-sur-Marne | Spirit ACS",
    metaDescription:
      "Pose de film de protection PPF par Spirit ACS à Lagny-sur-Marne : protection transparente des zones sensibles pour limiter les impacts sur les surfaces exposées.",
    h1: "Protection PPF (film de protection)",
    breadcrumbLabel: "Protection PPF",
    intro: [
      "Le film de protection PPF est un film transparent posé sur les zones sensibles du véhicule pour limiter les impacts et préserver les surfaces exposées.",
      "Les zones à protéger sont définies selon le véhicule et l'usage, après analyse.",
    ],
    benefits: [
      "Protection transparente des zones exposées.",
      "Limitation des impacts sur les surfaces sensibles.",
      "Pose adaptée au véhicule.",
    ],
    steps: [
      "Analyse du véhicule et des zones à protéger.",
      "Préparation des surfaces.",
      "Pose du film transparent.",
      "Contrôle final de la pose.",
    ],
    vehicles: ["Véhicules neufs ou récents", "Zones exposées (avant, arêtes, seuils)", "Véhicules soignés"],
    priceKind: "quote",
    ctaLabel: "Réserver cette prestation",
    related: ["protection-ceramique", "polissage-automobile", "nettoyage-automobile"],
    faq: [
      {
        question: "Le film PPF est-il visible ?",
        answer:
          "Le film est transparent et destiné à se faire discret. Le périmètre de pose est défini avec vous selon les zones à protéger.",
      },
      {
        question: "Comment est établi le tarif d'une pose PPF ?",
        answer:
          "La pose PPF est réalisée sur devis : le tarif dépend des zones à protéger et du véhicule, définis après analyse.",
      },
    ],
  },
  {
    slug: "renovation-phares",
    cardTitle: "Rénovation de phares",
    cardTagline: "Restauration de la clarté des optiques",
    cardText:
      "Rénovation des optiques ternies pour améliorer leur clarté et l'aspect général de l'avant du véhicule.",
    image: "/custom-sites/spirit-acs/renovation-phares-apres.jpg",
    imageAlt: "Optique de phare rénovée et de nouveau claire par Spirit ACS",
    metaTitle: "Rénovation de phares à Lagny-sur-Marne | Spirit ACS",
    metaDescription:
      "Rénovation d'optiques ternies par Spirit ACS à Lagny-sur-Marne : amélioration de la clarté des phares et de l'aspect général de l'avant du véhicule.",
    h1: "Rénovation d'optiques de phares",
    breadcrumbLabel: "Rénovation de phares",
    intro: [
      "Avec le temps, les optiques de phares peuvent se ternir. La rénovation vise à améliorer leur clarté et l'aspect général de l'avant du véhicule.",
      "L'intervention est adaptée à l'état des optiques, évalué au préalable.",
    ],
    benefits: [
      "Optiques plus claires.",
      "Aspect de l'avant du véhicule amélioré.",
      "Intervention adaptée à l'état des phares.",
    ],
    steps: [
      "Évaluation de l'état des optiques.",
      "Préparation des surfaces.",
      "Rénovation des optiques.",
      "Contrôle du rendu.",
    ],
    vehicles: ["Véhicules aux optiques ternies", "Véhicules avant revente", "Véhicules du quotidien"],
    priceKind: "from",
    formules: [
      {
        label: "Rénovation de phares",
        priceCents: 8000,
        priceKind: "from",
      },
    ],
    priceCaveat:
      "Le tarif final dépend de l'état initial des optiques, évalué avant l'intervention.",
    ctaLabel: "Réserver cette prestation",
    related: ["polissage-automobile", "nettoyage-automobile", "protection-ceramique"],
    faq: [
      {
        question: "La rénovation des phares est-elle définitive ?",
        answer:
          "Le résultat dépend de l'état initial des optiques et de leur exposition. Une évaluation préalable permet d'estimer le résultat possible.",
      },
    ],
  },
  {
    slug: "detailing-moto",
    cardTitle: "Moto",
    cardTagline: "Entretien esthétique et personnalisation deux-roues",
    cardText:
      "Prestations esthétiques adaptées aux motos et interventions de personnalisation selon le véhicule et le résultat recherché.",
    image: "/custom-sites/spirit-acs/detailing-moto-kymco.jpg",
    imageAlt: "Scooter trois-roues Kymco entretenu par Spirit ACS",
    metaTitle: "Detailing moto à Lagny-sur-Marne | Spirit ACS",
    metaDescription:
      "Detailing moto par Spirit ACS à Lagny-sur-Marne : prestations esthétiques adaptées aux motos et personnalisation selon le véhicule et le résultat recherché.",
    h1: "Detailing et personnalisation moto",
    breadcrumbLabel: "Detailing moto",
    intro: [
      "Spirit ACS propose des prestations esthétiques adaptées aux motos, du nettoyage soigné aux interventions de personnalisation.",
      "Chaque intervention est définie selon la moto et le résultat recherché, après analyse.",
    ],
    benefits: [
      "Prestations adaptées aux motos.",
      "Personnalisation selon le véhicule.",
      "Soin défini après analyse.",
    ],
    steps: [
      "Observation de la moto et du besoin.",
      "Proposition adaptée.",
      "Réalisation de la prestation.",
      "Contrôle final.",
    ],
    vehicles: ["Motos routières", "Motos soignées ou de collection", "Deux-roues avant revente"],
    priceKind: "from",
    formules: [
      {
        label: "Nettoyage moto",
        priceCents: 5000,
        priceKind: "from",
        note: "Options : cire carrosserie (~3 mois) 30 € · cire (~1 an) 45 € · rénovation plastique / céramique (~2 ans) 20 € · céramique visière casque (~1 an) 20 €.",
      },
      {
        label: "Polissage moto",
        priceCents: 15000,
        priceKind: "from",
        note: "Sur devis selon l'état de la carrosserie.",
      },
      {
        label: "Cire / céramique carrosserie (1 à 5 ans)",
        priceCents: 7000,
        priceKind: "from",
        note: "Sur devis selon la protection retenue.",
      },
      {
        label: "Céramique plastique",
        priceCents: 3000,
        priceKind: "from",
      },
      {
        label: "Protection sellerie",
        priceCents: 4000,
        priceKind: "from",
      },
      {
        label: "PPF moto",
        priceKind: "quote",
      },
    ],
    priceCaveat:
      "Les prestations moto sont ajustées à la moto et au résultat recherché ; le tarif final est confirmé après analyse.",
    ctaLabel: "Réserver cette prestation",
    related: ["nettoyage-automobile", "polissage-automobile", "protection-ceramique"],
    faq: [
      {
        question: "Proposez-vous de la personnalisation moto ?",
        answer:
          "Oui, des interventions de personnalisation sont possibles selon la moto et le résultat souhaité, définies après analyse.",
      },
    ],
  },
]

/** Retrouve une prestation par son slug d'URL. */
export function getSpiritService(slug: string): ServiceContent | undefined {
  return SPIRIT_SERVICES.find((s) => s.slug === slug)
}

/** Slugs de toutes les prestations (pour generateStaticParams / sitemap). */
export function spiritServiceSlugs(): string[] {
  return SPIRIT_SERVICES.map((s) => s.slug)
}
