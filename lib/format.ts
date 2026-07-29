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
