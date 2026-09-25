/**
 * Données d'affichage du comparateur de fonctionnalités (marketing only).
 *
 * Ce fichier décrit le PÉRIMÈTRE COMMERCIAL de chaque niveau (ce que la formule
 * inclura). Les offres payantes étant `coming_soon` dans `lib/pricing/plans.ts`,
 * ce tableau communique la trajectoire produit ; la note de bas de section et
 * les CTA « Bientôt disponible » évitent toute promesse d'activation immédiate.
 *
 * `true`  = inclus dans la formule ·  `false` = non inclus
 * Les colonnes suivent l'ordre de `COMMERCIAL_PLANS` : Starter, Pro, Ultime, Entreprise.
 */

export type PlanColumn = "starter" | "pro" | "ultime" | "entreprise"

export const COMPARE_COLUMNS: { id: PlanColumn; name: string }[] = [
  { id: "starter", name: "Starter" },
  { id: "pro", name: "Pro" },
  { id: "ultime", name: "Ultime" },
  { id: "entreprise", name: "Entreprise" },
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
      { label: "Tarif & durée selon le véhicule", values: proUp },
      { label: "Options & suppléments", values: proUp },
      { label: "Codes promo", values: proUp },
      { label: "Liste d'attente", values: proUp },
      { label: "Demandes personnalisées", values: proUp },
    ],
  },
  {
    name: "Clients",
    rows: [
      { label: "Fiches clients & véhicules", values: all },
      { label: "Historique des prestations", values: all },
      { label: "Photos clients / véhicules", values: ultimeUp },
      { label: "Leads / CRM prospects", values: ultimeUp },
      { label: "Abonnements clients récurrents", values: ultimeUp },
    ],
  },
  {
    name: "Paiements",
    rows: [
      { label: "Acompte en ligne", values: proUp },
      { label: "Paiement intégral en ligne", values: proUp },
      { label: "Suivi des paiements", values: proUp },
    ],
  },
  {
    name: "Facturation",
    rows: [
      { label: "Devis", values: ultimeUp },
      { label: "Factures", values: ultimeUp },
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
