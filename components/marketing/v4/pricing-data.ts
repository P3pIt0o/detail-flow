/**
 * Données d'affichage du comparateur de fonctionnalités (marketing only).
 *
 * Ce fichier décrit le PÉRIMÈTRE COMMERCIAL de chaque niveau. Essentiel et
 * Indépendant sont `self_serve` dans `lib/pricing/plans.ts` : leurs colonnes
 * doivent refléter le backend réel (PLAN_MATRIX + gardes serveur). Performance
 * et Équipe sont `coming_soon` (trajectoire produit, CTA « Bientôt disponible »).
 *
 * `true`  = inclus dans la formule ·  `false` = non inclus
 * Les colonnes suivent l'ordre de `COMMERCIAL_PLANS` : Essentiel, Indépendant, Performance, Équipe.
 */

export type PlanColumn = "starter" | "pro" | "ultime" | "entreprise"

export const COMPARE_COLUMNS: { id: PlanColumn; name: string }[] = [
  { id: "starter", name: "Essentiel" },
  { id: "pro", name: "Indépendant" },
  { id: "ultime", name: "Performance" },
  { id: "entreprise", name: "Équipe" },
]

export type CompareRow = {
  label: string
  values: Record<PlanColumn, boolean>
  /** Courte description utilisateur (volet « Voir toutes les fonctionnalités »). Purement informative. */
  description?: string
  /** Libellé court dans les cards, quand `label` mentionne une limite propre à une autre offre. */
  cardLabel?: string
  /** Limite affichée dans la card d'une offre (reflète PLAN_MATRIX, n'en crée aucune). */
  notes?: Partial<Record<PlanColumn, string>>
}

export type CompareCategory = {
  name: string
  rows: CompareRow[]
}

const all = { starter: true, pro: true, ultime: true, entreprise: true }
const proUp = { starter: false, pro: true, ultime: true, entreprise: true }
const ultimeUp = { starter: false, pro: false, ultime: true, entreprise: true }
const entrepriseOnly = { starter: false, pro: false, ultime: false, entreprise: true }

