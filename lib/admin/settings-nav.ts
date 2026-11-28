import {
  Building2,
  CalendarClock,
  Globe,
  CreditCard,
  MessageSquare,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react"
import { withTenant } from "@/lib/tenant-link"
import { getCustomSiteAdminProfile, isSettingsTabHidden } from "@/lib/admin/custom-site-admin-profile"

/**
 * Organisation des Paramètres (L97) : « Mes prestations et prix » (écran à part)
 * et 5 catégories à onglets, puis « Mon compte ».
 *
 * Chaque catégorie regroupe des sous-sections identifiées par la valeur d'onglet
 * HISTORIQUE (`tab`). Ces valeurs sont INCHANGÉES : les anciens liens `?tab=...`
 * et les liens du panneau d'onboarding continuent d'ouvrir la bonne sous-section.
 * Seul l'acompte a quitté `planning` pour `deposit` (voir `legacySettingsRedirect`).
 * Correspondance complète : docs/audits/L97-correspondance.md.
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
    label: "Mon entreprise",
    description: "Qui vous êtes et où vous intervenez.",
    icon: Building2,
    subTabs: [
      { value: "business", label: "Coordonnées" },
      { value: "travel", label: "Lieu" },
    ],
  },
  {
    id: "reservations",
    label: "Mes disponibilités",
    description: "Quand vos clients peuvent réserver.",
    icon: CalendarClock,
    subTabs: [
      { value: "hours", label: "Horaires" },
      { value: "timeoff", label: "Congés" },
      { value: "planning", label: "Créneaux" },
    ],
  },
  {
    id: "site",
    label: "Ma page de réservation",
    description: "Ce que vos clients voient avant de réserver.",
    icon: Globe,
    subTabs: [
      { value: "site", label: "Contenu du site" },
      { value: "appearance", label: "Apparence" },
      { value: "gallery", label: "Galerie" },
      { value: "reviews", label: "Avis" },
      { value: "custom-requests", label: "Demandes spéciales" },
      { value: "digital-card", label: "Carte digitale" },
    ],
  },
  {
    id: "billing",
    label: "Paiements et factures",
    description: "Comment vous êtes payé et ce qui figure sur vos factures.",
    icon: CreditCard,
    subTabs: [
      { value: "deposit", label: "Acompte" },
      { value: "payments", label: "Paiements" },
      { value: "invoicing", label: "Facturation" },
      { value: "promo", label: "Codes promo" },
    ],
  },
  {
    id: "communications",
    label: "Messages aux clients",
    description: "Les rappels et demandes d'avis envoyés automatiquement.",
    icon: MessageSquare,
    subTabs: [
      { value: "sms", label: "Rappels SMS" },
      { value: "notifications", label: "Rappels & avis" },
    ],
  },
  {
    id: "account",
    label: "Mon compte",
    description: "Votre connexion, vos données et vos demandes d'aide.",
    icon: ShieldCheck,
    subTabs: [
      { value: "security", label: "Sécurité" },
      { value: "data", label: "Mes données" },
      { value: "support", label: "Assistance" },
    ],
  },
]

/** Toutes les valeurs d'onglet valides (pour valider un `?tab=` entrant). */
export const ALL_SETTINGS_TABS: string[] = SETTINGS_CATEGORIES.flatMap((c) =>
  c.subTabs.map((t) => t.value),
)

/**
 * Sous-onglets masqués POUR LE TENANT SPIRIT ACS UNIQUEMENT (site 100 %
 * personnalisé). Aucune route/donnée n'est supprimée : ces réglages restent
 * disponibles pour tous les autres detailers et réactivables plus tard.
 * - hours/timeoff/planning/travel : Spirit fonctionne en demande → devis,
 *   sans moteur de réservation standard.
 * - deposit/payments : aucun paiement/acompte encaissé pendant le parcours public.
 * - promo : aucun parcours Spirit ne consomme de code promo.
 * - appearance : couleurs sans effet sur le shell custom.
 */
const SPIRIT_ACS_HIDDEN_TABS = new Set([
  "hours",
  "timeoff",
  "planning",
  "travel",
  "deposit",
  "payments",
  "promo",
  "appearance",
  // Demandes : les options métier (types, CTA, activation) restent verrouillées
  // pour Spirit. Les seuls textes éditables (titre/description) passent par
  // « Textes du site ». L'action serveur est également protégée.
  "custom-requests",
])

/**
 * Renommage de sous-onglets POUR SPIRIT ACS UNIQUEMENT. La valeur technique
 * historique (`tab=`) est conservée : seuls les libellés changent. Ici, l'onglet
 * « site » devient « Textes du site » (il n'expose plus les réglages standard).
 */
const SPIRIT_ACS_TAB_LABELS: Record<string, string> = {
  site: "Textes du site",
}

/**
 * Seuls onglets de « Site public » conservés en `booking_only` : outils utiles même sans
 * vitrine DetailFlow (page /demande, carte digitale à partager).
 */
const BOOKING_ONLY_SITE_TABS = new Set(["custom-requests", "digital-card"])

/**
 * Catégories visibles pour un tenant.
 *
 * - Standard (`customSiteKey` nul/autre, intention nulle) : liste complète
 *   inchangée (aucune régression pour les tenants historiques et public_page).
 * - Spirit ACS : sous-onglets masqués retirés, et toute catégorie devenue vide
 *   (« Mes disponibilités ») disparaît de l'accueil.
 * - `booking_only` : le professionnel a déjà son site ; DetailFlow ne fournit
 *   que le moteur de réservation. La catégorie « Ma page de réservation » est réduite aux
 *   sous-onglets de BOOKING_ONLY_SITE_TABS (demandes spéciales, carte digitale) ;
 *   contenu, apparence, galerie et avis (réglages de VITRINE) restent masqués.
 *   Aucune donnée n'est supprimée, aucune route n'est retirée.
 *
 * `onboardingIntent` doit être l'intention DÉJÀ RÉSOLUE (`resolveDashboardIntent`),
 * donc null pour tout site 100 % personnalisé → priorité au comportement custom.
 */
export function getVisibleSettingsCategories(
  customSiteKey: string | null | undefined,
  onboardingIntent?: string | null,
): SettingsCategory[] {
  if (customSiteKey === "spirit-acs") {
    return SETTINGS_CATEGORIES.map((c) => ({
      ...c,
      subTabs: c.subTabs
        .filter((t) => !SPIRIT_ACS_HIDDEN_TABS.has(t.value))
        .map((t) => (SPIRIT_ACS_TAB_LABELS[t.value] ? { ...t, label: SPIRIT_ACS_TAB_LABELS[t.value] } : t)),
    })).filter((c) => c.subTabs.length > 0)
  }

  if (onboardingIntent === "booking_only") {
    // Widget : seuls les outils à partager sont utiles (page /demande, carte digitale).
    return SETTINGS_CATEGORIES.map((c) =>
      c.id === "site" ? { ...c, subTabs: c.subTabs.filter((t) => BOOKING_ONLY_SITE_TABS.has(t.value)) } : c,
    )
  }

  // L102 : sous-onglets masqués par le profil du site sur mesure (profil vide => liste intacte).
  if (getCustomSiteAdminProfile(customSiteKey).hiddenSettingsTabs.length === 0) return SETTINGS_CATEGORIES
  return SETTINGS_CATEGORIES.map((c) => ({
    ...c,
    subTabs: c.subTabs.filter((t) => !isSettingsTabHidden(customSiteKey, t.value)),
  })).filter((c) => c.subTabs.length > 0)
}

/**
 * Retourne la catégorie contenant l'onglet donné, ou null si inconnu.
 * Respecte le masquage tenant : un onglet masqué (Spirit, ou catégorie « Site
 * public » pour booking_only) renvoie null, ce qui ramène l'utilisateur à la
 * grille d'accueil des paramètres.
 */
export function findCategoryByTab(
  tab: string | undefined | null,
  customSiteKey?: string | null,
  onboardingIntent?: string | null,
): SettingsCategory | null {
  if (!tab) return null
  return (
    getVisibleSettingsCategories(customSiteKey, onboardingIntent).find((c) =>
      c.subTabs.some((t) => t.value === tab),
    ) ?? null
  )
}

/**
 * Raccourcis de « Mon entreprise » vers le SIREN/TVA et les logos, réglés dans
 * d'autres écrans. Même masquage tenant que les onglets visés.
 */
export function getBusinessLinks(
  customSiteKey: string | null | undefined,
  onboardingIntent?: string | null,
): { label: string; href: string }[] {
  const link = (label: string, tab: string, bloc: string) => ({
    label,
    href: `/admin/parametres?tab=${tab}&bloc=${bloc}`,
  })
  const links = [
    link("SIREN, statut et TVA (factures)", "invoicing", "reglage-invoicing"),
    link("Logo des factures", "invoicing", "reglage-logo-factures"),
  ]
  // Logo du site : sans effet sur Spirit, et vitrine masquée pour booking_only.
  if (customSiteKey !== "spirit-acs" && findCategoryByTab("site", customSiteKey, onboardingIntent)) {
    links.push(link("Logo de votre site", "site", "reglage-logo-site"))
  }
  return links
}

export type SettingsHomeEntry = {
  id: string
  label: string
  /** Lien sans `?tenant=` (ajouté par l'appelant via `withTenant`). */
  href: string
}

/**
 * Accueil des Paramètres : les entrées principales et « Mon compte », avec le
 * même masquage tenant que les onglets (et que le menu pour « Mes prestations »).
 */
export function getSettingsHome(
  customSiteKey: string | null | undefined,
  onboardingIntent?: string | null,
): { main: SettingsHomeEntry[]; account: SettingsHomeEntry[] } {
  const main: SettingsHomeEntry[] = []
  const account: SettingsHomeEntry[] = []
  const tabHref = (tab: string) => `/admin/parametres?tab=${tab}`

  for (const c of getVisibleSettingsCategories(customSiteKey, onboardingIntent)) {
    if (c.id === "account") {
      for (const t of c.subTabs) account.push({ id: t.value, label: t.label, href: tabHref(t.value) })
    } else {
      main.push({ id: c.id, label: c.label, href: tabHref(c.subTabs[0].value) })
    }
  }

  if (customSiteKey !== "spirit-acs") {
    // Juste après « Mon entreprise ».
    main.splice(1, 0, { id: "services", label: "Mes prestations et prix", href: "/admin/prestations" })
  }
  // Abonnement : avant l'assistance.
  const support = account.findIndex((e) => e.id === "support")
  account.splice(support < 0 ? account.length : support, 0, {
    id: "subscription",
    label: "Abonnement",
    href: "/admin/abonnement",
  })

  return { main, account }
}

/**
 * Anciennes adresses dont le contenu a changé d'onglet. Seul cas : l'acompte,
 * autrefois un bloc de `planning`. Renvoie null si l'adresse reste valable.
 */
export function legacySettingsRedirect(params: { tab?: string; bloc?: string; tenant?: string }): string | null {
  if (params.tab !== "planning" || params.bloc !== "reglage-acompte") return null
  return withTenant("/admin/parametres?tab=deposit&bloc=reglage-acompte", params.tenant ?? null)
}
