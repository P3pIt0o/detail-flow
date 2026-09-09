/**
 * CONTENU ÉDITORIAL du site Rozan Cleaning Services (Phase 2 — mockups).
 *
 * Fichier PUR (aucune dépendance serveur / DB) : importable par des composants
 * serveur comme client. Il rassemble TOUT le contenu propre à Rozan afin
 * qu'aucune donnée ne soit codée en dur dans les composants de rendu.
 *
 * Les images sont des VISUELS PREMIUM DE PLACEHOLDER, remplaçables par les
 * vraies photos Rozan (via l'admin en Phase 4) : il suffira de changer les
 * chemins `image` / `before` / `after` ci-dessous, sans retoucher les
 * composants. Les ancres de section vivent dans `tokens.ts` (source unique).
 *
 * Règle : aucune donnée « factuelle » inventée. Coordonnées et preuve sociale
 * proviennent du site actuel de Rozan (audit) ; en production ces valeurs
 * seront résolues dynamiquement pour ne jamais devenir obsolètes.
 */

export type RozanServiceSlug =
  | "nettoyage-voiture"
  | "nettoyage-canape"
  | "nettoyage-matelas"
  | "nettoyage-tapis-moquette"
  | "nettoyage-airbnb"
  | "nettoyage-terrasse"

export const ROZAN_BRAND = {
  name: "Rozan Cleaning Services",
  shortName: "Rozan",
  tagline: "La propreté de votre intérieur, directement chez vous.",
  email: "rozancleaningservices@gmail.com",
  /** Affichage humain (national FR). */
  phone: "07 87 95 77 52",
  /** Format international pour les liens tel: (jamais recomposé à la main). */
  phoneRaw: "+33787957752",
  regionLabel: "Pays de Gex · Genève",
  socials: {
    facebook: "https://facebook.com",
    instagram: "https://instagram.com",
    tiktok: "https://tiktok.com",
  },
} as const

/**
 * Preuve sociale Google. En Phase 4, `rating`/`count` seront résolus
 * dynamiquement via le Place ID du tenant (module `lib/reviews`). Valeurs
 * d'audit du site actuel utilisées ici comme repli d'affichage.
 */
export const ROZAN_GOOGLE = {
  rating: 5.0,
  count: 56,
  vehiclesCleaned: 180,
  url: "https://www.google.com/maps",
} as const

export type RozanService = {
  slug: RozanServiceSlug
  /** Libellé court affiché sur la carte (« Voiture »). */
  label: string
  /** Titre complet orienté SEO/conversion. */
  title: string
  /** Accroche très courte pour la carte. */
  teaser: string
  /** Visuel premium (placeholder remplaçable par la vraie photo Rozan). */
  image: string
  alt: string
  /** Intitulé du cliché attendu, affiché dans l'emplacement photo `RozanShot`. */
  shot: string
  /** Activable/désactivable depuis l'admin en Phase 4. */
  active: boolean
}

export const ROZAN_SERVICES: RozanService[] = [
  {
    slug: "nettoyage-voiture",
    label: "Voiture",
    title: "Nettoyage de voiture à domicile",
    teaser: "Intérieur, extérieur ou complet — vapeur, sièges et textiles.",
    image: "/custom-sites/rozan/service-voiture.png",
    alt: "Nettoyage intérieur de voiture premium à domicile",
    shot: "Intérieur de voiture fraîchement nettoyé",
    active: true,
  },
  {
    slug: "nettoyage-canape",
    label: "Canapé",
    title: "Nettoyage de canapé à domicile",
    teaser: "Injection-extraction en profondeur, taches et odeurs.",
    image: "/custom-sites/rozan/service-canape.png",
    alt: "Nettoyage de canapé en tissu à domicile",
    shot: "Canapé en tissu nettoyé en profondeur",
    active: true,
  },
  {
    slug: "nettoyage-matelas",
    label: "Matelas",
    title: "Nettoyage de matelas à domicile",
    teaser: "Assainissement, acariens, traces et fraîcheur retrouvée.",
    image: "/custom-sites/rozan/service-matelas.png",
    alt: "Nettoyage et assainissement de matelas",
    shot: "Matelas propre et assaini",
    active: true,
  },
  {
    slug: "nettoyage-tapis-moquette",
    label: "Tapis & moquettes",
    title: "Nettoyage de tapis et moquettes",
    teaser: "Fibres ravivées, taches incrustées et poussières éliminées.",
    image: "/custom-sites/rozan/service-tapis.png",
    alt: "Nettoyage de tapis et moquettes",
    shot: "Tapis aux fibres ravivées",
    active: true,
  },
  {
    slug: "nettoyage-airbnb",
    label: "Airbnb",
    title: "Nettoyage Airbnb & locations saisonnières",
    teaser: "Remise à neuf entre deux séjours, prête à accueillir.",
    image: "/custom-sites/rozan/service-airbnb.png",
    alt: "Remise en état de location saisonnière Airbnb",
    shot: "Logement Airbnb remis à neuf",
    active: true,
  },
  {
    slug: "nettoyage-terrasse",
    label: "Terrasse",
    title: "Nettoyage de terrasse",
    teaser: "Dalles, bois et pierre débarrassés des salissures.",
    image: "/custom-sites/rozan/service-terrasse.png",
    alt: "Nettoyage de terrasse au nettoyeur haute pression",
    shot: "Terrasse nettoyée au jet haute pression",
    active: true,
  },
]

