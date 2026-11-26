import { findCategoryByTab } from "@/lib/admin/settings-nav"

/**
 * Index ÉCRIT EN DUR de la recherche « Rechercher un réglage » (aucun appel serveur,
 * aucune donnée tenant). Le bloc visé dans la page des Paramètres porte l'`id`
 * `reglage-<onglet>`.
 */
export type SettingsSearchEntry = {
  label: string
  tab: string
  /** Mots et synonymes que le detailer peut taper. */
  words: string
  /** Réglage du modèle de site standard : sans effet sur le site 100 % personnalisé Spirit ACS. */
  standardOnly?: boolean
}

export const SETTINGS_SEARCH: SettingsSearchEntry[] = [
  { label: "Nom et coordonnées", tab: "business", words: "nom entreprise societe telephone mobile email e-mail mail contact" },
  { label: "Horaires d'ouverture", tab: "hours", words: "horaires heures jours semaine ouverture disponibilites travail" },
  { label: "Congés et fermetures", tab: "timeoff", words: "conges vacances fermeture absence repos indisponibilite" },
  { label: "Créneaux et délai de réservation", tab: "planning", words: "creneaux planning capacite vehicules par jour intervalle delai preavis pause rendez-vous" },
  { label: "Acompte", tab: "planning", words: "acompte arrhes avance pourcentage paiement reservation" },
  { label: "Mode vacances", tab: "planning", words: "vacances pause fermer reservations message" },
  { label: "Atelier ou à domicile", tab: "travel", words: "lieu atelier domicile mobile adresse intervention zone" },
  { label: "Frais de déplacement", tab: "travel", words: "deplacement frais kilometres km distance maximale rayon prix aller retour" },
  { label: "Contenu du site", tab: "site", words: "site page vitrine titre texte presentation" },
  { label: "Logo de votre site", tab: "site", words: "logo image marque identite", standardOnly: true },
  { label: "Réseaux sociaux et conditions de vente", tab: "site", words: "reseaux sociaux instagram facebook tiktok cgv conditions" },
  { label: "Apparence et couleurs", tab: "appearance", words: "apparence couleurs couleur theme style" },
  { label: "Galerie de photos", tab: "gallery", words: "galerie photos images realisations avant apres vehicules" },
  { label: "Avis des clients", tab: "reviews", words: "avis google etoiles temoignages notes" },
  { label: "Demandes spéciales", tab: "custom-requests", words: "demandes speciales devis sur mesure formulaire" },
  { label: "Paiements en ligne", tab: "payments", words: "paiement carte bancaire stripe encaisser encaissement commission virement" },
  { label: "Factures et mentions légales", tab: "invoicing", words: "logo facture facturation devis tva siret iban bic mentions legales echeance" },
  { label: "Codes promo", tab: "promo", words: "promo promotion remise reduction code bon" },
  { label: "Rappels par SMS", tab: "sms", words: "sms rappel message texto credits recharge" },
  { label: "Rappels par e-mail et demande d'avis", tab: "notifications", words: "rappel email e-mail mail demande avis notification" },
  { label: "Mot de passe et sécurité", tab: "security", words: "mot de passe securite connexion compte" },
  { label: "Télécharger mes données", tab: "data", words: "donnees export exporter telecharger sauvegarde zip csv" },
  { label: "Aide et support", tab: "support", words: "aide support probleme question contacter assistance" },
]

export const SETTINGS_SEARCH_EMPTY = "Aucun réglage trouvé. Essayez un autre mot."

export function settingsSearchHref(tab: string): string {
  return `/admin/parametres?tab=${tab}&bloc=reglage-${tab}`
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
): (SettingsSearchEntry & { category: string })[] {
  const terms = norm(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return []
  const out: (SettingsSearchEntry & { category: string })[] = []
  for (const entry of SETTINGS_SEARCH) {
    if (entry.standardOnly && customSiteKey === "spirit-acs") continue
    const category = findCategoryByTab(entry.tab, customSiteKey, onboardingIntent)
    if (!category) continue
    const tabLabel = category.subTabs.find((t) => t.value === entry.tab)?.label ?? ""
    const haystack = norm(`${entry.label} ${tabLabel} ${entry.words}`)
    if (terms.every((t) => haystack.includes(t))) out.push({ ...entry, category: category.label })
  }
  return out
}
