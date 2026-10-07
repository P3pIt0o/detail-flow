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
      { label: "Lien de réservation à partager", values: all },
      { label: "Réservation en ligne", values: all },
      // Aucune FeatureKey ne différencie FREE et PRO sur ces fonctions côté serveur.
      { label: "Tarif & durée selon le véhicule", values: all },
      { label: "Options & suppléments", values: all },
      { label: "Codes promo", values: all },
      { label: "Demandes personnalisées", values: all },
    ],
  },
  {
    name: "Clients",
    rows: [
      { label: "Fiches clients & véhicules", values: all },
      { label: "Historique des prestations", values: all },
      { label: "Photos clients / véhicules", values: ultimeUp },
      { label: "Leads / CRM prospects", values: ultimeUp },
      // PLAN_MATRIX.FREE inclut `customer_subscriptions`.
      { label: "Abonnements clients récurrents", values: all },
    ],
  },
  {
    name: "Paiements",
    rows: [
      // PLAN_MATRIX.FREE inclut `online_payments` (commission Connect, hors frais Stripe).
      { label: "Acompte en ligne", values: all },
      { label: "Paiement intégral en ligne", values: all },
      { label: "Suivi des paiements", values: all },
    ],
  },
  {
    name: "Facturation",
    rows: [
      // FREE : 3 devis / 3 factures par mois (limites serveur) ; illimité dès PRO.
      { label: "Devis (3/mois en Essentiel)", values: all },
      { label: "Factures (3/mois en Essentiel)", values: all },
      { label: "Avoirs", values: ultimeUp },
    ],
  },
  {
    name: "Analyse",
    rows: [
      { label: "Tableau de bord", values: all },
      { label: "Statistiques de base", values: proUp },
      { label: "Chiffre d'affaires & panier moyen", values: ultimeUp },
      { label: "Analyse avancée & répartition du CA", values: ultimeUp },
      { label: "Statistiques par employé", values: entrepriseOnly },
    ],
  },
  {
    name: "Marketing",
    rows: [
      { label: "Rappels de rendez-vous automatiques", values: proUp },
      { label: "Demandes d'avis Google", values: proUp },
      { label: "SMS", values: ultimeUp },
      { label: "Campagnes & relances clients", values: ultimeUp },
    ],
  },
  {
    name: "Site internet",
    rows: [
      { label: "Page professionnelle", values: all },
      { label: "Site personnalisé", values: proUp },
      { label: "Domaine personnalisé", values: ultimeUp },
    ],
  },
  {
    name: "Équipe",
    rows: [
      { label: "Comptes employés", values: entrepriseOnly },
      { label: "Agenda par collaborateur", values: entrepriseOnly },
      { label: "Rendez-vous simultanés", values: entrepriseOnly },
      { label: "Permissions & rôles", values: entrepriseOnly },
    ],
  },
]
