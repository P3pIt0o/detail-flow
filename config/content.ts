/**
 * ============================================================================
 *  CONTENU ÉDITORIAL & DONNÉES DE DÉMONSTRATION
 * ============================================================================
 *
 *  Ces données alimentent le site vitrine. Leur forme correspond EXACTEMENT
 *  au schéma de base de données (voir prisma/schema.prisma) afin qu'en
 *  Phase 2/3 on puisse les remplacer par des requêtes DB sans changer les
 *  composants d'affichage.
 *
 *  Le professionnel peut modifier librement ces textes, prix et images.
 * ============================================================================
 */

/* -------------------------------------------------------------------------- */
/*  TYPES (alignés sur la future base de données)                            */
/* -------------------------------------------------------------------------- */

export type ServiceCategory = {
  id: string
  name: string
  description: string
}

export type Service = {
  id: string
  categoryId: string
  name: string
  description: string
  /** Chemin de l'image dans /public */
  image: string
  /** Prix « à partir de » en euros */
  priceFrom: number
  /** Durée estimée en minutes */
  durationMin: number
  /** Ordre d'affichage (croissant) */
  order: number
  /** Visible sur le site public ? */
  visible: boolean
  /** Points forts affichés en liste */
  highlights: string[]
  /** Mise en avant (badge « Populaire ») */
  featured?: boolean
}

export type VehicleType = {
  id: string
  name: string
  /** Coefficient appliqué au prix de base (ex: SUV = 1.3) */
  priceMultiplier: number
}

export type ServiceOption = {
  id: string
  name: string
  price: number
}

export type GalleryItem = {
  id: string
  title: string
  category: string
  before: string
  after: string
}

export type Review = {
  id: string
  author: string
  vehicle: string
  rating: number
  text: string
  date: string
}

export type FaqItem = {
  question: string
  answer: string
}

/* -------------------------------------------------------------------------- */
/*  CATÉGORIES DE PRESTATIONS                                                 */
/* -------------------------------------------------------------------------- */

export const categories: ServiceCategory[] = [
  { id: "lavage", name: "Lavage", description: "Nettoyage extérieur et intérieur soigné" },
  { id: "renovation", name: "Rénovation", description: "Polissage, correction et remise à neuf" },
  { id: "protection", name: "Protection", description: "Céramique, cire et traitements longue durée" },
]

/* -------------------------------------------------------------------------- */
/*  TYPES DE VÉHICULES (tarif modulé par coefficient)                        */
/* -------------------------------------------------------------------------- */

export const vehicleTypes: VehicleType[] = [
  { id: "citadine", name: "Citadine", priceMultiplier: 1 },
  { id: "berline", name: "Berline / Break", priceMultiplier: 1.15 },
  { id: "suv", name: "SUV / 4x4", priceMultiplier: 1.3 },
  { id: "utilitaire", name: "Utilitaire", priceMultiplier: 1.5 },
]

/* -------------------------------------------------------------------------- */
/*  OPTIONS COMPLÉMENTAIRES                                                   */
/* -------------------------------------------------------------------------- */

export const serviceOptions: ServiceOption[] = [
  { id: "jantes", name: "Nettoyage jantes en profondeur", price: 25 },
  { id: "coffre", name: "Nettoyage coffre", price: 15 },
  { id: "cuir", name: "Traitement cuir nourrissant", price: 45 },
  { id: "desinfection", name: "Désinfection habitacle (ozone)", price: 35 },
  { id: "poils", name: "Retrait poils d'animaux", price: 30 },
  { id: "phares", name: "Rénovation optiques de phares", price: 40 },
]

/* -------------------------------------------------------------------------- */
/*  PRESTATIONS                                                               */
/* -------------------------------------------------------------------------- */

export const services: Service[] = [
  {
    id: "lavage-premium",
    categoryId: "lavage",
    name: "Lavage Premium Intérieur & Extérieur",
    description:
      "Un nettoyage complet et méticuleux : prélavage, lavage deux seaux, séchage microfibre, aspiration, plastiques et vitres. Votre véhicule retrouve tout son éclat.",
    image: "/services/lavage-premium.png",
    priceFrom: 79,
    durationMin: 120,
    order: 1,
    visible: true,
    featured: true,
    highlights: ["Prélavage & lavage 2 seaux", "Aspiration complète", "Vitres sans traces", "Dressing plastiques"],
  },
  {
    id: "renovation-carrosserie",
    categoryId: "renovation",
    name: "Rénovation Carrosserie (Polissage)",
    description:
      "Correction des micro-rayures et du voile d'oxydation par polissage machine. La peinture retrouve profondeur, brillance et un fini miroir.",
    image: "/services/renovation-carrosserie.png",
    priceFrom: 249,
    durationMin: 360,
    order: 2,
    visible: true,
    highlights: ["Décontamination", "Polissage machine", "Suppression micro-rayures", "Fini miroir"],
  },
  {
    id: "protection-ceramique",
    categoryId: "protection",
    name: "Protection Céramique 5 ans",
    description:
      "Un revêtement céramique haute performance qui protège la peinture, facilite le lavage et intensifie la brillance pendant plusieurs années.",
    image: "/services/protection-ceramique.png",
    priceFrom: 599,
    durationMin: 600,
    order: 3,
    visible: true,
    featured: true,
    highlights: ["Protection jusqu'à 5 ans", "Effet hydrophobe", "Brillance intense", "Garantie constructeur"],
  },
  {
    id: "interieur-complet",
    categoryId: "lavage",
    name: "Nettoyage Intérieur Complet",
    description:
      "Traitement en profondeur de l'habitacle : shampooing sièges et moquettes, plastiques, cuir et désinfection. Un intérieur comme neuf.",
    image: "/services/interieur-complet.png",
    priceFrom: 129,
    durationMin: 180,
    order: 4,
    visible: true,
    highlights: ["Shampooing sièges", "Nettoyage moquettes", "Soin des plastiques", "Désinfection"],
  },
]

