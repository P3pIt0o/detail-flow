/**
 * ============================================================================
 *  SOURCE UNIQUE DE VÉRITÉ — OFFRES COMMERCIALES DetailFlow
 * ============================================================================
 *  Fichier PUR (aucun import serveur / DB). Importable partout : marketing,
 *  onboarding, tests, et futur Checkout Stripe.
 *
 *  RÔLE : réconcilier le DISCOURS COMMERCIAL (prix, noms publics, puces) avec
 *  les DROITS TECHNIQUES réels (moteur de licences). Le marketing ne définit
 *  plus ses propres prix indépendamment du moteur — il consomme ce fichier.
 *
 *  GAMME COMMERCIALE PUBLIQUE (4 niveaux SaaS) :
 *    Essentiel   0 €          -> plan technique FREE       (self-service actif)
 *    Indépendant 19,90 €/mois -> plan technique PRO         (self_serve via Stripe Checkout)
 *    Performance 34,90 €/mois -> plan technique BUSINESS    (coming_soon — phase de lancement)
 *    Équipe      59,90 €/mois -> plan technique ENTERPRISE  (coming_soon)
 *
 *  L'offre « Équipe » (gestion multi-employés, agendas par collaborateur,
 *  permissions, RDV simultanés) pointe vers le plan technique ENTERPRISE. Ce
 *  plan hérite aujourd'hui des droits de BUSINESS ; les fonctionnalités
 *  d'équipe seront ajoutées à ENTERPRISE quand leurs modules seront livrés.
 *  L'offre reste `coming_soon` : elle ne promet aucune feature gated (aucune
 *  feature d'équipe n'existe encore) et ne mène jamais à /demarrer.
 *
 *  LE « SUR MESURE » N'EST PAS UNE OFFRE SAAS : c'est une prestation distincte
 *  (développement d'une plateforme dédiée). Voir `CUSTOM_PLATFORM_OFFER`.
 *
 *  DISTINCTION IMPORTANTE (deux notions à ne pas confondre) :
 *  - `PLAN_META.purchasable` (registre licences) = un plan qu'un SUPER-ADMIN
 *    peut attribuer manuellement. Notion interne d'outillage.
 *  - `availability` ci-dessous = un VISITEUR peut-il RÉELLEMENT obtenir l'offre
 *    en self-service MAINTENANT (attribution câblée de bout en bout) ?
 *
 *  RÈGLE ABSOLUE : une offre n'est `self_serve` que si son attribution existe
 *  vraiment. FREE est attribué à la création ; PRO est obtenu via Stripe
 *  Checkout depuis /admin/abonnement (licence mise à jour par le webhook
 *  Billing uniquement). BUSINESS / ENTERPRISE restent reconnus par le backend
 *  (abonnements existants, webhook) mais ne sont plus vendus en self-service.
 *  `/demarrer?plan=PRO` ne fait que mémoriser l'intention : l'espace est
 *  toujours créé FREE.
 *  Les offres `coming_soon` NE DOIVENT PAS pointer vers /demarrer.
 *
 *  ESSAI : 30 jours gratuits sur la première souscription éligible
 *  (`SUBSCRIPTION_TRIAL_DAYS`, logique dans lib/billing/subscription-core.ts).
 * ============================================================================
 */

import type { FeatureKey, LicensePlan } from "@/lib/licensing/types"

/**
 * Plan technique attribué à TOUT compte créé en self-service aujourd'hui.
 * `provisionCompanyForUser` importe cette constante : marketing, onboarding et
 * attribution partagent ainsi une seule valeur (impossible de dériver).
 *
 * NOTE : la page publique standard `/p/<slug>` et le lien de réservation
 * `/p/<slug>/reservation` sont accessibles à FREE SANS la feature `website`
 * (réservée aux vrais sites personnalisés). Page publique standard ≠ feature
 * `website` : ce sont deux concepts distincts.
 */
export const SELF_SERVICE_LICENSE_PLAN: LicensePlan = "FREE"

export type PlanAvailability =
  /** Obtenable réellement, tout de suite, en self-service. */
  | "self_serve"
  /** Présentée publiquement mais pas encore achetable (attribution non livrée). */
  | "coming_soon"

