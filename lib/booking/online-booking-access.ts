/**
 * Règle PURE d'ouverture de la réservation en ligne d'un tenant résolu côté
 * serveur. Mêmes critères que `createBookingAction` (tenantAcceptsBookings +
 * licence `online_booking`) afin que la page publique et l'action ne puissent
 * jamais diverger.
 */
export function isOnlineBookingOpen(
  tenant: { status?: string | null; bookingMode?: string | null } | null | undefined,
  hasOnlineBookingFeature: boolean,
): boolean {
  if (!tenant) return false
  const status = String(tenant.status ?? "").toUpperCase()
  if (status === "SUSPENDED" || status === "ARCHIVED") return false
  if (tenant.bookingMode === "DISABLED") return false
  return hasOnlineBookingFeature
}