export function getRozanService(slug: string): RozanService | null {
  return ROZAN_SERVICES.find((s) => s.slug === slug && s.active) ?? null
}

/** Comparateur Avant/Après (réalisation Rozan). */
export type RozanBeforeAfter = {
  id: string
  /** Sujet court du cliché, réutilisé pour les emplacements « avant » / « après ». */
  shot: string
  before: string
  after: string
  beforeAlt: string
  afterAlt: string
  /** Légende factuelle : prestation — ville. */
  caption: string
}

export const ROZAN_BEFORE_AFTER: RozanBeforeAfter[] = [
  {
    id: "canape",
    shot: "Canapé",
    before: "/custom-sites/rozan/ba-canape-avant.png",
    after: "/custom-sites/rozan/ba-canape-apres.png",
    beforeAlt: "Canapé taché avant nettoyage",
    afterAlt: "Canapé propre après nettoyage Rozan",
    caption: "Nettoyage canapé — Divonne-les-Bains",
  },
  {
    id: "voiture",
    shot: "Intérieur auto",
    before: "/custom-sites/rozan/ba-voiture-avant.png",
    after: "/custom-sites/rozan/ba-voiture-apres.png",
    beforeAlt: "Siège de voiture sale avant nettoyage",
    afterAlt: "Siège de voiture propre après nettoyage Rozan",
    caption: "Nettoyage intérieur auto — Ferney-Voltaire",
  },
  {
    id: "matelas",
    shot: "Matelas",
    before: "/custom-sites/rozan/ba-matelas-avant.png",
    after: "/custom-sites/rozan/ba-matelas-apres.png",
    beforeAlt: "Matelas taché avant nettoyage",
    afterAlt: "Matelas propre après nettoyage Rozan",
    caption: "Nettoyage matelas — Genève",
  },
]

/** Argument différenciant (section « Pourquoi Rozan »). */
export const ROZAN_WHY: { title: string; text: string }[] = [
  {
    title: "Nous venons jusqu'à vous",
    text: "Nous intervenons directement à votre domicile, sans que vous ayez à vous déplacer.",
  },
  {
    title: "Autonomes en eau & électricité",
    text: "Notre équipement embarque sa propre eau et sa propre énergie. Aucune contrainte pour vous.",
  },
  {
    title: "Équipement professionnel",
    text: "Injection-extraction, vapeur et produits adaptés à chaque matière, pour un résultat en profondeur.",
  },
  {
    title: "Des clients satisfaits",
    text: "Une note parfaite et des dizaines d'avis Google : la propreté qui inspire confiance.",
  },
]

/** Les 3 étapes (section « Comment ça marche »). */
export const ROZAN_PROCESS: { step: string; title: string; text: string }[] = [
  {
    step: "01",
    title: "Choisissez votre prestation",
    text: "Voiture, canapé, matelas, textiles ou location : dites-nous ce que vous voulez nettoyer.",
  },
  {
    step: "02",
    title: "Envoyez votre demande",
    text: "Quelques informations, des photos si vous le souhaitez, et c'est envoyé.",
  },
  {
    step: "03",
    title: "Rozan intervient chez vous",
    text: "Nous venons à la date convenue, autonomes en eau et en électricité.",
  },
]