export type CommercialPlan = {
  id: "starter" | "pro" | "ultime" | "entreprise"
  /** Nom public affiché. */
  name: string
  /** Ligne de positionnement courte (« Commencez simplement. »). */
  tagline: string
  /**
   * Plan technique du moteur de licences correspondant, ou `null` quand aucun
   * plan réel n'existe encore (cas Entreprise : gestion d'équipe non modélisée).
   */
  licensePlan: LicensePlan | null
  price: string
  period: string
  /**
   * Prix mensuel en centimes d'euro — DONNÉE NUMÉRIQUE SOURCE DE VÉRITÉ.
   * La couche Stripe Billing (`lib/billing/config.ts`) consomme cette valeur au
   * lieu de la redéfinir : `price` (ex. « 19,90 € ») reste l'affichage, jamais
   * la donnée exploitée par le back. FREE = 0.
   */
  monthlyPriceCents: number
  description: string
  /** Promesse « 1er mois offert » affichée sur les offres payantes. */
  trial?: string | null
  /**
   * Puces d'affichage marketing. Peuvent inclure des capacités NON gated
   * (page publique, réservation, planning) réellement offertes à tous.
   */
  highlights: string[]
  /**
   * Features GATED explicitement promises par l'offre. INVARIANT (vérifié par
   * les tests) : chacune DOIT être `true` dans `PLAN_MATRIX[licensePlan]`.
   * Vide pour FREE (aucune feature premium) et pour Entreprise (pas de plan).
   */
  includedFeatures: FeatureKey[]
  availability: PlanAvailability
  /**
   * CTA. `href` est `null` pour une offre `coming_soon` : le composant rend un
   * bouton désactivé « Bientôt disponible » — JAMAIS un lien vers /demarrer.
   */
  cta: { label: string; href: string | null }
  badge?: string | null
  highlighted?: boolean
}

/** Textes d'en-tête de la section tarifs (déplacés ici depuis le marketing). */
export const PRICING_COPY = {
  eyebrow: "Tarifs",
  title: "Une formule pour chaque étape de votre activité",
  lead: "Commencez gratuitement. Passez à la formule supérieure quand votre activité grandit.",
  trialHeadline: "30 jours gratuits sur Indépendant.",
  trialSub: "Vous démarrez l'essai depuis votre espace, après sa création.",
  note: "Prix indiqués hors taxes.",
  comingSoonLabel: "Bientôt disponible",
  compareLabel: "Comparer les fonctionnalités",
} as const

/**
 * Offres présentées sur la grille principale (4 colonnes).
 *
 * ÉTAT ACTUEL (lancement) : seuls « Essentiel » et « Indépendant » sont
 * `self_serve`. « Performance » et « Équipe » sont `coming_soon` (aucun
 * Checkout, aucun lien).
 */
