/**
 * Données d'affichage du comparateur de fonctionnalités (marketing only).
 *
 * Ce fichier décrit le PÉRIMÈTRE COMMERCIAL de chaque niveau (ce que la formule
 * inclut / inclura). Les noms publics proviennent de la source unique
 * `lib/pricing/commercial-rules.ts` (Essentiel, Indépendant, Croissance, Centre)
 * pour ne jamais diverger du reste du marketing.
 *
 * Valeur d'une cellule :
 *   true       = inclus dans la formule
 *   false      = non inclus
 *   "upcoming" = fonctionnalité À VENIR (jamais présentée comme disponible)
 *
 * Les colonnes suivent l'ordre : Essentiel, Indépendant, Croissance, Centre.
 * Les identifiants de colonne (`starter`, `pro`, `ultime`, `entreprise`) restent
 * stables et internes ; seuls les libellés affichés changent.
 */

import { PUBLIC_PLAN_NAME } from "@/lib/pricing/commercial-rules"

export type PlanColumn = "starter" | "pro" | "ultime" | "entreprise"

/** Cellule : incluse, non incluse, ou à venir (module non encore développé). */
export type CompareValue = boolean | "upcoming"

export const COMPARE_COLUMNS: { id: PlanColumn; name: string }[] = [
  { id: "starter", name: PUBLIC_PLAN_NAME.FREE },
  { id: "pro", name: PUBLIC_PLAN_NAME.PRO },
  { id: "ultime", name: PUBLIC_PLAN_NAME.BUSINESS },
  { id: "entreprise", name: PUBLIC_PLAN_NAME.ENTERPRISE },
]

export type CompareRow = {
  label: string
  values: Record<PlanColumn, CompareValue>
}

export type CompareCategory = {
  name: string
  rows: CompareRow[]
}

const all: Record<PlanColumn, CompareValue> = { starter: true, pro: true, ultime: true, entreprise: true }
const proUp: Record<PlanColumn, CompareValue> = { starter: false, pro: true, ultime: true, entreprise: true }
const ultimeUp: Record<PlanColumn, CompareValue> = { starter: false, pro: false, ultime: true, entreprise: true }
/** Réservé au Centre, mais module d'équipe NON encore développé : « À venir ». */
const centreUpcoming: Record<PlanColumn, CompareValue> = {
  starter: false,
  pro: false,
  ultime: false,
  entreprise: "upcoming",
}

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
      { label: "Statistiques par employé", values: centreUpcoming },
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
      { label: "Comptes employés", values: centreUpcoming },
      { label: "Agenda par collaborateur", values: centreUpcoming },
      { label: "Rendez-vous simultanés", values: centreUpcoming },
      { label: "Permissions & rôles", values: centreUpcoming },
    ],
  },
]
