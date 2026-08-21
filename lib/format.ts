/**
 * Utilitaires de formatage (montants, durées, dates) — France / EUR.
 * Les montants sont manipulés en CENTIMES partout dans l'app.
 */

const eur = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
})

/** 7900 -> "79,00 €" */
export function formatPrice(cents: number): string {
  return eur.format(cents / 100)
}

/**
 * Formate un montant en CENTIMES dans la devise d'UNE facture (LOT 2B.1).
 *
 * - `cents` : montant en centimes (aucun calcul, aucune conversion FX).
 * - `currencyCode` : code ISO 4217 de LA FACTURE (invoices.currencyCode).
 *
 * Rétrocompat legacy : currencyCode NULL/vide => affichage EUR (VISUEL
 * uniquement, la DB n'est jamais modifiée). Un code non vide mais invalide
 * n'est jamais transformé silencieusement en EUR : on affiche un fallback sûr
 * "123,45 XYZ" plutôt que de mentir sur la devise. Locale fr-FR (UI actuelle).
 */
/**
 * Code devise à AFFICHER dans un label de saisie (ex. "P.U. (CHF)"). Usage
 * strictement visuel : NULL/vide => "EUR" legacy, sinon trim + majuscules.
 * Ne modifie jamais la devise réelle, aucune conversion FX.
 */
export function getDisplayCurrencyCode(currencyCode?: string | null): string {
  return (currencyCode ?? "").trim().toUpperCase() || "EUR"
}

export function formatMoney(cents: number, currencyCode?: string | null): string {
  const amount = cents / 100
  const code = (currencyCode ?? "").trim().toUpperCase()
  // Legacy : pas de devise snapshotée => comportement historique EUR.
  if (!code) return eur.format(amount)
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: code }).format(amount)
  } catch {
    // Code ISO inconnu/invalide : ne pas planter, ne pas prétendre corriger.
    return `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)} ${code}`
  }
}

/** 150 -> "2 h 30", 60 -> "1 h", 45 -> "45 min" */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`
}

/** 12.4 -> "12,4 km" */
export function formatKm(km: number): string {
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(km)} km`
}

/** "2026-01-15" ou Date -> "jeudi 15 janvier 2026" */
export function formatDateLong(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date + "T00:00:00") : date
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d)
}

/** "2026-01-15" ou Date -> "15 janv. 2026" */
export function formatDateShort(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date + "T00:00:00") : date
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d)
}

/** "2026-01" -> "janv. 2026" (pour les graphiques) */
export function formatMonthLabel(ym: string): string {
  const d = new Date(ym + "-01T00:00:00")
  return new Intl.DateTimeFormat("fr-FR", { month: "short", year: "2-digit" }).format(d)
}