export const COMMERCIAL_PLANS: readonly CommercialPlan[] = [
  {
    id: "starter",
    name: "Essentiel",
    tagline: "Commencez simplement.",
    licensePlan: "FREE",
    price: "0 €",
    period: "sans engagement",
    monthlyPriceCents: 0,
    description: "Découvrez DetailFlow gratuitement et encaissez vos premières réservations en ligne.",
    trial: null,
    highlights: [
      "Page professionnelle personnalisable",
      "Réservation en ligne & widget à partager",
      "Planning centralisé",
      "Jusqu'à 5 clients",
      "3 devis et 3 factures par mois",
      "Paiements en ligne (commission DetailFlow, hors frais Stripe)",
      "Fonctionnalités avancées avec l'offre supérieure",
    ],
    // Features gated réellement ouvertes par PLAN_MATRIX.FREE.
    includedFeatures: ["website", "online_booking", "online_payments", "customer_subscriptions"],
    availability: "self_serve",
    cta: { label: "Créer mon espace gratuitement", href: "/demarrer" },
    highlighted: false,
    badge: null,
  },
  {
    id: "pro",
    name: "Indépendant",
    tagline: "Automatisez votre quotidien.",
    licensePlan: "PRO",
    price: "19,90 €",
    period: "/ mois",
    monthlyPriceCents: 1990,
    description: "Pour le detailer indépendant qui veut gérer sérieusement son activité.",
    trial: "30 jours gratuits",
    highlights: [
      "Tout Essentiel",
      "Clients, devis et factures illimités",
      "Commission réduite sur les paiements en ligne",
      "Rappels & demandes d'avis automatiques",
      "Statistiques de base",
    ],
    // Toutes garanties true dans PLAN_MATRIX.PRO.
    includedFeatures: ["online_booking", "online_payments", "email_reminders", "review_requests", "business_stats"],
    availability: "self_serve",
    cta: { label: "Essayer 30 jours gratuitement", href: "/demarrer?plan=PRO" },
    highlighted: true,
    badge: "Recommandé pour les indépendants",
  },
  {
    id: "ultime",
    name: "Performance",
    tagline: "Passez à la vitesse supérieure.",
    licensePlan: "BUSINESS",
    price: "34,90 €",
    period: "/ mois",
    monthlyPriceCents: 3490,
    description: "Pour développer, automatiser et fidéliser à grande échelle.",
    trial: null,
    highlights: [
      "Tout Indépendant",
      "Devis, factures & avoirs",
      "Statistiques avancées & analyse du CA",
      "Automatisations, SMS & relances",
      "Leads / CRM & marketing avancé",
    ],
    // Toutes garanties true dans PLAN_MATRIX.BUSINESS (allFeatures sauf early_access).
    includedFeatures: [
      "expense_management",
      "profitability_analysis",
      "advanced_reporting",
      "marketing",
      "automations",
      "sms",
      // LOT 2 — la promesse « Leads / CRM » est désormais adossée à la FeatureKey réelle.
      "leads_crm",
    ],
    availability: "coming_soon",
    cta: { label: "Bientôt disponible", href: null },
    highlighted: false,
    badge: null,
  },
  {
    id: "entreprise",
    name: "Équipe",
    tagline: "Travaillez efficacement à plusieurs.",
    // Plan technique ENTERPRISE (moteur de licences). Il hérite aujourd'hui des
    // droits de BUSINESS ; les fonctionnalités d'équipe (comptes employés,
    // agendas individuels, permissions, RDV simultanés) seront ajoutées à
    // ENTERPRISE au moment où chaque module sera réellement développé. L'offre
    // reste `coming_soon` : aucune feature d'équipe n'est promise (invariant
    // testé -> `includedFeatures` vide tant que ces modules n'existent pas).
    licensePlan: "ENTERPRISE",
    price: "59,90 €",
    period: "/ mois",
    monthlyPriceCents: 5990,
    description: "Pour les centres avec plusieurs collaborateurs.",
    trial: null,
    highlights: [
      "Tout Performance",
      "Comptes & agendas par collaborateur",
      "Disponibilités, horaires & congés individuels",
      "Attribution des rendez-vous & RDV simultanés",
      "Permissions & statistiques par employé",
    ],
    // licensePlan null -> aucune feature ne peut être promise (invariant testé).
    includedFeatures: [],
    availability: "coming_soon",
    cta: { label: PRICING_COPY.comingSoonLabel, href: null },
    highlighted: false,
    badge: null,
  },
]

/** Toutes les offres SaaS (utilitaire pour les invariants/tests). */
export const ALL_COMMERCIAL_PLANS: readonly CommercialPlan[] = [...COMMERCIAL_PLANS]

/** Offres réellement obtenables en self-service aujourd'hui. */
export function getSelfServePlans(): CommercialPlan[] {
  return ALL_COMMERCIAL_PLANS.filter((p) => p.availability === "self_serve")
}

/**
 * Offre commerciale correspondant à un plan technique de licence, ou `null`.
 * Permet à la couche Stripe Billing de consommer le nom public et le prix
 * mensuel (centimes) sans les redéfinir — source unique de vérité.
 */
export function getCommercialPlanByLicensePlan(plan: LicensePlan): CommercialPlan | null {
  return ALL_COMMERCIAL_PLANS.find((p) => p.licensePlan === plan) ?? null
}

/* ------------------------------------------------------------------------- */
/*  PARCOURS DE CROISSANCE — « DetailFlow grandit avec vous »                */
/* ------------------------------------------------------------------------- */

export type JourneyStep = {
  planId: CommercialPlan["id"]
  name: string
  verb: string
  audience: string
}

/** Montée en gamme lisible sans passer par le tableau tarifaire. */
export const PLAN_JOURNEY: readonly JourneyStep[] = [
  { planId: "starter", name: "Essentiel", verb: "Commencez.", audience: "Je veux juste démarrer." },
  { planId: "pro", name: "Indépendant", verb: "Automatisez.", audience: "Je suis indépendant." },
  { planId: "ultime", name: "Performance", verb: "Développez.", audience: "Je veux développer mon activité." },
  { planId: "entreprise", name: "Équipe", verb: "Travaillez en équipe.", audience: "J'ai plusieurs collaborateurs." },
]

/* ------------------------------------------------------------------------- */
/*  PRESTATION SUR MESURE — N'EST PAS UNE FORMULE SAAS                        */
/* ------------------------------------------------------------------------- */

