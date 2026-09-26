/**
 * ============================================================================
 *  SOURCE UNIQUE DE VÉRITÉ — RÈGLES COMMERCIALES DetailFlow (LOT COMMERCIAL 1)
 * ============================================================================
 *  Fichier PUR (aucun import serveur / DB). Importable partout : marketing,
 *  onboarding, tests, et futur lot Stripe.
 *
 *  RÔLE : centraliser les DONNÉES COMMERCIALES adossées au moteur de licences —
 *  noms publics, prix, commission DetailFlow, plafonds, quotas SMS, fidélité et
 *  offre Lifetime. Aucune valeur n'est dupliquée ailleurs : `lib/pricing/plans.ts`
 *  et les composants marketing CONSOMMENT ce fichier.
 *
 *  CE LOT EST DE LA CONFIGURATION + AFFICHAGE. Il n'implémente PAS :
 *    - le prélèvement réel des commissions / application fees Stripe Connect ;
 *    - le Checkout d'abonnement, le calcul réel des plafonds ;
 *    - le renouvellement mensuel des SMS ni l'achat de SMS ;
 *    - la remise fidélité automatique appliquée par Stripe ;
 *    - le paiement Lifetime réel ;
 *    - toute migration DB.
 *  Ces éléments viendront dans un lot Stripe séparé.
 *
 *  CONVENTIONS FINANCIÈRES (jamais de float financier stocké) :
 *    - Tous les montants sont en CENTIMES (1990 = 19,90 €).
 *    - Tous les pourcentages sont en POINTS DE BASE / basis points
 *      (200 = 2 %, 100 = 1 %, 50 = 0,5 %, 25 = 0,25 %).
 *    - Le formatage n'intervient QU'À l'affichage (helpers ci-dessous).
 *
 *  MAPPING NOM TECHNIQUE (moteur) -> NOM COMMERCIAL PUBLIC :
 *    FREE       -> Essentiel     (0 €)
 *    PRO        -> Indépendant   (19,90 €/mois)
 *    BUSINESS   -> Croissance    (34,90 €/mois)
 *    ENTERPRISE -> Centre        (59,90 €/mois — « Bientôt disponible »)
 *    FOUNDER    -> interne, jamais public.
 * ============================================================================
 */

import type { LicensePlan } from "@/lib/licensing/types"

/* ========================================================================= */
/*  TYPES                                                                    */
/* ========================================================================= */

/** Plans techniques qui portent une offre commerciale publique. */
export type CommercialLicensePlan = Extract<LicensePlan, "FREE" | "PRO" | "BUSINESS" | "ENTERPRISE">

/** Mode de facturation commercial (le moteur de droits n'est PAS modifié). */
export type BillingMode = "SUBSCRIPTION" | "LIFETIME"

/**
 * Politique de frais de transaction DetailFlow.
 *
 * IMPORTANT : la commission s'applique UNIQUEMENT aux sommes RÉELLEMENT
 * encaissées en ligne via DetailFlow (acompte ou règlement intégral). Jamais
 * sur un devis non encaissé, une réservation non payée, ou un paiement réalisé
 * hors DetailFlow. Les frais Stripe sont distincts et non modélisés ici (leur
 * tarif peut évoluer : ne jamais le hardcoder).
 */
export type TransactionFeePolicy = {
  /** Commission DetailFlow en points de base (200 = 2 %). */
  basisPoints: number
  /** Plafond MENSUEL de commission DetailFlow, en centimes. */
  monthlyCapCents: number
}

/** Dotation SMS d'une formule. Le renouvellement réel viendra dans un autre lot. */
export type SmsAllowance =
  /** Module SMS non inclus (Essentiel). */
  | { kind: "none" }
  /** N SMS offerts UNE SEULE FOIS au démarrage, puis à la consommation. */
  | { kind: "welcome_once"; count: number }
  /** N SMS inclus CHAQUE MOIS, puis à la consommation. */
  | { kind: "monthly"; count: number }

