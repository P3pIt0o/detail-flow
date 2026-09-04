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
  { title: "Votre demande", description: "Décrivez votre véhicule et le résultat recherché." },
  {
    title: "Analyse et proposition",
    description: "Spirit ACS étudie votre besoin et vous propose une prestation adaptée.",
  },
  {
    title: "Réalisation",
    description: "Le véhicule est pris en charge à l'atelier ou à domicile selon la prestation.",
  },
  { title: "Contrôle final", description: "Le résultat est contrôlé avant la restitution du véhicule." },
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

export type ServiceContent = {
  /** Segment d'URL sous /prestations (ex. « nettoyage-automobile »). */
  slug: string
  /** Nom court affiché sur la carte d'accueil. */
  cardTitle: string
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
    cardText:
      "Nettoyage soigné de l'habitacle et de l'extérieur du véhicule : surfaces, textiles, plastiques, vitres, carrosserie, jantes et finitions.",
    image: "/services/interieur-complet.png",
    imageAlt: "Habitacle de voiture nettoyé après une prestation de detailing",
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
    cardTitle: "Polissage et protection céramique",
    cardText:
      "Correction des défauts légers de la carrosserie, amélioration de la brillance et application d'une protection adaptée pour faciliter l'entretien du véhicule.",
    image: "/services/protection-ceramique.png",
    imageAlt: "Carrosserie brillante après polissage et protection",
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
    faq: [
      {
        question: "Le polissage retire-t-il toutes les rayures ?",
        answer:
          "Il corrige de nombreux défauts légers, mais les rayures profondes ne peuvent pas toujours être totalement effacées. Une analyse préalable permet d'évaluer le résultat possible.",
      },
    ],
  },
  {
    slug: "protection-ceramique",
    cardTitle: "Protection céramique",
    cardText:
      "Application d'une protection adaptée à la carrosserie pour faciliter l'entretien du véhicule et préserver son aspect au fil du temps.",
    image: "/services/protection-ceramique.png",
    imageAlt: "Application d'une protection sur la carrosserie d'un véhicule",
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
    faq: [
      {
        question: "La protection céramique dure-t-elle dans le temps ?",
        answer:
          "Sa tenue dépend du produit adapté au véhicule, de l'usage et de l'entretien. Ces éléments sont précisés lors de l'étude de votre demande.",
      },
    ],
  },
  {
    slug: "protection-ppf",
    cardTitle: "Protection PPF",
    cardText:
      "Pose d'un film de protection transparent sur les zones sensibles du véhicule afin de limiter les impacts et préserver les surfaces exposées.",
    image: "/services/renovation-carrosserie.png",
    imageAlt: "Zone de carrosserie protégée par un film transparent",
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
    faq: [
      {
        question: "Le film PPF est-il visible ?",
        answer:
          "Le film est transparent et destiné à se faire discret. Le périmètre de pose est défini avec vous selon les zones à protéger.",
      },
    ],
  },
  {
    slug: "renovation-phares",
    cardTitle: "Rénovation de phares",
    cardText:
      "Rénovation des optiques ternies pour améliorer leur clarté et l'aspect général de l'avant du véhicule.",
    image: "/services/renovation-carrosserie.png",
    imageAlt: "Optique de phare rénovée sur un véhicule",
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
    cardTitle: "Moto et personnalisation",
    cardText:
      "Prestations esthétiques adaptées aux motos et interventions de personnalisation selon le véhicule et le résultat recherché.",
    image: "/custom-sites/spirit-acs/service-moto.png",
    imageAlt: "Moto après une prestation esthétique de detailing",
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