export const COMPARE_CATEGORIES: CompareCategory[] = [
  {
    name: "Réservation",
    rows: [
      {
        label: "Lien de réservation à partager",
        values: all,
        description: "Partagez votre module par lien sur Instagram, Google, WhatsApp ou votre site.",
      },
      {
        label: "Réservation en ligne",
        values: all,
        description: "Vos clients choisissent leur prestation, leur véhicule, la date et l’heure disponibles.",
      },
      // Aucune FeatureKey ne différencie FREE et PRO sur ces fonctions côté serveur.
      {
        label: "Tarif & durée selon le véhicule",
        values: all,
        description: "Adaptez automatiquement le prix et le temps nécessaire selon le type de véhicule.",
      },
      {
        label: "Options & suppléments",
        values: all,
        description: "Proposez des options complémentaires directement pendant la réservation.",
      },
      {
        label: "Codes promo",
        values: all,
        description: "Créez des codes promotionnels et appliquez automatiquement la remise.",
      },
      {
        label: "Demandes personnalisées",
        values: all,
        description: "Recevez les demandes qui nécessitent un devis ou une prestation sur mesure.",
      },
    ],
  },
  {
    name: "Clients",
    rows: [
      {
        label: "Fiches clients & véhicules",
        values: all,
        description: "Centralisez les coordonnées clients et les informations de leurs véhicules.", notes: { starter: "Jusqu'à 5 clients", pro: "Illimité" },
      },
      {
        label: "Historique des prestations",
        values: all,
        description: "Retrouvez les rendez-vous et prestations associés à chaque client.",
      },
      {
        label: "Leads / CRM prospects",
        values: ultimeUp,
        description: "Suivez vos prospects, leur statut et les actions commerciales à effectuer.",
      },
      // PLAN_MATRIX.FREE inclut `customer_subscriptions`.
      {
        label: "Abonnements clients récurrents",
        values: all,
        description: "Créez et gérez des formules d’entretien récurrentes pour vos propres clients.",
      },
    ],
  },
  {
    name: "Paiements",
    rows: [
      // PLAN_MATRIX.FREE inclut `online_payments` (commission Connect, hors frais Stripe).
      {
        label: "Acompte en ligne",
        values: all,
        description: "Demandez un acompte lors de la réservation pour sécuriser le rendez-vous.",
      },
      {
        label: "Paiement intégral en ligne",
        values: all,
        description: "Permettez au client de régler entièrement sa prestation en ligne.",
      },
      {
        label: "Suivi des paiements",
        values: all,
        description: "Suivez les paiements et leur statut directement depuis DetailFlow.",
      },
    ],
  },
  {
    name: "Facturation",
    rows: [
      // FREE : 3 devis / 3 factures par mois (limites serveur) ; illimité dès PRO.
      {
        label: "Devis (3/mois en Essentiel)",
        values: all,
        description: "Créez et suivez vos devis. Essentiel est limité à 3 devis par mois.", cardLabel: "Devis", notes: { starter: "3 devis / mois", pro: "Illimité" },
      },
      {
        label: "Factures (3/mois en Essentiel)",
        values: all,
        description: "Créez vos factures depuis DetailFlow. Essentiel est limité à 3 factures par mois.", cardLabel: "Factures", notes: { starter: "3 factures / mois", pro: "Illimité" },
      },
      // createCreditNote / issueCreditNote : aucune FeatureKey dédiée côté serveur.
      {
        label: "Avoirs",
        values: all,
        description: "Gérez les corrections et remboursements avec des avoirs liés à vos documents.",
      },
    ],
  },
  {
    name: "Analyse",
    rows: [
      {
        label: "Tableau de bord",
        values: all,
        description: "Gardez une vue synthétique sur votre activité.",
      },
      {
        label: "Statistiques de base",
        values: proUp,
        description: "Suivez les indicateurs essentiels de votre activité.",
      },
      {
        label: "Chiffre d'affaires & panier moyen",
        values: ultimeUp,
        description: "Analysez votre chiffre d’affaires, votre volume de rendez-vous et votre panier moyen.",
      },
      {
        label: "Analyse avancée & répartition du CA",
        values: ultimeUp,
        description: "Comprenez quelles prestations génèrent le plus de chiffre d’affaires.",
      },
      {
        label: "Statistiques par employé",
        values: entrepriseOnly,
        description: "Analysez l’activité et les performances par collaborateur.",
      },
    ],
  },
  {
    name: "Marketing",
    rows: [
      {
        label: "Rappels de rendez-vous automatiques",
        values: proUp,
        description: "Recevez automatiquement un rappel avant les rendez-vous confirmés.",
      },
      {
        label: "Demandes d'avis Google",
        values: proUp,
        description: "Invitez automatiquement vos clients à laisser un avis après une prestation terminée.",
      },
      {
        label: "SMS",
        values: ultimeUp,
        description: "Communiquez avec vos clients grâce aux notifications SMS disponibles dans les offres concernées.",
      },
      {
        label: "Campagnes & relances clients",
        values: ultimeUp,
        description: "Automatisez certaines relances et actions de fidélisation.",
      },
    ],
  },
  {
    name: "Site internet",
    rows: [
      {
        label: "Page professionnelle",
        values: all,
        description: "Disposez d’une page DetailFlow personnalisable pour présenter votre activité et prendre des réservations.",
      },
      {
        label: "Domaine personnalisé",
        values: ultimeUp,
        description: "Utilisez votre propre nom de domaine avec votre présence DetailFlow lorsque cette fonctionnalité est disponible.",
      },
    ],
  },
  {
    name: "Équipe",
    rows: [
      {
        label: "Comptes employés",
        values: entrepriseOnly,
        description: "Ajoutez plusieurs collaborateurs dans le même espace.",
      },
      {
        label: "Agenda par collaborateur",
        values: entrepriseOnly,
        description: "Gérez les disponibilités et le planning de chaque membre de l’équipe.",
      },
      {
        label: "Rendez-vous simultanés",
        values: entrepriseOnly,
        description: "Acceptez plusieurs rendez-vous au même horaire lorsque plusieurs collaborateurs sont disponibles.",
      },
      {
        label: "Permissions & rôles",
        values: entrepriseOnly,
        description: "Définissez ce que chaque collaborateur peut consulter ou modifier.",
      },
    ],
  },
]

export type PlanFeatureItem = { label: string; description?: string; note?: string }
export type PlanFeatureGroup = { name: string; items: PlanFeatureItem[] }

/**
 * Détail des fonctionnalités d'UNE offre, DÉRIVÉ de `COMPARE_CATEGORIES`
 * (aucune seconde matrice) : seules les lignes `values[planId] === true`.
 */
export function getPlanFeatureGroups(planId: PlanColumn): PlanFeatureGroup[] {
  return COMPARE_CATEGORIES.map((cat) => ({
    name: cat.name,
    items: cat.rows
      .filter((row) => row.values[planId] === true)
      .map((row) => ({
        label: row.cardLabel ?? row.label,
        description: row.description,
        note: row.notes?.[planId],
      })),
  })).filter((group) => group.items.length > 0)
}
