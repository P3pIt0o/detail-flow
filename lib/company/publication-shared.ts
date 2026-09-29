export type PublicationFlags = {
  customSitePublished: boolean
  bookingLinkEnabled: boolean
}

/**
 * Défaut OPT-IN (migration appliquée) : ligne absente ou valeur illisible =>
 * rien n'est publié. Identique au DEFAULT false des deux colonnes.
 */
export const DEFAULT_PUBLICATION_FLAGS: PublicationFlags = {
  customSitePublished: false,
  bookingLinkEnabled: false,
}

/**
 * Uniquement tant que les colonnes n'existent pas (migration non appliquée) :
 * reproduit le comportement historique (site personnalisé servi d'après
 * customSiteKey) pour ne pas couper Spirit ACS. Lien /book toujours FERMÉ.
 */
export const PRE_MIGRATION_PUBLICATION_FLAGS: PublicationFlags = {
  customSitePublished: true,
  bookingLinkEnabled: false,
}

/** Statuts d'entreprise autorisés à exposer un lien public (liste blanche). */
const BOOKING_LINK_ALLOWED_STATUSES = new Set(["BETA", "ACTIVE"])

/** Lien /book accessible uniquement si activé ET entreprise ni suspendue ni archivée. */
export function isBookingLinkAccessible(status: string | null | undefined, flags: PublicationFlags): boolean {
  return flags.bookingLinkEnabled === true && BOOKING_LINK_ALLOWED_STATUSES.has(String(status ?? "").toUpperCase())
}

export function bookingLinkPath(slug: string): string {
  return `/book/${encodeURIComponent(slug)}`
}

/** URL absolue du lien /book/{slug} sur `origin` (ex. https://www.detailflow.fr). */
export function bookingLinkUrl(slug: string, origin: string): string {
  return `${origin.replace(/\/+$/, "")}${bookingLinkPath(slug)}`
}

/**
 * Section « Réservation en ligne » de Page publique pour un site personnalisé.
 * Indépendante de customSitePublished. Spirit ACS exclu (parcours devis dédié).
 */
export function showsCustomSiteBookingAdmin(customSiteKey: string | null | undefined): boolean {
  return Boolean(customSiteKey) && customSiteKey !== "spirit-acs"
}

/**
 * Sites personnalisés conservant le tunnel de réservation historique
 * (BookingWizard). Exception ciblée par customSiteKey, jamais par
 * customSitePublished : publier/dépublier un site ne change pas le moteur.
 */
const LEGACY_BOOKING_WIZARD_SITE_KEYS = new Set(["spirit-acs", "rozan"])

export function usesLegacyBookingWizard(customSiteKey: string | null | undefined): boolean {
  return LEGACY_BOOKING_WIZARD_SITE_KEYS.has(String(customSiteKey ?? "").trim())
}

/**
 * Widget (?embed=1) d'un tenant à site personnalisé : fermé tant que le lien
 * de réservation n'est pas publié. Tenants standards : inchangé (non bloqué).
 */
export function isEmbedBlocked(
  customSiteKey: string | null | undefined,
  status: string | null | undefined,
  flags: PublicationFlags,
): boolean {
  return Boolean(String(customSiteKey ?? "").trim()) && !isBookingLinkAccessible(status, flags)
}

/** Normalise une ligne SQL brute ; toute valeur non booléenne => défaut. */
export function toPublicationFlags(row: Record<string, unknown> | undefined | null): PublicationFlags {
  if (!row) return { ...DEFAULT_PUBLICATION_FLAGS }
  return {
    customSitePublished:
      typeof row.customSitePublished === "boolean"
        ? row.customSitePublished
        : DEFAULT_PUBLICATION_FLAGS.customSitePublished,
    bookingLinkEnabled:
      typeof row.bookingLinkEnabled === "boolean"
        ? row.bookingLinkEnabled
        : DEFAULT_PUBLICATION_FLAGS.bookingLinkEnabled,
  }
}