/** Palier de fidélité : à partir de `minMonths` d'ancienneté continue. */
export type LoyaltyTier = {
  /** Ancienneté minimale (en mois) pour atteindre le palier. */
  minMonths: number
  /** Remise en points de base appliquée AU PRIX D'ABONNEMENT (500 = -5 %). */
  discountBasisPoints: number
}

/** Offre commerciale complète d'un plan technique. */
export type CommercialTier = {
  /** Plan technique du moteur de licences. */
  licensePlan: CommercialLicensePlan
  /** Identifiant de colonne marketing (stable, aligné sur plans.ts / pricing-data.ts). */
  columnId: "starter" | "pro" | "ultime" | "entreprise"
  /** Nom commercial public. */
  publicName: string
  /** Prix d'abonnement mensuel, en centimes (0 pour Essentiel). */
  monthlyPriceCents: number
  fee: TransactionFeePolicy
  sms: SmsAllowance
  /** Éligible au programme de fidélité (jamais FREE). */
  loyaltyEligible: boolean
}

/* ========================================================================= */
/*  MAPPING NOM TECHNIQUE -> NOM COMMERCIAL                                  */
/* ========================================================================= */

/** Nom commercial public de chaque plan technique commercialisé. */
export const PUBLIC_PLAN_NAME: Record<CommercialLicensePlan, string> = {
  FREE: "Essentiel",
  PRO: "Indépendant",
  BUSINESS: "Croissance",
  ENTERPRISE: "Centre",
}

/* ========================================================================= */
/*  OFFRES COMMERCIALES (source unique des prix / frais / SMS / fidélité)     */
/* ========================================================================= */

export const COMMERCIAL_TIERS: Record<CommercialLicensePlan, CommercialTier> = {
  FREE: {
    licensePlan: "FREE",
    columnId: "starter",
    publicName: PUBLIC_PLAN_NAME.FREE,
    monthlyPriceCents: 0,
    // 2 % par paiement, plafonné à 19,90 €/mois.
    fee: { basisPoints: 200, monthlyCapCents: 1990 },
    sms: { kind: "none" },
    loyaltyEligible: false,
  },
  PRO: {
    licensePlan: "PRO",
    columnId: "pro",
    publicName: PUBLIC_PLAN_NAME.PRO,
    monthlyPriceCents: 1990,
    // 1 % par paiement, plafonné à 5 €/mois.
    fee: { basisPoints: 100, monthlyCapCents: 500 },
    // 20 SMS offerts UNE SEULE FOIS au démarrage, puis à la consommation.
    sms: { kind: "welcome_once", count: 20 },
    loyaltyEligible: true,
  },
  BUSINESS: {
    licensePlan: "BUSINESS",
    columnId: "ultime",
    publicName: PUBLIC_PLAN_NAME.BUSINESS,
    monthlyPriceCents: 3490,
    // 0,5 % par paiement, plafonné à 5 €/mois.
    fee: { basisPoints: 50, monthlyCapCents: 500 },
    // 50 SMS inclus chaque mois, puis à la consommation.
    sms: { kind: "monthly", count: 50 },
    loyaltyEligible: true,
  },
  ENTERPRISE: {
    licensePlan: "ENTERPRISE",
    columnId: "entreprise",
    publicName: PUBLIC_PLAN_NAME.ENTERPRISE,
    monthlyPriceCents: 5990,
    // 0,25 % par paiement, plafonné à 6 €/mois.
    fee: { basisPoints: 25, monthlyCapCents: 600 },
    // 150 SMS inclus chaque mois, puis à la consommation.
    sms: { kind: "monthly", count: 150 },
    loyaltyEligible: true,
  },
}

/** Accès direct à une offre par son plan technique. */
export function getCommercialTier(plan: CommercialLicensePlan): CommercialTier {
  return COMMERCIAL_TIERS[plan]
}