/** Zones d'intervention réelles (deux ensembles). */
export const ROZAN_ZONES = {
  france: {
    label: "Pays de Gex",
    cities: [
      "Gex",
      "Cessy",
      "Divonne-les-Bains",
      "Ferney-Voltaire",
      "Saint-Genis-Pouilly",
      "Prévessin-Moëns",
      "Ségny",
      "Ornex",
      "Thoiry",
    ],
  },
  suisse: {
    label: "Suisse",
    cities: ["Genève", "Carouge", "Grand-Saconnex", "Versoix", "Nyon"],
  },
} as const

export const ROZAN_FAQ: { q: string; a: string }[] = [
  {
    q: "Vous déplacez-vous à domicile ?",
    a: "Oui, c'est le cœur de notre service. Nous venons directement chez vous, sur votre place de parking, dans votre garage ou devant votre logement, dans tout le Pays de Gex et le canton de Genève.",
  },
  {
    q: "Dois-je fournir de l'eau ou de l'électricité ?",
    a: "Non. Nous sommes totalement autonomes en eau et en électricité. Vous n'avez strictement rien à préparer : nous arrivons avec tout le nécessaire.",
  },
  {
    q: "Combien de temps dure une intervention ?",
    a: "Cela dépend de la prestation : un nettoyage intérieur de voiture prend en général 1 à 2 heures, un canapé ou un matelas de 1 à 3 heures selon l'état et la taille. Nous vous donnons une estimation précise lors du devis.",
  },
  {
    q: "Quels véhicules pouvez-vous nettoyer ?",
    a: "Citadines, berlines, SUV, utilitaires, monospaces… Nous adaptons notre méthode et nos produits à chaque type de véhicule et de matière.",
  },
  {
    q: "Pouvez-vous retirer toutes les taches ?",
    a: "Nous obtenons d'excellents résultats sur la grande majorité des taches et odeurs. Certaines taches très anciennes ou ayant altéré la fibre peuvent rester légèrement visibles : nous sommes toujours transparents sur le résultat attendu avant d'intervenir.",
  },
  {
    q: "Intervenez-vous en Suisse ?",
    a: "Oui, nous intervenons à Genève, Carouge, Grand-Saconnex, Versoix, Nyon et les communes environnantes réellement desservies.",
  },
  {
    q: "Comment obtenir un devis ?",
    a: "Le plus simple est de remplir notre demande en ligne en quelques étapes. Vous choisissez la prestation, décrivez votre besoin, ajoutez éventuellement des photos et nous vous répondons rapidement.",
  },
  {
    q: "Puis-je envoyer des photos ?",
    a: "Oui, et c'est fortement recommandé. Des photos de votre véhicule, canapé ou matelas nous permettent d'évaluer précisément le travail et de vous proposer un devis juste, directement depuis votre smartphone.",
  },
]

/**
 * Avis affichés en Phase 2 pour la mise en page. En Phase 4, ils proviendront
 * des vrais avis Google du tenant (module `lib/reviews`). Le premier avis est
 * un témoignage réel figurant sur le site actuel de Rozan.
 */
export type RozanReview = { name: string; rating: number; text: string; context?: string; city?: string }

export const ROZAN_REVIEWS: RozanReview[] = [
  {
    name: "Marie Dupont",
    rating: 5,
    text: "Un service exceptionnel ! Rozan Cleaning Services a redonné vie à mon canapé et ma voiture. Je recommande vivement leurs techniques avancées et leur matériel de pointe.",
    context: "Canapé & voiture",
    city: "Divonne-les-Bains",
  },
  {
    name: "Thomas B.",
    rating: 5,
    text: "Ponctuel, autonome et très professionnel. Ma voiture était comme neuve à l'intérieur, sans que j'aie à me déplacer.",
    context: "Nettoyage voiture",
    city: "Ferney-Voltaire",
  },
  {
    name: "Sophie L.",
    rating: 5,
    text: "Intervention à domicile impeccable pour un matelas. Résultat bluffant et une vraie odeur de propre. Merci !",
    context: "Nettoyage matelas",
    city: "Genève",
  },
  {
    name: "Karim A.",
    rating: 5,
    text: "Résultat surprenant sur un vieux tapis que je pensais bon à jeter. Contact facile et devis clair.",
    context: "Nettoyage tapis",
    city: "Saint-Genis-Pouilly",
  },
]

/* ------------------------------------------------------------------ */
/* PAGES SERVICE (SEO + conversion)                                    */
/* ------------------------------------------------------------------ */

