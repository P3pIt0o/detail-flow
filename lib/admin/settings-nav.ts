import {
  Building2,
  CalendarClock,
  Globe,
  CreditCard,
  MessageSquare,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react"

/**
 * Organisation des Paramètres en 6 catégories.
 *
 * Chaque catégorie regroupe des sous-sections identifiées par la valeur d'onglet
 * HISTORIQUE (`tab`). Ces valeurs sont INCHANGÉES : les anciens liens `?tab=...`
 * et les liens du panneau d'onboarding continuent d'ouvrir la bonne sous-section.
 *
 * Module de DONNÉES pures (aucun hook, aucun accès réseau) : importable aussi
 * bien côté serveur (page) que client (grille de cartes).
 */

export type SettingsSubTab = {
  /** Valeur d'onglet historique, préservée pour la compatibilité des liens. */
  value: string
  label: string
}

export type SettingsCategory = {
  id: string
  label: string
  description: string
  icon: LucideIcon
  subTabs: SettingsSubTab[]
}

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  {
    id: "entreprise",
    label: "Entreprise",
    description: "Les informations principales de votre entreprise et votre identité visuelle.",
    icon: Building2,
    subTabs: [{ value: "business", label: "Coordonnées" }],
  },
  {
    id: "reservations",
    label: "Réservations",
    description: "Configurez vos disponibilités et le fonctionnement de vos rendez-vous.",
    icon: CalendarClock,
    subTabs: [
      { value: "hours", label: "Horaires" },
      { value: "timeoff", label: "Congés" },
      { value: "planning", label: "Planning & acompte" },
      { value: "travel", label: "Déplacement" },
    ],
  },
  {
    id: "site",
    label: "Site public",
    description: "Personnalisez les informations visibles par vos clients.",
    icon: Globe,
    subTabs: [
      { value: "site", label: "Contenu du site" },
      { value: "appearance", label: "Apparence" },
      { value: "gallery", label: "Galerie" },
      { value: "reviews", label: "Avis" },
      { value: "custom-requests", label: "Demandes" },
    ],
  },
  {
    id: "billing",
    label: "Paiements et facturation",
    description: "Préparez vos paiements et vos documents de facturation.",
    icon: CreditCard,
    subTabs: [
      { value: "payments", label: "Paiements" },
      { value: "invoicing", label: "Facturation" },
      { value: "promo", label: "Codes promo" },
    ],
  },
  {
    id: "communications",
    label: "Communications",
    description: "Gérez les messages et rappels envoyés automatiquement à vos clients.",
    icon: MessageSquare,
    subTabs: [
      { value: "sms", label: "Rappels SMS" },
      { value: "notifications", label: "Rappels & avis" },
    ],
  },
  {
    id: "account",
    label: "Compte et assistance",
    description: "Gérez votre compte, vos données et vos demandes d'aide.",
    icon: ShieldCheck,
    subTabs: [
      { value: "security", label: "Sécurité" },
      { value: "data", label: "Mes données" },
      { value: "support", label: "Support" },
    ],
  },
]

/** Toutes les valeurs d'onglet valides (pour valider un `?tab=` entrant). */
export const ALL_SETTINGS_TABS: string[] = SETTINGS_CATEGORIES.flatMap((c) =>
  c.subTabs.map((t) => t.value),
)

/** Retourne la catégorie contenant l'onglet donné, ou null si inconnu. */
export function findCategoryByTab(tab: string | undefined | null): SettingsCategory | null {
  if (!tab) return null
  return SETTINGS_CATEGORIES.find((c) => c.subTabs.some((t) => t.value === tab)) ?? null
}
