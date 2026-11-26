import type { OnboardingIntentValue } from "@/lib/onboarding/intent"
import { usesLegacyBookingWizard } from "@/lib/company/publication-shared"
import { findCategoryByTab } from "@/lib/admin/settings-nav"

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
  | "abonnements"
  | "prestations"
  | "produits"
  | "offres"
  | "analyse"
  | "reservationLink"
  | "web"
  | "settings"
  | "billing"

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
  /** `companies.bookingDistributionMode` : "widget" masque « Page publique » (la route reste servie). */
  bookingDistributionMode?: string | null
}): AdminNavItem[] {
  const nav = baseAdminNav(opts)
  if (opts.bookingDistributionMode === "widget") {
    return nav.filter((item) => item.href !== "/admin/page-publique")
  }
  return nav
}

function baseAdminNav(opts: { intent: OnboardingIntentValue | null; customSiteKey: string | null }): AdminNavItem[] {
  const nav: AdminNavItem[] = [
    { href: "/admin", label: "Tableau de bord", icon: "dashboard" },
    { href: "/admin/calendrier", label: "Calendrier", icon: "calendar" },
    { href: "/admin/reservations", label: "Réservations", icon: "reservations" },
    { href: "/admin/demandes", label: "Demandes", icon: "demandes" },
    { href: "/admin/leads", label: "Prospects", icon: "leads" },
    { href: "/admin/factures", label: "Factures", icon: "factures" },
    { href: "/admin/clients", label: "Clients", icon: "clients" },
    { href: "/admin/abonnements-clients", label: "Abonnements clients", icon: "abonnements" },
    { href: "/admin/prestations", label: "Prestations", icon: "prestations" },
    { href: "/admin/produits", label: "Produits", icon: "produits" },
    { href: "/admin/offres", label: "Offres & réductions", icon: "offres" },
    { href: "/admin/analyse", label: "Analyse", icon: "analyse" },
    webNavItem(opts.intent),
    { href: "/admin/parametres", label: "Paramètres", icon: "settings" },
    { href: "/admin/abonnement", label: "Mon abonnement", icon: "billing" },
  ]

  // L21 : offres automatiques indisponibles pour les tunnels historiques (Spirit ACS, Rozan).
  const withOffers = usesLegacyBookingWizard(opts.customSiteKey) ? nav.filter((item) => item.href !== "/admin/offres") : nav
  if (opts.customSiteKey === "spirit-acs") {
    return withOffers.filter((item) => !SPIRIT_ACS_HIDDEN_NAV.has(item.href))
  }
  return withOffers
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
  "/admin/abonnements-clients": "gestion",
  "/admin/prestations": "gestion",
  "/admin/produits": "gestion",
  "/admin/offres": "gestion",
  "/admin/factures": "gestion",
  "/admin/analyse": "gestion",
  "/admin/parametres": "reglages",
  "/admin/abonnement": "reglages",
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

/**
 * Libellés LONGS réservés à la navigation groupée (sidebar desktop + menu
 * « Plus »). La barre mobile principale garde le libellé court pour sa mise en
 * page.
 */
const ADMIN_NAV_GROUPED_LABEL: Readonly<Record<string, string>> = {
  "/admin/demandes": "Demandes spéciales",
}

function withGroupedLabel(item: AdminNavItem): AdminNavItem {
  const label = ADMIN_NAV_GROUPED_LABEL[item.href]
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
  bookingDistributionMode?: string | null
}): AdminNavGroup[] {
  const flat = buildAdminNav(opts).map(withDisplayLabel).map(withGroupedLabel)
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

/* ------------------------------------------------------------------------- */
/*  L77 — navigation « Aujourd'hui · Agenda · (+) · Clients · Plus ».         */
/*  Les liens métier viennent toujours de `buildAdminNav` (mêmes règles).     */
/* ------------------------------------------------------------------------- */

export type MainNavIcon = AdminNavIcon | "today" | "more" | "export" | "reviews"

export type MainNavItem = { href: string; label: string; icon: MainNavIcon }

export type PlusItem = MainNavItem & {
  hint?: string
  /** Téléchargement de fichier : lien classique, jamais de navigation client. */
  download?: boolean
}

export type PlusGroup = { id: "activite" | "connaitre" | "reglages"; label: string; items: PlusItem[] }

/** Entrées principales (barre mobile et haut du menu ordinateur), communes à tous. */
export function buildMainNav(): MainNavItem[] {
  return [
    { href: "/admin", label: "Aujourd'hui", icon: "today" },
    { href: "/admin/calendrier", label: "Agenda", icon: "calendar" },
    { href: "/admin/clients", label: "Clients", icon: "clients" },
    { href: "/admin/plus", label: "Plus", icon: "more" },
  ]
}

/** Rubriques de la page « Plus » (reprises telles quelles par le menu ordinateur). */
export function buildPlusGroups(opts: {
  intent: OnboardingIntentValue | null
  customSiteKey: string | null
  bookingDistributionMode?: string | null
  /** Droit d'export lu côté serveur (OWNER/ADMIN/super-admin, comme la route `/admin/export`). Défaut : oui. */
  canExport?: boolean
}): PlusGroup[] {
  const byHref = new Map(buildAdminNav(opts).map((i) => [i.href, i] as const))
  const fromNav = (href: string, label?: string, hint?: string): PlusItem[] => {
    const item = byHref.get(href)
    return item ? [{ ...item, label: label ?? item.label, hint }] : []
  }
  const settingsTab = (tab: string, label: string, icon: MainNavIcon, hint: string): PlusItem[] =>
    findCategoryByTab(tab, opts.customSiteKey, opts.intent)
      ? [{ href: `/admin/parametres?tab=${tab}`, label, icon, hint }]
      : []

  const groups: PlusGroup[] = [
    {
      id: "activite",
      label: "Mon activité",
      items: [
        ...fromNav("/admin/prestations", "Mes prestations", "Vos prestations et leurs prix"),
        ...fromNav("/admin/produits"),
        ...fromNav("/admin/factures", "Devis & factures", "Devis, factures et encaissements"),
        ...(opts.canExport === false
          ? []
          : [{ href: "/admin/export", label: "Export de vos données", icon: "export" as const, download: true }]),
        ...fromNav("/admin/reservations", "Tous les rendez-vous"),
        ...fromNav("/admin/analyse", "Statistiques"),
        ...fromNav("/admin/demandes", "Demandes spéciales"),
        ...fromNav("/admin/leads"),
        ...fromNav("/admin/abonnements-clients"),
      ],
    },
    {
      id: "connaitre",
      label: "Me faire connaître",
      items: [
        ...fromNav(webNavItem(opts.intent).href),
        ...fromNav("/admin/offres"),
        ...settingsTab("reviews", "Avis clients", "reviews", "Les avis affichés sur votre page"),
        // Un tenant au site 100 % personnalisé l'a déjà : pas de proposition en double.
        ...(opts.customSiteKey
          ? []
          : [{ href: "/admin/site-personnalise", label: "Site personnalisé", icon: "web" as const }]),
      ],
    },
    {
      id: "reglages",
      label: "Réglages",
      items: [
        ...settingsTab("payments", "Paiements en ligne", "billing", "Carte bancaire et acomptes"),
        ...fromNav("/admin/parametres", "Tous les réglages"),
        ...fromNav("/admin/abonnement"),
      ],
    },
  ]
  return groups.filter((g) => g.items.length > 0)
}

/** Même règle que la route `/admin/export` (qui garde son 403). */
export function canExportData(ctx: { role: string | null | undefined; isSuperAdmin?: boolean }): boolean {
  return ctx.role === "OWNER" || ctx.role === "ADMIN" || Boolean(ctx.isSuperAdmin)
}

/** « Itinéraire » : seulement pour un detailer qui se déplace (réglage « Lieu »). */
export function showDirections(config: { mobileEnabled: boolean }): boolean {
  return config.mobileEnabled
}
