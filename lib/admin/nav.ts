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
  | "leads"
  | "factures"
  | "clients"
  | "prestations"
  | "produits"
  | "analyse"
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
    { href: "/admin/leads", label: "Prospects", icon: "leads" },
    { href: "/admin/factures", label: "Factures", icon: "factures" },
    { href: "/admin/clients", label: "Clients", icon: "clients" },
    { href: "/admin/prestations", label: "Prestations", icon: "prestations" },
    { href: "/admin/produits", label: "Produits", icon: "produits" },
    { href: "/admin/analyse", label: "Analyse", icon: "analyse" },
    webNavItem(opts.intent),
    { href: "/admin/parametres", label: "Paramètres", icon: "settings" },
  ]

  if (opts.customSiteKey === "spirit-acs") {
    return nav.filter((item) => !SPIRIT_ACS_HIDDEN_NAV.has(item.href))
  }
  return nav
}

/* ------------------------------------------------------------------------- */
/*  Présentation groupée (refonte UX du shell admin).                         */
/*                                                                            */
/*  Les fonctions ci-dessous ne changent NI les routes, NI la logique         */
/*  d'éligibilité (Spirit ACS, parcours web) : elles réutilisent              */
/*  `buildAdminNav` et se contentent de REGROUPER et de RENOMMER les libellés */
/*  affichés pour un vocabulaire plus proche du métier. Les libellés de       */
/*  l'entrée « web » (`webNavItem`) restent inchangés.                        */
/* ------------------------------------------------------------------------- */

/** Groupe visuel de la navigation (titre discret + entrées). */
export type AdminNavGroup = { id: string; label: string; items: AdminNavItem[] }

/**
 * Libellés d'AFFICHAGE plus naturels, indexés par route. Ne renomme jamais la
 * route ni l'entrée « web ». Toute route absente conserve son libellé d'origine.
 */
const ADMIN_NAV_DISPLAY_LABEL: Readonly<Record<string, string>> = {
  "/admin": "Accueil",
  "/admin/calendrier": "Planning",
  "/admin/reservations": "Rendez-vous",
  "/admin/factures": "Devis & factures",
}

/** Rattachement route → groupe métier. L'entrée « web » est traitée à part. */
const ADMIN_NAV_GROUP_OF: Readonly<Record<string, string>> = {
  "/admin": "quotidien",
  "/admin/calendrier": "quotidien",
  "/admin/reservations": "quotidien",
  "/admin/demandes": "quotidien",
  "/admin/leads": "quotidien",
  "/admin/clients": "quotidien",
  "/admin/prestations": "gestion",
  "/admin/produits": "gestion",
  "/admin/factures": "gestion",
  "/admin/analyse": "gestion",
  "/admin/parametres": "reglages",
}

const ADMIN_NAV_GROUP_LABELS: Readonly<Record<string, string>> = {
  quotidien: "Quotidien",
  gestion: "Gestion",
  enligne: "En ligne",
  reglages: "Réglages",
}

const ADMIN_NAV_GROUP_ORDER = ["quotidien", "gestion", "enligne", "reglages"] as const

/** Applique le libellé d'affichage naturel si défini pour cette route. */
function withDisplayLabel(item: AdminNavItem): AdminNavItem {
  const label = ADMIN_NAV_DISPLAY_LABEL[item.href]
  return label ? { ...item, label } : item
}

/** Routes de l'entrée « web » (mutuellement exclusives selon le parcours). */
const WEB_HREFS = new Set<string>(["/admin/ma-reservation", "/admin/page-publique"])

/**
 * Construit la navigation GROUPÉE du shell admin. Réutilise strictement
 * `buildAdminNav` (même filtrage Spirit ACS, même entrée web) puis répartit les
 * entrées en groupes lisibles. Les groupes vides sont omis.
 */
export function buildAdminNavGroups(opts: {
  intent: OnboardingIntentValue | null
  customSiteKey: string | null
}): AdminNavGroup[] {
  const flat = buildAdminNav(opts).map(withDisplayLabel)
  const buckets = new Map<string, AdminNavItem[]>()
  for (const item of flat) {
    const groupId = WEB_HREFS.has(item.href) ? "enligne" : (ADMIN_NAV_GROUP_OF[item.href] ?? "gestion")
    const list = buckets.get(groupId) ?? []
    list.push(item)
    buckets.set(groupId, list)
  }
  const groups: AdminNavGroup[] = []
  for (const id of ADMIN_NAV_GROUP_ORDER) {
    const items = buckets.get(id)
    if (items && items.length > 0) groups.push({ id, label: ADMIN_NAV_GROUP_LABELS[id], items })
  }
  return groups
}

/** Ordre de priorité des entrées de la barre mobile (routes réellement présentes). */
const MOBILE_PRIMARY_ORDER = [
  "/admin",
  "/admin/calendrier",
  "/admin/reservations",
  "/admin/demandes",
  "/admin/clients",
] as const

/**
 * Entrées PRINCIPALES de la barre de navigation mobile (max 4), sélectionnées
 * parmi celles réellement disponibles pour ce tenant/parcours. Le 5ᵉ emplacement
 * de la barre est réservé au bouton « Plus » (géré par le shell).
 */
export function buildMobilePrimaryNav(opts: {
  intent: OnboardingIntentValue | null
  customSiteKey: string | null
}): AdminNavItem[] {
  const flat = buildAdminNav(opts).map(withDisplayLabel)
  const byHref = new Map(flat.map((i) => [i.href, i] as const))
  const primary: AdminNavItem[] = []
  for (const href of MOBILE_PRIMARY_ORDER) {
    const item = byHref.get(href)
    if (item) primary.push(item)
    if (primary.length === 4) break
  }
  return primary
}
