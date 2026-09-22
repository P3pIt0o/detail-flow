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
  id: "starter" | "pro" | "business" | "lifetime"
  /** Nom public affiché. */
  name: string
  /**
   * Plan technique du moteur de licences correspondant, ou `null` quand aucun
   * plan réel n'existe encore (cas Lifetime : concept conservé, plan à créer).
   */
  licensePlan: LicensePlan | null
  price: string
  period: string
  description: string
  /**
   * Puces d'affichage marketing. Peuvent inclure des capacités NON gated
   * (page publique, réservation, planning) réellement offertes à tous.
   */
  highlights: string[]
  /**
   * Features GATED explicitement promises par l'offre. INVARIANT (vérifié par
   * les tests) : chacune DOIT être `true` dans `PLAN_MATRIX[licensePlan]`.
   * Vide pour FREE (aucune feature premium) et pour Lifetime (pas de plan réel).
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
  title: "Choisissez la formule DetailFlow adaptée à votre activité",
  lead: "Commencez gratuitement dès aujourd'hui. Les offres supérieures arrivent bientôt.",
  note: "Prix indiqués hors taxes. Les offres payantes seront activées prochainement.",
  comingSoonLabel: "Bientôt disponible",
} as const

/**
 * Offres présentées sur la grille principale (3 colonnes).
 *
 * ÉTAT ACTUEL : seule « Starter » (FREE) est `self_serve`. « Pro » et
 * « Business » sont `coming_soon` tant que le Checkout + l'attribution payante
 * ne sont pas livrés — elles restent visibles pour communiquer la trajectoire,
 * sans CTA trompeur vers /demarrer.
 */
export const COMMERCIAL_PLANS: readonly CommercialPlan[] = [
  {
    id: "starter",
    name: "Starter",
    licensePlan: "FREE",
    price: "0 €",
    period: "pour démarrer",
    description: "L'essentiel pour lancer votre activité en ligne, gratuitement.",
    highlights: [
      "Page professionnelle en ligne",
      "Lien de réservation à partager",
      "Planning centralisé",
      "Fiches clients & véhicules",
    ],
    // FREE n'accorde aucune feature premium gated : page publique et réservation
    // sont des capacités non gated, listées en `highlights` ci-dessus.
    includedFeatures: [],
    availability: "self_serve",
    cta: { label: "Créer mon espace", href: "/demarrer" },
    highlighted: false,
    badge: null,
  },
  {
    id: "pro",
    name: "Pro",
    licensePlan: "PRO",
    price: "24,90 €",
    period: "/ mois",
    description: "Pour gérer sereinement une activité qui tourne.",
    highlights: [
      "Tout Starter",
      "Devis & factures reliés",
      "Rappels & demandes d'avis automatiques",
      "Suivi du chiffre d'affaires",
    ],
    includedFeatures: ["email_reminders", "review_requests", "business_stats"],
    availability: "coming_soon",
    cta: { label: PRICING_COPY.comingSoonLabel, href: null },
    highlighted: true,
    badge: "Le plus choisi",
  },
  {
    id: "business",
    name: "Business",
    licensePlan: "BUSINESS",
    price: "39,90 €",
    period: "/ mois",
    description: "Pour aller plus loin dans le pilotage de votre entreprise.",
    highlights: [
      "Tout Pro",
      "Gestion des frais & rentabilité",
      "Statistiques d'activité avancées",
      "Reporting & marketing avancés",
    ],
    includedFeatures: ["expense_management", "profitability_analysis", "advanced_reporting", "marketing"],
    availability: "coming_soon",
    cta: { label: PRICING_COPY.comingSoonLabel, href: null },
    highlighted: false,
    badge: null,
  },
]

/**
 * Offre Lifetime — CONCEPT conservé mais PAS encore achetable.
 *
 * `licensePlan: null` : aucun plan technique « à vie » n'existe dans le moteur
 * (les générations existent, pas le plan). Donc `coming_soon` obligatoire et
 * aucune feature promise tant que le plan n'est pas défini + l'attribution
 * idempotente câblée. La demande sur mesure reste un simple contact (légitime).
 */
export const LIFETIME_OFFER: CommercialPlan & {
  custom: { title: string; description: string; email: string; cta: { label: string; href: string } }
} = {
  id: "lifetime",
  name: "Lifetime",
  licensePlan: null,
  price: "990 €",
  period: "paiement unique",
  description: "Accédez à DetailFlow à vie, sans abonnement mensuel.",
  highlights: ["Accès à la plateforme à vie", "Mises à jour incluses", "Aucun abonnement mensuel"],
  includedFeatures: [],
  availability: "coming_soon",
  cta: { label: PRICING_COPY.comingSoonLabel, href: null },
  badge: "Offre à vie",
  custom: {
    title: "Besoin d'une adaptation sur mesure ?",
    description:
      "Adaptation à un métier spécifique, fonctionnalités particulières, développements sur mesure ou évolution plus poussée de la plateforme selon les besoins de votre entreprise : ces demandes font l'objet d'une étude dédiée et d'un devis. Elles ne sont pas incluses automatiquement dans le prix Lifetime.",
    email: "contact@detailflow.fr",
    cta: {
      label: "Parler de mon projet",
      href: "mailto:contact@detailflow.fr?subject=Mon%20projet%20DetailFlow%20sur%20mesure",
    },
  },
}

/** Toutes les offres, y compris Lifetime (utilitaire pour les invariants/tests). */
export const ALL_COMMERCIAL_PLANS: readonly CommercialPlan[] = [...COMMERCIAL_PLANS, LIFETIME_OFFER]

/** Offres réellement obtenables en self-service aujourd'hui. */
export function getSelfServePlans(): CommercialPlan[] {
  return ALL_COMMERCIAL_PLANS.filter((p) => p.availability === "self_serve")
}
