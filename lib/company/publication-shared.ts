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