export type RozanServicePageContent = {
  slug: RozanServiceSlug
  metaTitle: string
  metaDescription: string
  kicker: string
  h1: string
  heroSubtitle: string
  image: string
  imageAlt: string
  problems: string[]
  method: { title: string; text: string }[]
  benefits: string[]
  faq: { q: string; a: string }[]
}

export const ROZAN_SERVICE_PAGES: Partial<Record<RozanServiceSlug, RozanServicePageContent>> = {
  "nettoyage-canape": {
    slug: "nettoyage-canape",
    metaTitle: "Nettoyage de canapé à domicile — Pays de Gex & Genève | Rozan",
    metaDescription:
      "Nettoyage de canapé en profondeur à domicile dans le Pays de Gex et à Genève. Injection-extraction, taches et odeurs, autonome en eau et électricité. Devis rapide.",
    kicker: "Canapés & textiles d'ameublement",
    h1: "Nettoyage de canapé à domicile",
    heroSubtitle:
      "Redonnez à votre canapé sa fraîcheur d'origine. Injection-extraction en profondeur, directement chez vous, sans contrainte d'eau ni d'électricité.",
    image: "/custom-sites/rozan/service-canape.png",
    imageAlt: "Nettoyage professionnel d'un canapé en tissu à domicile",
    problems: [
      "Taches incrustées (nourriture, boissons, encre)",
      "Odeurs tenaces et fumée",
      "Auréoles et traces d'usure",
      "Poussières et allergènes en profondeur",
      "Tissu terni qui a perdu sa couleur",
    ],
    method: [
      { title: "Diagnostic de la matière", text: "Nous identifions le type de tissu (coton, velours, microfibre, alcantara) pour choisir les produits adaptés." },
      { title: "Prétraitement des taches", text: "Chaque tache est traitée individuellement avant le nettoyage global." },
      { title: "Injection-extraction", text: "L'eau et le détergent sont injectés puis immédiatement ré-aspirés, entraînant la saleté en profondeur." },
      { title: "Séchage optimisé", text: "Nous maximisons l'extraction pour réduire le temps de séchage et éviter les auréoles." },
    ],
    benefits: [
      "Un canapé visiblement plus propre et ravivé",
      "Élimination des odeurs et des allergènes",
      "Intervention à domicile, sans déplacement",
      "Autonomie totale en eau et électricité",
    ],
    faq: [
      { q: "Combien de temps sèche un canapé ?", a: "Généralement 3 à 6 heures selon le tissu et l'aération. Grâce à notre extraction poussée, le séchage est accéléré." },
      { q: "Nettoyez-vous les canapés en cuir ?", a: "Oui, avec un protocole spécifique de nettoyage et de nourrissage du cuir, distinct de l'injection-extraction réservée aux tissus." },
    ],
  },
  "nettoyage-voiture": {
    slug: "nettoyage-voiture",
    metaTitle: "Nettoyage de voiture à domicile — Pays de Gex & Genève | Rozan",
    metaDescription:
      "Nettoyage intérieur, extérieur et complet de votre véhicule à domicile dans le Pays de Gex et à Genève. Sellerie, textiles, vapeur. Autonome en eau et électricité.",
    kicker: "Nettoyage automobile",
    h1: "Nettoyage de voiture à domicile",
    heroSubtitle:
      "Un intérieur et un extérieur impeccables sans quitter votre place de parking. Nous venons à vous, entièrement autonomes en eau et en électricité.",
    image: "/custom-sites/rozan/service-voiture.png",
    imageAlt: "Nettoyage intérieur premium d'une voiture à domicile",
    problems: [
      "Sellerie tachée et textiles encrassés",
      "Poussière et saleté dans les recoins",
      "Odeurs persistantes dans l'habitacle",
      "Plastiques ternis, vitres marquées",
      "Carrosserie sale et sans éclat",
    ],
    method: [
      { title: "Préparation", text: "Aspiration complète et dépoussiérage de l'habitacle." },
      { title: "Sellerie & textiles", text: "Injection-extraction ou nettoyage vapeur selon la matière des sièges et moquettes." },
      { title: "Plastiques & vitres", text: "Nettoyage et rénovation des surfaces intérieures, vitres sans traces." },
      { title: "Extérieur", text: "Lavage soigné de la carrosserie, jantes et détails pour un rendu net." },
    ],
    benefits: [
      "Un habitacle sain et sans odeur",
      "Une carrosserie propre et éclatante",
      "Un service à domicile qui vous fait gagner du temps",
      "Adapté à tous types de véhicules",
    ],
    faq: [
      { q: "Faites-vous l'intérieur seul ?", a: "Oui, vous choisissez : intérieur, extérieur ou complet. Nous adaptons le devis à votre besoin." },
      { q: "Nettoyez-vous les sièges en cuir ?", a: "Oui, avec des produits spécifiques cuir et un soin adapté pour préserver la matière." },
    ],
  },
  "nettoyage-matelas": {
    slug: "nettoyage-matelas",
    metaTitle: "Nettoyage de matelas à domicile — Pays de Gex & Genève | Rozan",
    metaDescription:
      "Nettoyage et assainissement de matelas à domicile dans le Pays de Gex et à Genève. Taches, acariens, fraîcheur. Autonome en eau et électricité. Devis rapide.",
    kicker: "Literie & matelas",
    h1: "Nettoyage de matelas à domicile",
    heroSubtitle:
      "Un matelas sain, c'est un meilleur sommeil. Nous éliminons taches, acariens et odeurs directement chez vous.",
    image: "/custom-sites/rozan/service-matelas.png",
    imageAlt: "Nettoyage et assainissement d'un matelas à domicile",
    problems: ["Taches et auréoles", "Acariens et allergènes", "Odeurs et transpiration", "Matelas terni par le temps"],
    method: [
      { title: "Prétraitement", text: "Traitement ciblé des taches visibles." },
      { title: "Injection-extraction", text: "Nettoyage en profondeur des fibres, avec extraction poussée." },
      { title: "Assainissement", text: "Traitement anti-acariens et neutralisation des odeurs." },
      { title: "Séchage", text: "Extraction maximale pour un séchage rapide." },
    ],
    benefits: ["Un couchage plus sain", "Réduction des allergènes", "Élimination des odeurs", "Intervention à domicile"],
    faq: [
      { q: "Le matelas est-il utilisable le soir même ?", a: "Le plus souvent oui, après quelques heures de séchage et une bonne aération de la pièce." },
      { q: "Traitez-vous les deux faces ?", a: "Nous traitons la face supérieure en priorité ; les deux faces sont possibles selon l'état et l'accès." },
    ],
  },
}

