import { findCategoryByTab } from "@/lib/admin/settings-nav"

/**
 * Index ÉCRIT EN DUR de la recherche « Rechercher un réglage » (aucun appel serveur,
 * aucune donnée tenant). Chaque entrée vise un bloc précis de la page des Paramètres
 * (`id` = `bloc`, sinon `reglage-<onglet>`). Si ce bloc n'est pas affiché pour le
 * tenant (ex. frais de déplacement en atelier seul), on arrive en haut de l'onglet.
 */
export type SettingsSearchEntry = {
  label: string
  tab: string
  /** `id` du bloc visé dans l'onglet (défaut : `reglage-<onglet>`). */
  bloc?: string
  /** Mots et synonymes que le detailer peut taper. */
  words: string
  /** Réglage du modèle de site standard : sans effet sur le site 100 % personnalisé Spirit ACS. */
  standardOnly?: boolean
}

export const SETTINGS_SEARCH: SettingsSearchEntry[] = [
  { label: "Nom et coordonnées", tab: "business", words: "nom entreprise societe telephone mobile email e-mail mail contact" },
  { label: "Horaires d'ouverture", tab: "hours", words: "horaires heures jours semaine ouverture disponibilites travail" },
  { label: "Congés et fermetures", tab: "timeoff", words: "conges vacances fermeture absence repos indisponibilite" },
  { label: "Créneaux et délai de réservation", tab: "planning", bloc: "reglage-creneaux", words: "creneaux planning capacite vehicules par jour intervalle delai preavis pause rendez-vous" },
  { label: "Acompte", tab: "planning", bloc: "reglage-acompte", words: "acompte acomptes arrhes avance pourcentage paiement reservation" },
  { label: "Mode vacances", tab: "planning", bloc: "reglage-vacances", words: "vacances pause fermer reservations message" },
  { label: "Atelier ou à domicile", tab: "travel", words: "lieu atelier domicile mobile adresse intervention zone" },
  { label: "Frais de déplacement", tab: "travel", bloc: "reglage-frais-deplacement", words: "deplacement frais kilometres km distance maximale rayon prix aller retour" },
  { label: "Contenu du site", tab: "site", words: "site page vitrine titre texte presentation" },
  { label: "Logo de votre site", tab: "site", bloc: "reglage-logo-site", words: "logo image marque identite", standardOnly: true },
  { label: "Réseaux sociaux", tab: "site", bloc: "reglage-reseaux", words: "reseaux sociaux instagram facebook tiktok liens" },
  { label: "Conditions générales de vente", tab: "site", bloc: "reglage-cgv", words: "cgv conditions generales vente" },
  { label: "Apparence et couleurs", tab: "appearance", words: "apparence couleurs couleur theme style" },
  { label: "Galerie de photos", tab: "gallery", words: "galerie photos images realisations avant apres vehicules" },
  { label: "Avis des clients", tab: "reviews", words: "avis google etoiles temoignages notes" },
  { label: "Demandes spéciales", tab: "custom-requests", words: "demandes speciales devis sur mesure formulaire" },
  { label: "Paiements en ligne", tab: "payments", words: "paiement carte bancaire stripe encaisser encaissement commission virement" },
  { label: "Factures et mentions légales", tab: "invoicing", words: "facture facturation devis siret iban bic mentions legales echeance" },
  { label: "Logo des factures", tab: "invoicing", bloc: "reglage-logo-factures", words: "logo facture factures devis image" },
  { label: "TVA", tab: "invoicing", bloc: "reglage-tva", words: "tva taxe taux exoneration 293b" },
  { label: "Codes promo", tab: "promo", words: "promo promotion remise reduction code bon" },
  { label: "Rappels par SMS", tab: "sms", words: "sms rappel message texto credits recharge" },
  { label: "Rappels par e-mail et demande d'avis", tab: "notifications", words: "rappel email e-mail mail demande avis notification" },
  { label: "Mot de passe et sécurité", tab: "security", words: "mot de passe securite connexion compte" },
  { label: "Télécharger mes données", tab: "data", words: "donnees export exporter telecharger sauvegarde zip csv" },
  { label: "Aide et support", tab: "support", words: "aide support probleme question contacter assistance" },
]

/**
 * Écrans hors Paramètres proposés par la recherche (même masquage que le menu :
 * Mes prestations n'existe pas pour Spirit ACS).
 */
const SCREEN_SEARCH = [
  {
    label: "Mes prestations",
    href: "/admin/prestations",
    category: "Mon activité",
    tabLabel: "Prestations et prix",
    words: "prix tarifs tarif prestation prestations forfaits services duree",
    hiddenFor: "spirit-acs",
  },
] as const

export const SETTINGS_SEARCH_EMPTY = "Aucun réglage trouvé. Essayez un autre mot."

/** Adresse d'un résultat : onglet + bloc précis à mettre en évidence. */
export function settingsSearchHref(tab: string, bloc?: string): string {
  return `/admin/parametres?tab=${tab}&bloc=${bloc ?? `reglage-${tab}`}`
}

export type SettingsSearchResult = {
  label: string
  href: string
  /** Catégorie des Paramètres (ou rubrique de « Plus »). */
  category: string
  /** Onglet dans la catégorie. */
  tabLabel: string
  /** Onglet visé (absent pour un écran hors Paramètres). */
  tab?: string
}

/** Libellé secondaire d'un résultat : « catégorie · onglet ». */
export function settingsResultContext(r: Pick<SettingsSearchResult, "category" | "tabLabel">): string {
  return r.tabLabel && r.tabLabel !== r.category ? `${r.category} · ${r.tabLabel}` : r.category
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()

/**
 * Entrées correspondant à la saisie (tous les mots doivent y figurer), limitées
 * aux onglets visibles pour CE tenant (mêmes règles que la page des Paramètres).
 */
export function searchSettings(
  query: string,
  customSiteKey?: string | null,
  onboardingIntent?: string | null,
): SettingsSearchResult[] {
  const terms = norm(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return []
  const matches = (text: string) => {
    const haystack = norm(text)
    return terms.every((t) => haystack.includes(t))
  }
  const out: SettingsSearchResult[] = []
  // Les écrans d'abord : « prix » doit mener à Mes prestations avant les frais.
  for (const screen of SCREEN_SEARCH) {
    if (customSiteKey === screen.hiddenFor) continue
    if (!matches(`${screen.label} ${screen.words}`)) continue
    out.push({ label: screen.label, href: screen.href, category: screen.category, tabLabel: screen.tabLabel })
  }
  for (const entry of SETTINGS_SEARCH) {
    if (entry.standardOnly && customSiteKey === "spirit-acs") continue
    const category = findCategoryByTab(entry.tab, customSiteKey, onboardingIntent)
    if (!category) continue
    const tabLabel = category.subTabs.find((t) => t.value === entry.tab)?.label ?? ""
    // Un bloc précis ne se cherche pas par le nom de son onglet (« Planning & acompte »
    // ferait sortir Créneaux et Mode vacances quand on tape « acompte »).
    if (!matches(`${entry.label} ${entry.bloc ? "" : tabLabel} ${entry.words}`)) continue
    out.push({
      label: entry.label,
      href: settingsSearchHref(entry.tab, entry.bloc),
      category: category.label,
      tabLabel,
      tab: entry.tab,
    })
  }
  // Les résultats dont le TITRE correspond passent en premier (tri stable).
  return out.sort((a, b) => Number(matches(b.label)) - Number(matches(a.label)))
}
