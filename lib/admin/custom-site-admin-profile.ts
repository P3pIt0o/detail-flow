/**
 * L102 — « profil d'admin » des sites sur mesure : ce qui est masqué, et pourquoi.
 *
 * Données PURES. La clé est toujours le `customSiteKey` du tenant authentifié,
 * lu côté serveur (jamais le slug ni une valeur venant du navigateur).
 * Masquer n'enlève rien : données, actions serveur et droits par offre restent
 * identiques. Une clé absente d'ici a un profil vide (rien ne change).
 *
 * Les lots qui ajoutent un élément à l'admin (carte digitale, tableau de bord,
 * paramètres) doivent consulter ce fichier.
 */

type Hidden<K extends string> = { [P in K]: string } & { reason: string }

export type CustomSiteAdminProfile = {
  /** Pages absentes du menu ; l'adresse directe renvoie à l'accueil des paramètres. */
  hiddenRoutes: readonly Hidden<"route">[]
  /** Sous-onglets des paramètres absents (même redirection). */
  hiddenSettingsTabs: readonly Hidden<"tab">[]
  /** Étapes « Vos premiers pas » retirées. */
  hiddenOnboardingSteps: readonly Hidden<"step">[]
  /** Boutons et cartes pour partager le lien ou intégrer le widget. */
  hideShareActions: boolean
  /** Textes d'en-tête, autres sections et ordre des sections du modèle standard. */
  hideStandardSiteContent: boolean
}

const EMPTY_PROFILE: CustomSiteAdminProfile = {
  hiddenRoutes: [],
  hiddenSettingsTabs: [],
  hiddenOnboardingSteps: [],
  hideShareActions: false,
  hideStandardSiteContent: false,
}

const CLEANYZER_PROFILE: CustomSiteAdminProfile = {
  hiddenRoutes: [
    { route: "/admin/page-publique", reason: "Son site est sur mesure : la page standard n'est pas utilisée." },
    { route: "/admin/ma-reservation", reason: "Lien, QR code et widget : la réservation est déjà sur son site." },
    { route: "/admin/site-personnalise", reason: "Il a déjà son site sur mesure." },
  ],
  hiddenSettingsTabs: [
    { tab: "gallery", reason: "La galerie de la page standard n'est jamais lue par son site." },
    { tab: "digital-card", reason: "Carte digitale : lien et QR code à partager, masqués comme les autres partages." },
  ],
  hiddenOnboardingSteps: [{ step: "publicSite", reason: "Demande un texte que son site n'affiche jamais." }],
  // Partage et widget : le site est terminé, la réservation y est déjà intégrée.
  hideShareActions: true,
  // Textes d'en-tête, autres sections, ordre : jamais lus par son site.
  hideStandardSiteContent: true,
}

// `Map` : une clé comme « constructor » ne remonte jamais un objet hérité.
const PROFILES = new Map<string, CustomSiteAdminProfile>([["cleanyzer", CLEANYZER_PROFILE]])

export function getCustomSiteAdminProfile(customSiteKey: string | null | undefined): CustomSiteAdminProfile {
  return PROFILES.get(customSiteKey ?? "") ?? EMPTY_PROFILE
}

/** Phrase invitant à partager son lien : rien quand le partage est masqué. */
export function visibleShareHint(customSiteKey: string | null | undefined, hint: string | undefined): string | undefined {
  return getCustomSiteAdminProfile(customSiteKey).hideShareActions ? undefined : hint
}

export function isAdminRouteHidden(customSiteKey: string | null | undefined, route: string): boolean {
  return getCustomSiteAdminProfile(customSiteKey).hiddenRoutes.some((h) => h.route === route)
}

export function isSettingsTabHidden(customSiteKey: string | null | undefined, tab: string | null | undefined): boolean {
  return getCustomSiteAdminProfile(customSiteKey).hiddenSettingsTabs.some((h) => h.tab === tab)
}