/** Type-guard : ce plan technique porte-t-il une offre commerciale publique ? */
export function isCommercialLicensePlan(plan: LicensePlan | null): plan is CommercialLicensePlan {
  return plan === "FREE" || plan === "PRO" || plan === "BUSINESS" || plan === "ENTERPRISE"
}

/** Offre commerciale d'un plan technique éventuellement null (marketing sûr). */
export function getCommercialTierForPlan(plan: LicensePlan | null): CommercialTier | null {
  return isCommercialLicensePlan(plan) ? COMMERCIAL_TIERS[plan] : null
}

/* ========================================================================= */
/*  FIDÉLITÉ DetailFlow                                                       */
/* ========================================================================= */

/**
 * Plans éligibles au programme de fidélité. JAMAIS FREE (Essentiel).
 * Dérivé de `COMMERCIAL_TIERS` pour éviter toute divergence.
 */
export const LOYALTY_ELIGIBLE_PLANS: readonly CommercialLicensePlan[] = (
  Object.values(COMMERCIAL_TIERS) as CommercialTier[]
)
  .filter((t) => t.loyaltyEligible)
  .map((t) => t.licensePlan)

/** Plafond absolu de la remise fidélité : -20 % (jamais plus). */
export const LOYALTY_MAX_DISCOUNT_BASIS_POINTS = 2000

/**
 * Paliers d'ancienneté CONTINUE (ordre croissant).
 *   < 6 mois  ->  0 %
 *   ≥ 6 mois  -> -5 %
 *   ≥ 12 mois -> -10 %
 *   ≥ 18 mois -> -15 %
 *   ≥ 24 mois -> -17,5 %
 *   ≥ 30 mois -> -20 % (plafond, jamais dépassé)
 */
export const LOYALTY_TIERS: readonly LoyaltyTier[] = [
  { minMonths: 0, discountBasisPoints: 0 },
  { minMonths: 6, discountBasisPoints: 500 },
  { minMonths: 12, discountBasisPoints: 1000 },
  { minMonths: 18, discountBasisPoints: 1500 },
  { minMonths: 24, discountBasisPoints: 1750 },
  { minMonths: 30, discountBasisPoints: LOYALTY_MAX_DISCOUNT_BASIS_POINTS },
]

/**
 * Remise fidélité (en points de base) pour une ancienneté CONTINUE donnée.
 * PURE. Ne dépasse jamais le plafond absolu, quelle que soit l'ancienneté.
 * La remise porte UNIQUEMENT sur le prix de l'abonnement (jamais commissions,
 * frais Stripe, SMS, crédits ou services tiers — cf. `applyLoyaltyDiscount`).
 */
export function loyaltyDiscountBasisPoints(monthsContinuous: number): number {
  if (!Number.isFinite(monthsContinuous) || monthsContinuous < 0) return 0
  let bp = 0
  for (const tier of LOYALTY_TIERS) {
    if (monthsContinuous >= tier.minMonths) bp = tier.discountBasisPoints
  }
  return Math.min(bp, LOYALTY_MAX_DISCOUNT_BASIS_POINTS)
}

/**
 * Applique la remise fidélité au SEUL prix d'abonnement (centimes).
 * PURE. Arrondi à l'entier de centime le plus proche.
 */
export function applyLoyaltyDiscount(subscriptionCents: number, monthsContinuous: number): number {
  const bp = loyaltyDiscountBasisPoints(monthsContinuous)
  const discounted = subscriptionCents - (subscriptionCents * bp) / 10000
  return Math.round(discounted)
}

/**
 * Événements affectant l'ancienneté fidélité CONTINUE.
 *   CANCELLATION            : toute résiliation effective -> ancienneté à ZÉRO.
 *   PLAN_CHANGE_CONTINUOUS  : upgrade/downgrade SANS interruption -> conservée.
 *   PAYMENT_FAILURE_GRACE   : simple échec temporaire -> conservée (période de
 *                             grâce ; un échec bancaire n'est PAS une résiliation
 *                             volontaire). Modélisé dès maintenant, appliqué plus
 *                             tard par le lot Stripe.
 */
