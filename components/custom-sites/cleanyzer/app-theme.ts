/**
 * Habillage « nuit néon » des pages Cleanyzer rendues hors de son shell (réservation BookingV2,
 * demande de devis) — L37. Le layout `app/(site)` pose cette classe d'après le site sur mesure
 * RÉSOLU CÔTÉ SERVEUR (`resolveCustomSite()`), jamais d'après l'URL ou le navigateur. BookingV2 et
 * le formulaire de devis, communs à tous les tenants, ne sont pas modifiés : seules les couleurs du
 * thème standard sont redéfinies sous cette classe (app-theme.css).
 */
export function clzAppThemeClass(customSiteKey: string | null | undefined): "clz-app-theme" | undefined {
  return customSiteKey === "cleanyzer" ? "clz-app-theme" : undefined
}
