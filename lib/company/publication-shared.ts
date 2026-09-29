export type PublicationFlags = {
  customSitePublished: boolean
  bookingLinkEnabled: boolean
}

/** Valeurs historiques (avant migration) : site publié, lien actif. */
export const DEFAULT_PUBLICATION_FLAGS: PublicationFlags = {
  customSitePublished: true,
  bookingLinkEnabled: true,
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