export function rozanServiceSlugs(): RozanServiceSlug[] {
  return ROZAN_SERVICES.filter((s) => s.active).map((s) => s.slug)
}

export function getRozanServicePage(slug: string): RozanServicePageContent | null {
  return (ROZAN_SERVICE_PAGES as Record<string, RozanServicePageContent>)[slug] ?? null
}

/* ------------------------------------------------------------------ */
/* PAGES LOCALES (landing commerciale premium, sans keyword stuffing)  */
/* ------------------------------------------------------------------ */

export type RozanLocalPageContent = {
  slug: string
  serviceSlug: RozanServiceSlug
  city: string
  country: "France" | "Suisse"
  metaTitle: string
  metaDescription: string
  kicker: string
  h1: string
  heroSubtitle: string
  image: string
  imageAlt: string
  /** Paragraphe d'ancrage local réellement utile (pas généré à la chaîne). */
  intro: string
  nearby: string[]
  faq: { q: string; a: string }[]
}

export const ROZAN_LOCAL_PAGES: Record<string, RozanLocalPageContent> = {
  "nettoyage-canape-geneve": {
    slug: "nettoyage-canape-geneve",
    serviceSlug: "nettoyage-canape",
    city: "Genève",
    country: "Suisse",
    metaTitle: "Nettoyage de canapé à Genève à domicile | Rozan Cleaning Services",
    metaDescription:
      "Nettoyage de canapé à domicile à Genève : injection-extraction, taches et odeurs. Service mobile autonome en eau et électricité. Devis rapide.",
    kicker: "Genève · à domicile",
    h1: "Nettoyage de canapé à Genève",
    heroSubtitle:
      "Un canapé comme neuf, sans quitter votre appartement genevois. Nous intervenons à domicile, autonomes en eau et en électricité.",
    image: "/custom-sites/rozan/service-canape.png",
    imageAlt: "Nettoyage de canapé à domicile à Genève",
    intro:
      "À Genève, la vie d'un canapé est intense : passages quotidiens, enfants, animaux, repas sur le pouce. Rozan Cleaning Services intervient directement chez vous, en ville comme dans les communes proches, pour un nettoyage en profondeur par injection-extraction. Aucune contrainte de branchement : nous embarquons notre eau et notre électricité.",
    nearby: ["Carouge", "Grand-Saconnex", "Versoix", "Lancy", "Meyrin"],
    faq: [
      { q: "Intervenez-vous dans tout Genève ?", a: "Oui, à Genève ville et dans les communes environnantes réellement desservies comme Carouge, Grand-Saconnex ou Versoix." },
      { q: "Faut-il un accès à l'eau ?", a: "Non, nous sommes autonomes : idéal pour les appartements en étage sans point d'eau accessible." },
    ],
  },
  "nettoyage-canape-gex": {
    slug: "nettoyage-canape-gex",
    serviceSlug: "nettoyage-canape",
    city: "Gex",
    country: "France",
    metaTitle: "Nettoyage de canapé à Gex à domicile | Rozan Cleaning Services",
    metaDescription:
      "Nettoyage de canapé à domicile à Gex et dans le Pays de Gex : injection-extraction, taches et odeurs. Autonome en eau et électricité. Devis rapide.",
    kicker: "Gex · à domicile",
    h1: "Nettoyage de canapé à Gex",
    heroSubtitle:
      "Votre canapé retrouve son éclat, directement chez vous à Gex. Service mobile, autonome en eau et en électricité.",
    image: "/custom-sites/rozan/service-canape.png",
    imageAlt: "Nettoyage de canapé à domicile à Gex",
    intro:
      "Au cœur du Pays de Gex, entre montagne et frontière, les intérieurs vivent au rythme des familles actives. Rozan Cleaning Services se déplace à Gex et dans les communes voisines pour redonner à votre canapé toute sa fraîcheur, sans que vous ayez à le transporter où que ce soit.",
    nearby: ["Cessy", "Ségny", "Ornex", "Divonne-les-Bains", "Ferney-Voltaire"],
    faq: [
      { q: "Vous déplacez-vous jusqu'à Gex sans frais ?", a: "Gex fait partie de notre zone d'intervention principale. Les modalités de déplacement sont précisées dans votre devis." },
      { q: "Combien de temps pour un canapé d'angle ?", a: "Comptez en général 1 h 30 à 2 h 30 selon la taille et l'état du canapé." },
    ],
  },
  "nettoyage-auto-geneve": {
    slug: "nettoyage-auto-geneve",
    serviceSlug: "nettoyage-voiture",
    city: "Genève",
    country: "Suisse",
    metaTitle: "Nettoyage de voiture à Genève à domicile | Rozan Cleaning Services",
    metaDescription:
      "Nettoyage auto à domicile à Genève : intérieur, extérieur, complet. Sellerie, vapeur, textiles. Service mobile autonome en eau et électricité. Devis rapide.",
    kicker: "Genève · à domicile",
    h1: "Nettoyage de voiture à Genève",
    heroSubtitle:
      "Un véhicule impeccable sans bouger de chez vous ou de votre lieu de travail à Genève. Nous venons à vous, en toute autonomie.",
    image: "/custom-sites/rozan/service-voiture.png",
    imageAlt: "Nettoyage intérieur de voiture à domicile à Genève",
    intro:
      "Entre les trajets urbains et les week-ends au grand air, une voiture genevoise encaisse beaucoup. Rozan Cleaning Services intervient à domicile ou sur votre lieu de travail pour un nettoyage intérieur et extérieur soigné, sans que vous ayez à faire la queue dans une station.",
    nearby: ["Carouge", "Grand-Saconnex", "Versoix", "Meyrin", "Lancy"],
    faq: [
      { q: "Pouvez-vous intervenir sur mon lieu de travail ?", a: "Oui, tant que le véhicule est accessible et stationné en sécurité, nous pouvons intervenir à votre domicile comme à votre bureau." },
      { q: "Proposez-vous le nettoyage complet ?", a: "Oui : intérieur, extérieur ou formule complète, selon ce que vous choisissez dans votre demande." },
    ],
  },
}

export function rozanLocalSlugs(): string[] {
  return Object.keys(ROZAN_LOCAL_PAGES)
}

export function getRozanLocalPage(slug: string): RozanLocalPageContent | null {
  return ROZAN_LOCAL_PAGES[slug] ?? null
}