/* -------------------------------------------------------------------------- */
/*  GALERIE AVANT / APRÈS                                                     */
/* -------------------------------------------------------------------------- */

export const galleryItems: GalleryItem[] = [
  {
    id: "g1",
    title: "Berline noire — Polissage complet",
    category: "Rénovation",
    before: "/gallery/before-1.png",
    after: "/gallery/after-1.png",
  },
  {
    id: "g2",
    title: "SUV familial — Intérieur cuir",
    category: "Intérieur",
    before: "/gallery/before-2.png",
    after: "/gallery/after-2.png",
  },
  {
    id: "g3",
    title: "Citadine — Protection céramique",
    category: "Protection",
    before: "/gallery/before-3.png",
    after: "/gallery/after-3.png",
  },
  {
    id: "g4",
    title: "Sportive — Correction peinture",
    category: "Rénovation",
    before: "/gallery/before-4.png",
    after: "/gallery/after-4.png",
  },
]

/* -------------------------------------------------------------------------- */
/*  AVIS CLIENTS                                                              */
/* -------------------------------------------------------------------------- */

export const reviews: Review[] = [
  {
    id: "r1",
    author: "Julien M.",
    vehicle: "BMW Série 3",
    rating: 5,
    text: "Travail impeccable, ma voiture n'a jamais été aussi propre. Le rendu de la protection céramique est bluffant. Je recommande vivement !",
    date: "2025-11-12",
  },
  {
    id: "r2",
    author: "Sophie L.",
    vehicle: "Peugeot 3008",
    rating: 5,
    text: "Service à domicile ultra pratique et professionnel. Ponctuel, soigné et de très bon conseil. Résultat au-delà de mes attentes.",
    date: "2025-10-28",
  },
  {
    id: "r3",
    author: "Karim B.",
    vehicle: "Audi A5",
    rating: 5,
    text: "La rénovation de la carrosserie a fait des miracles sur ma voiture de 8 ans. On dirait une neuve. Merci pour le sérieux !",
    date: "2025-10-05",
  },
  {
    id: "r4",
    author: "Émilie R.",
    vehicle: "Renault Clio",
    rating: 5,
    text: "Intérieur nickel après le passage, même les taches sur les sièges ont disparu. Rapport qualité-prix excellent.",
    date: "2025-09-18",
  },
]

/* -------------------------------------------------------------------------- */
/*  FOIRE AUX QUESTIONS                                                       */
/* -------------------------------------------------------------------------- */

export const faq: FaqItem[] = [
  {
    question: "Vous déplacez-vous à domicile ?",
    answer:
      "Oui, nous proposons un service à domicile ou sur votre lieu de travail. Les frais de déplacement sont calculés selon la distance depuis notre atelier.",
  },
  {
    question: "Combien de temps dure une prestation ?",
    answer:
      "Cela dépend de la prestation choisie : de 2 heures pour un lavage premium à une journée complète pour une protection céramique. La durée estimée est indiquée pour chaque prestation.",
  },
  {
    question: "Quels moyens de paiement acceptez-vous ?",
    answer:
      "Nous acceptons les virements, Wero et le paiement sur place. Un acompte peut être demandé à la réservation pour confirmer le rendez-vous.",
  },
  {
    question: "La protection céramique est-elle garantie ?",
    answer:
      "Oui, nos protections céramiques sont garanties selon la formule choisie (2 à 5 ans) avec un entretien recommandé.",
  },
]

/* -------------------------------------------------------------------------- */
/*  CONTENU « À PROPOS »                                                      */
/* -------------------------------------------------------------------------- */

export const about = {
  intro:
    "Passionné d'automobile et exigeant sur le détail, nous redonnons à chaque véhicule son éclat d'origine grâce à des techniques professionnelles et des produits haut de gamme.",
  story:
    "Fondé par un passionné de belles mécaniques, notre atelier met un point d'honneur à traiter chaque voiture comme la sienne. Du lavage minutieux à la protection céramique, chaque geste est pensé pour un résultat durable et irréprochable.",
  values: [
    { title: "Exigence", description: "Un soin méticuleux apporté au moindre détail, sans compromis." },
    { title: "Produits premium", description: "Des marques professionnelles reconnues et respectueuses des surfaces." },
    { title: "Transparence", description: "Des tarifs clairs et des conseils honnêtes adaptés à votre véhicule." },
    { title: "Proximité", description: "Un service à domicile flexible qui s'adapte à votre emploi du temps." },
  ],
  stats: [
    { value: "500+", label: "Véhicules traités" },
    { value: "5 ans", label: "D'expérience" },
    { value: "4.9/5", label: "Note moyenne" },
    { value: "100%", label: "Clients satisfaits" },
  ],
}