export type LoyaltyContinuityEvent = "CANCELLATION" | "PLAN_CHANGE_CONTINUOUS" | "PAYMENT_FAILURE_GRACE"

/**
 * Ancienneté fidélité résultante après un événement. PURE.
 * Une SEULE résiliation suffit à repartir de zéro : aucun palier n'est récupéré
 * si le client revient plus tard (nouvelle ancienneté à partir de zéro).
 */
export function nextLoyaltyTenureMonths(currentMonths: number, event: LoyaltyContinuityEvent): number {
  switch (event) {
    case "CANCELLATION":
      return 0
    case "PLAN_CHANGE_CONTINUOUS":
    case "PAYMENT_FAILURE_GRACE":
      return currentMonths
  }
}

/* ========================================================================= */
/*  DetailFlow LIFETIME                                                       */
/* ========================================================================= */

/** Nombre maximal de licences Lifetime (capacité totale, pas un faux compteur). */
export const LIFETIME_MAX_LICENSES = 50

/**
 * Offre Lifetime : paiement unique, aucun abonnement mensuel. Le périmètre
 * fonctionnel correspond à CROISSANCE / BUSINESS (JAMAIS FOUNDER, réservé aux
 * comptes internes). Le moteur de droits n'est PAS modifié dans ce lot :
 * `entitlementPlan` documente seulement le périmètre commercial visé.
 */
export const LIFETIME_OFFER = {
  billingMode: "LIFETIME" as BillingMode,
  /** Périmètre = droits BUSINESS (Croissance). Jamais FOUNDER. */
  entitlementPlan: "BUSINESS" as CommercialLicensePlan,
  /** Paiement comptant, en centimes : 1 290 € HT. */
  oneTimePriceCents: 129000,
  /** Paiement en 2 fois : 2 × 690 € HT. */
  installmentCount: 2,
  installmentAmountCents: 69000,
  /** Total en 2 fois : 1 380 € HT (plus cher que le comptant, affiché clairement). */
  installmentTotalCents: 138000,
  /** Aucune commission DetailFlow prévue sur les paiements Lifetime (frais Stripe restent dus). */
  fee: { basisPoints: 0, monthlyCapCents: 0 } as TransactionFeePolicy,
  /** 20 SMS de bienvenue (une seule fois). Aucun quota mensuel gratuit. */
  sms: { kind: "welcome_once", count: 20 } as SmsAllowance,
  maxLicenses: LIFETIME_MAX_LICENSES,
} as const

/* ========================================================================= */
/*  HELPERS DE FORMATAGE (affichage uniquement, déterministes)               */
/* ========================================================================= */

