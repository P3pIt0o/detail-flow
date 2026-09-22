import type { OnboardingIntentValue } from "@/lib/onboarding/intent"

/**
 * Construction du menu admin — SOURCE DE VÉRITÉ pure (sans I/O, sans JSX).
 *
 * Le choix d'onboarding (`companies.onboardingIntent`, déjà résolu par
 * `resolveDashboardIntent`) détermine DURABLEMENT l'expérience web de l'espace
 * pro. Les modules MÉTIER (calendrier, réservations, clients, prestations,
 * produits, factures, paramètres) sont COMMUNS aux deux parcours et ne changent
 * jamais. Seule l'entrée « web » diffère :
 *
 *   - booking_only  → « Ma réservation » (moteur + lien partageable + widget).
 *                     L'éditeur de site vitrine n'est PAS proposé.
 *   - public_page   → « Mon site » (éditeur du site vitrine DetailFlow).
 *   - null / custom_website / site personnalisé → « Page publique » (libellé
 *                     et cible historiques, STRICTEMENT inchangés).
 *
 * Aucune route n'est supprimée : `/admin/page-publique` reste servie pour tous.
 * On ne fait que choisir quel lien afficher — jamais retirer une capacité.
 */

/** Clé d'icône (mappée vers un composant lucide côté client). */
export type AdminNavIcon =
  | "dashboard"
  | "calendar"
  | "reservations"
  | "demandes"
  | "factures"
  | "clients"
  | "prestations"
  | "produits"
  | "reservationLink"
  | "web"
  | "settings"

export type AdminNavItem = {
  href: string
  label: string
  icon: AdminNavIcon
}

/**
 * Entrées masquées POUR SPIRIT ACS UNIQUEMENT (site 100 % personnalisé, parcours
 * demande → devis). Les routes/modules restent intacts et disponibles pour tous
 * les autres tenants — seuls les liens disparaissent de SA navigation.
 */
export const SPIRIT_ACS_HIDDEN_NAV = new Set<string>([
  "/admin/reservations",
  "/admin/prestations",
  "/admin/produits",
])

/** Entrée « web » selon le parcours (voir doc du module). */
export function webNavItem(intent: OnboardingIntentValue | null): AdminNavItem {
  if (intent === "booking_only") {
    return { href: "/admin/ma-reservation", label: "Ma réservation", icon: "reservationLink" }
  }
  if (intent === "public_page") {
    return { href: "/admin/page-publique", label: "Mon site", icon: "web" }
  }
  // null (legacy), custom_website, sites personnalisés → historique inchangé.
  return { href: "/admin/page-publique", label: "Page publique", icon: "web" }
}

/**
 * Construit la liste ORDONNÉE des entrées du menu admin.
 *
 * @param intent         intention résolue (`resolveDashboardIntent`) ou null.
 * @param customSiteKey  clé de site personnalisé (Spirit ACS…) ou null.
 */
export function buildAdminNav(opts: {
  intent: OnboardingIntentValue | null
  customSiteKey: string | null
}): AdminNavItem[] {
  const nav: AdminNavItem[] = [
    { href: "/admin", label: "Tableau de bord", icon: "dashboard" },
    { href: "/admin/calendrier", label: "Calendrier", icon: "calendar" },
    { href: "/admin/reservations", label: "Réservations", icon: "reservations" },
    { href: "/admin/demandes", label: "Demandes", icon: "demandes" },
    { href: "/admin/factures", label: "Factures", icon: "factures" },
    { href: "/admin/clients", label: "Clients", icon: "clients" },
    { href: "/admin/prestations", label: "Prestations", icon: "prestations" },
    { href: "/admin/produits", label: "Produits", icon: "produits" },
    webNavItem(opts.intent),
    { href: "/admin/parametres", label: "Paramètres", icon: "settings" },
  ]

  if (opts.customSiteKey === "spirit-acs") {
    return nav.filter((item) => !SPIRIT_ACS_HIDDEN_NAV.has(item.href))
  }
  return nav
}