/**
 * Développement d'une plateforme dédiée. Prestation distincte des abonnements
 * DetailFlow : prix « à partir de », contact commercial (aucun self-service,
 * aucun plan de licence). La note `ownershipNote` encadre honnêtement l'argument
 * de propriété (composants tiers, infra et licences restent sous leurs CGU).
 */
export const CUSTOM_PLATFORM_OFFER = {
  eyebrow: "Plateforme métier",
  title: "Votre plateforme métier sur mesure.",
  description:
    "Besoin de plus qu'un site internet ? Nous concevons une plateforme totalement adaptée à votre entreprise, à votre image et autour de vos processus — pour un fonctionnement que les formules standard ne couvrent pas.",
  price: "À partir de 1 990 €",
  priceNote: "Prestation ponctuelle, distincte des abonnements DetailFlow.",
  argument: "Vous ne vous adaptez plus au logiciel. Le logiciel s'adapte à vous.",
  bullets: [
    "Design sur mesure",
    "Fonctionnalités adaptées à votre activité",
    "Votre marque et votre domaine",
    "Dépôt de code dédié",
    "Code source livré selon le périmètre du projet",
    "Accompagnement au lancement",
  ],
  ownership: "La plateforme vous appartient.*",
  ownershipNote:
    "*Selon le périmètre contractuel du projet. Les infrastructures, services externes et licences tierces restent soumis à leurs propres conditions.",
  cta: {
    label: "Parler de mon projet",
    href: "mailto:contact@detailflow.fr?subject=Mon%20projet%20DetailFlow%20sur%20mesure",
  },
} as const

/* ------------------------------------------------------------------------- */
/*  OFFRE LIFETIME — ALTERNATIVE « PAIEMENT UNIQUE » (MARKETING ONLY)         */
/* ------------------------------------------------------------------------- */

/**
 * Offre spéciale « licence à vie ». N'EST PAS une 5ᵉ formule mensuelle : c'est
 * une alternative pour ceux qui préfèrent payer une seule fois. Présentée comme
 * un encart secondaire, jamais dans la grille `COMMERCIAL_PLANS`.
 *
 * ÉTAT ACTUEL : aucun Checkout, aucun Stripe, aucun compteur dynamique. Le CTA
 * ouvre un simple modal d'information marketing. Le vrai compteur des 50
 * licences et l'achat seront livrés dans un lot ultérieur (S2.5). On affiche
 * donc UNIQUEMENT « limitée à 50 licences maximum » — jamais « X restantes ».
 */
export const LIFETIME_OFFER = {
  eyebrow: "Offre Lifetime",
  title: "Vous préférez payer une seule fois ?",
  intro: "Profitez de DetailFlow avec une licence à vie, sans abonnement mensuel.",
  priceOnce: "1 290 € HT",
  priceOnceLabel: "en une fois",
  priceSplit: "2 × 690 € HT",
  scarcity: "Offre limitée à 50 licences maximum.",
  cta: "Découvrir Lifetime",
  modal: {
    title: "DetailFlow Lifetime",
    subtitle: "Une licence à vie, sans abonnement mensuel.",
    priceBullets: ["1 290 € HT en une fois", "ou 2 × 690 € HT", "Offre limitée à 50 licences maximum"],
    features: [
      "Licence d'utilisation de DetailFlow à vie",
      "Le périmètre fonctionnel exact de la licence Lifetime sera affiché avant toute ouverture des ventes.",
      "Pas d'abonnement mensuel",
      "0 % de commission DetailFlow prévue sur les paiements en ligne",
      "20 SMS de bienvenue offerts",
    ],
    notes: [
      "Les frais Stripe éventuels sur les paiements clients restent distincts et à votre charge.",
      "SMS supplémentaires payants au-delà des 20 SMS offerts.",
      "Domaine et services tiers éventuels non inclus.",
      "Les futures fonctionnalités Équipe / multi-collaborateurs ne sont pas incluses automatiquement.",
    ],
    legal: [
      "Lifetime correspond à une licence d'utilisation de DetailFlow. Elle ne transfère pas la propriété du code source, de l'infrastructure ou de DetailFlow.",
      "Certains futurs modules ou services tiers entraînant des coûts spécifiques pourront être proposés séparément.",
    ],
    contactCta: "Je suis intéressé par Lifetime",
    contactEmail: "contact@detailflow.fr",
    contactSubject: "Intérêt pour DetailFlow Lifetime",
    contactHint: "L'achat en ligne sera activé prochainement.",
  },
} as const
