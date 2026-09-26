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
 *  GAMME COMMERCIALE PUBLIQUE (4 niveaux SaaS) — noms/prix issus de
 *  `lib/pricing/commercial-rules.ts` (source unique, aucune valeur dupliquée) :
 *    Essentiel    0 €          -> plan technique FREE       (self-service actif)
 *    Indépendant  19,90 €/mois -> plan technique PRO         (coming_soon)
 *    Croissance   34,90 €/mois -> plan technique BUSINESS    (coming_soon)
 *    Centre       59,90 €/mois -> plan technique ENTERPRISE  (coming_soon)
 *
 *  L'offre « Centre » (gestion multi-employés, agendas par collaborateur,
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
 *  vraiment. Tant que le Checkout Stripe des offres payantes n'est pas livré,
 *  SEUL le plan gratuit (FREE) est `self_serve`. Les autres sont `coming_soon`
 *  et NE DOIVENT PAS pointer vers /demarrer (sinon un clic crée silencieusement
 *  un compte FREE en laissant croire que l'offre payante a été sélectionnée).
 *
 *  MOIS OFFERT : les offres payantes affichent « 1er mois offert » comme
 *  PROMESSE de lancement. Aucun Checkout ni `trial_period_days` n'est câblé —
 *  la présentation est prête, le backend reste à livrer (cf. compte-rendu).
 * ============================================================================
 */

import type { FeatureKey, LicensePlan } from "@/lib/licensing/types"
import { COMMERCIAL_TIERS, formatEuroCents } from "@/lib/pricing/commercial-rules"

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
  trialHeadline: "Votre premier mois est offert.",
  trialSub: "Découvrez toutes les fonctionnalités de votre formule pendant 30 jours sur les offres payantes.",
  note: "Prix indiqués hors taxes. Les offres payantes sont en cours de finalisation et seront activées prochainement.",
  comingSoonLabel: "Bientôt disponible",
  compareLabel: "Comparer les fonctionnalités",
} as const

/**
 * Offres présentées sur la grille principale (4 colonnes).
 *
 * ÉTAT ACTUEL : seule « Starter » (FREE) est `self_serve`. « Pro », « Ultime »
 * et « Entreprise » sont `coming_soon` tant que le Checkout + l'attribution
 * payante ne sont pas livrés — elles restent visibles pour communiquer la
 * trajectoire, sans CTA trompeur vers /demarrer.
 */
export const COMMERCIAL_PLANS: readonly CommercialPlan[] = [
  {
    id: "starter",
    name: COMMERCIAL_TIERS.FREE.publicName,
    tagline: "Pour démarrer simplement.",
    licensePlan: "FREE",
    price: formatEuroCents(COMMERCIAL_TIERS.FREE.monthlyPriceCents),
    period: "/ mois",
    description:
      "L'essentiel pour organiser votre activité et commencer à recevoir des réservations.",
    trial: null,
    highlights: [
      "Page professionnelle en ligne",
      "Réservations illimitées",
      "Planning centralisé",
      "Fiches clients & véhicules (jusqu'à 10)",
      "Confirmations email & tableau de bord",
    ],
    // FREE n'accorde aucune feature premium gated : page publique et réservation
    // sont des capacités non gated, listées en `highlights` ci-dessus.
    includedFeatures: [],
    availability: "self_serve",
    cta: { label: "Créer mon espace gratuitement", href: "/demarrer" },
    highlighted: false,
    badge: null,
  },
  {
    id: "pro",
    name: COMMERCIAL_TIERS.PRO.publicName,
    tagline: "Pour gérer et automatiser votre activité.",
    licensePlan: "PRO",
    price: formatEuroCents(COMMERCIAL_TIERS.PRO.monthlyPriceCents),
    period: "/ mois",
    description:
      "Une formule complète pour les professionnels qui travaillent seuls et veulent gagner du temps.",
    trial: "1er mois offert",
    highlights: [
      "Tout Essentiel, sans limite de clients",
      "Réservation avancée (véhicules, options, suppléments)",
      "Acompte & paiements en ligne",
      "Rappels & demandes d'avis automatiques",
      "Statistiques de base",
    ],
    // Toutes garanties true dans PLAN_MATRIX.PRO.
    includedFeatures: ["online_booking", "online_payments", "email_reminders", "review_requests", "business_stats"],
    availability: "coming_soon",
    cta: { label: PRICING_COPY.comingSoonLabel, href: null },
    highlighted: true,
    badge: "Recommandé pour les indépendants",
  },
  {
    id: "ultime",
    name: COMMERCIAL_TIERS.BUSINESS.publicName,
    tagline: "Pour développer votre chiffre d'affaires.",
    licensePlan: "BUSINESS",
    price: formatEuroCents(COMMERCIAL_TIERS.BUSINESS.monthlyPriceCents),
    period: "/ mois",
    description:
      "CRM, analyse avancée, SMS et automatisations pour transformer davantage de prospects en clients.",
    trial: "1er mois offert",
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
    cta: { label: PRICING_COPY.comingSoonLabel, href: null },
    highlighted: false,
    badge: null,
  },
  {
    id: "entreprise",
    name: COMMERCIAL_TIERS.ENTERPRISE.publicName,
    tagline: "Pour piloter votre équipe.",
    // Plan technique ENTERPRISE (moteur de licences). Il hérite aujourd'hui des
    // droits de BUSINESS ; les fonctionnalités d'équipe (comptes employés,
    // agendas individuels, permissions, RDV simultanés) seront ajoutées à
    // ENTERPRISE au moment où chaque module sera réellement développé. L'offre
    // reste `coming_soon` : aucune feature d'équipe n'est promise (invariant
    // testé -> `includedFeatures` vide tant que ces modules n'existent pas).
    licensePlan: "ENTERPRISE",
    price: formatEuroCents(COMMERCIAL_TIERS.ENTERPRISE.monthlyPriceCents),
    period: "/ mois",
    description:
      "Pensé pour les centres avec plusieurs collaborateurs, plusieurs agendas et des rendez-vous simultanés.",
    trial: "1er mois offert",
    highlights: [
      "Tout Croissance",
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
  {
    planId: "starter",
    name: COMMERCIAL_TIERS.FREE.publicName,
    verb: "Démarrer et organiser.",
    audience: "Je veux juste démarrer.",
  },
  {
    planId: "pro",
    name: COMMERCIAL_TIERS.PRO.publicName,
    verb: "Gérer et automatiser.",
    audience: "Je suis indépendant.",
  },
  {
    planId: "ultime",
    name: COMMERCIAL_TIERS.BUSINESS.publicName,
    verb: "Développer et fidéliser.",
    audience: "Je veux développer mon activité.",
  },
  {
    planId: "entreprise",
    name: COMMERCIAL_TIERS.ENTERPRISE.publicName,
    verb: "Travailler en équipe.",
    audience: "J'ai plusieurs collaborateurs.",
  },
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
  eyebrow: "Sur mesure",
  title: "Et si on développait votre propre plateforme ?",
  description:
    "Vous avez un fonctionnement particulier ou besoin d'un outil totalement adapté à votre entreprise ? Nous concevons votre plateforme, à votre image et autour de vos processus.",
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