/** Regroupe les milliers avec une espace insécable : 1290 -> "1 290". */
function groupThousands(n: number): string {
  return Math.abs(Math.trunc(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0")
}

/**
 * Formate un montant en CENTIMES vers un libellé euro français.
 * Montant entier -> sans décimales ("1 290 €", "0 €") ; sinon 2 décimales
 * ("19,90 €"). Déterministe (indépendant de l'ICU), donc testable.
 */
export function formatEuroCents(cents: number): string {
  const neg = cents < 0
  const abs = Math.abs(Math.round(cents))
  const euros = Math.floor(abs / 100)
  const rem = abs % 100
  const intPart = groupThousands(euros)
  const body = rem === 0 ? intPart : `${intPart},${rem.toString().padStart(2, "0")}`
  return `${neg ? "-" : ""}${body} €`
}

/**
 * Formate des points de base en pourcentage français.
 * 200 -> "2 %", 100 -> "1 %", 50 -> "0,5 %", 25 -> "0,25 %", 1750 -> "17,5 %".
 */
export function formatBasisPointsPercent(basisPoints: number): string {
  const pct = basisPoints / 100
  const str = Number.isInteger(pct) ? pct.toString() : pct.toString().replace(".", ",")
  return `${str} %`
}

/**
 * Message commercial du plafond de commission d'une offre.
 * Ex. Essentiel : "2 % par paiement — plafonné à 19,90 € / mois".
 */
export function feeCapLabel(fee: TransactionFeePolicy): string {
  return `${formatBasisPointsPercent(fee.basisPoints)} par paiement — plafonné à ${formatEuroCents(
    fee.monthlyCapCents,
  )} / mois`
}

/** Message marketing de la dotation SMS d'une offre. */
export function smsAllowanceLabel(sms: SmsAllowance): string | null {
  switch (sms.kind) {
    case "none":
      return null
    case "welcome_once":
      return `${sms.count} SMS offerts au démarrage, puis à la consommation`
    case "monthly":
      return `${sms.count} SMS / mois inclus`
  }
}

/* ========================================================================= */
/*  TEXTES MARKETING (source unique du discours commercial)                  */
/* ========================================================================= */

/** Frais Stripe distincts, sans pourcentage hardcodé (le tarif peut évoluer). */
export const STRIPE_FEES_NOTE = "Frais Stripe applicables séparément."

/** SMS supplémentaires à la consommation. */
export const SMS_OVERAGE_NOTE = "Les SMS supplémentaires sont facturés à la consommation."

/** Explication transparente du plafond de commission. */
export const FEE_CAP_EXPLANATION =
  "Les frais DetailFlow sont plafonnés : même si votre activité augmente, ils ne dépassent jamais le plafond mensuel de votre formule."

/** Bloc fidélité présenté près des tarifs. */
export const LOYALTY_COPY = {
  title: "Votre fidélité est récompensée.",
  body:
    "Votre abonnement baisse automatiquement avec votre ancienneté : -5 % après 6 mois, jusqu'à -20 % après 30 mois d'abonnement continu.",
  resetNote: "En cas de résiliation, votre ancienneté et vos avantages fidélité repartent de zéro.",
} as const

/** Accroche du renvoi vers l'offre Lifetime, depuis la grille tarifaire. */
export const LIFETIME_TEASER = {
  hook: "Vous préférez payer une seule fois ?",
  subtitle: "Découvrez DetailFlow Lifetime.",
  cta: "Découvrir Lifetime",
} as const

/** Contenu de la card / modal Lifetime. */
export const LIFETIME_COPY = {
  name: "DetailFlow Lifetime",
  pitch: "Payez une seule fois. Utilisez DetailFlow sans abonnement mensuel.",
  oneTimeLabel: "paiement comptant",
  installmentNote: "Le paiement en deux fois revient plus cher.",
  licensesLabel: `${LIFETIME_MAX_LICENSES} licences Lifetime disponibles`,
  includedTitle: "Ce qui est inclus",
  included: [
    "Clients illimités",
    "Véhicules illimités",
    "Réservations",
    "Devis, factures & paiements",
    "CRM prospects",
    "Analyse avancée",
    "Marketing & automatisations",
    "Fidélisation & relances",
  ],
  excludedTitle: "Ce qui reste facturé séparément",
  excluded: [
    "Frais Stripe applicables",
    "SMS supplémentaires à la consommation",
    "Domaine éventuel à la charge du client",
    "Services tiers à la charge du client",
    "Futurs modules à coût spécifique (Centre, multi-employés…)",
  ],
  terms:
    "Accès à vie au socle DetailFlow et à ses évolutions. Les services tiers, consommations et certains futurs modules générant des coûts spécifiques peuvent être facturés séparément.",
  ownershipNote:
    "DetailFlow Lifetime est une licence d'utilisation : elle ne confère aucun droit de propriété sur le code, l'infrastructure ou la technologie DetailFlow.",
  /** CTA HONNÊTE : n'encaisse pas tant que le lot paiement Lifetime n'est pas livré. */
  cta: {
    label: "Demander mon accès",
    href: "mailto:contact@detailflow.fr?subject=DetailFlow%20Lifetime",
  },
} as const
