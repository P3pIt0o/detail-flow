export type PublicationFlags = {
  customSitePublished: boolean
  bookingLinkEnabled: boolean
}

/**
 * Valeurs appliquées quand la colonne est absente (migration non appliquée)
 * ou illisible : site personnalisé publié (comportement historique), lien de
 * réservation FERMÉ (activation explicite obligatoire).
 */
export const DEFAULT_PUBLICATION_FLAGS: PublicationFlags = {
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
