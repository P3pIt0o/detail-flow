/**
 * Module Analyse — PÉRIODES & COMPARAISON (fonctions PURES, aucune dépendance
 * base/serveur). Testable unitairement.
 *
 * Les dates sont manipulées au format `YYYY-MM-DD`. Le « jour courant » est la
 * DATE MÉTIER du tenant, résolue dans SON fuseau (`companies.timezone`) via
 * `businessToday()` — et non en UTC. Ainsi, à 00h30 à Paris, le module utilise
 * déjà le nouveau jour français même si UTC est encore la veille. Les bornes de
 * période sont ensuite calculées en arithmétique de calendrier pure sur cette
 * date métier (aucune heure, aucun fuseau à ce stade).
 */

export const ANALYSE_PERIODS = ["30d", "3m", "6m", "12m", "year"] as const
export type AnalysePeriod = (typeof ANALYSE_PERIODS)[number]
export const DEFAULT_PERIOD: AnalysePeriod = "30d"

/** Libellés courts pour le sélecteur (français simple, sans jargon). */
export const PERIOD_LABELS: Record<AnalysePeriod, string> = {
  "30d": "30 jours",
  "3m": "3 mois",
  "6m": "6 mois",
  "12m": "12 mois",
  year: "Cette année",
}

/** Valide STRICTEMENT une valeur d'URL. Toute valeur inconnue → 30 jours. */
export function parsePeriod(v: unknown): AnalysePeriod {
  return typeof v === "string" && (ANALYSE_PERIODS as readonly string[]).includes(v)
    ? (v as AnalysePeriod)
    : DEFAULT_PERIOD
}

/** Intervalle de dates inclusif `YYYY-MM-DD`. */
export type DateRange = { start: string; end: string }
export type Granularity = "day" | "month"

export type ResolvedPeriod = {
  period: AnalysePeriod
  current: DateRange
  /** Période précédente de MÊME longueur (comparaison automatique). */
  previous: DateRange
  granularity: Granularity
}

/* ----------------------- Date métier (fuseau tenant) ---------------------- */

/**
 * DATE MÉTIER `YYYY-MM-DD` du tenant : le jour civil dans SON fuseau
 * (`companies.timezone`, ex. "Europe/Paris"), pas en UTC. À 00h30 à Paris
 * (= 23h30 UTC la veille en hiver), renvoie déjà le nouveau jour français.
 *
 * PURE : n'utilise que `Intl.DateTimeFormat` (aucun accès base/serveur). En cas
 * de fuseau invalide, repli sûr sur la date UTC plutôt qu'une exception.
 */
export function businessToday(now: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now)
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ""
    const y = get("year")
    const m = get("month")
    const d = get("day")
    if (y && m && d) return `${y}-${m}-${d}`
  } catch {
    // Fuseau inconnu : ne pas planter le rendu Analyse.
  }
  return now.toISOString().slice(0, 10)
}

/* --------------------------- Helpers de date -------------------------- */

function toUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`)
}
function fmt(d: Date): string {
  return d.toISOString().slice(0, 10)
}
export function addDays(iso: string, n: number): string {
  const d = toUTC(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return fmt(d)
}
/** Décale de `n` mois en bornant le jour au dernier jour du mois cible. */
export function addMonths(iso: string, n: number): string {
  const d = toUTC(iso)
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + n)
  const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, daysInMonth))
  return fmt(d)
}

/**
 * Résout les bornes courante + précédente et la granularité du graphique.
 *
 *  - 30 jours : fenêtre glissante de 30 jours (aujourd'hui inclus), granularité
 *    quotidienne ; comparaison avec les 30 jours immédiatement précédents.
 *  - 3 / 6 / 12 mois : fenêtre glissante de N mois calendaires (bornée jour à
 *    jour pour une comparaison de même longueur), granularité mensuelle.
 *  - Cette année : du 1ᵉʳ janvier à aujourd'hui, comparé au même intervalle de
 *    l'année précédente (year-to-date), granularité mensuelle.
 */
export function resolvePeriodRange(
  period: AnalysePeriod,
  now: Date = new Date(),
  timeZone = "Europe/Paris",
): ResolvedPeriod {
  const today = businessToday(now, timeZone)

  if (period === "30d") {
    const start = addDays(today, -29)
    const prevEnd = addDays(start, -1)
    const prevStart = addDays(prevEnd, -29)
    return {
      period,
      current: { start, end: today },
      previous: { start: prevStart, end: prevEnd },
      granularity: "day",
    }
  }

  if (period === "year") {
    const year = today.slice(0, 4)
    const start = `${year}-01-01`
    const prevStart = `${Number(year) - 1}-01-01`
    const prevEnd = addMonths(today, -12)
    return {
      period,
      current: { start, end: today },
      previous: { start: prevStart, end: prevEnd },
      granularity: "month",
    }
  }

  const months = period === "3m" ? 3 : period === "6m" ? 6 : 12
  const start = addDays(addMonths(today, -months), 1)
  const prevEnd = addDays(start, -1)
  const prevStart = addDays(addMonths(prevEnd, -months), 1)
  return {
    period,
    current: { start, end: today },
    previous: { start: prevStart, end: prevEnd },
    granularity: "month",
  }
}

/* ------------------------------ Séries -------------------------------- */

/** Clés de buckets attendues (continues) sur l'intervalle, pour un graphique sans trous. */
export function buildBucketKeys(range: DateRange, granularity: Granularity): string[] {
  const keys: string[] = []
  if (granularity === "day") {
    let cur = range.start
    // Garde-fou : borne dure à ~400 itérations (année + marge).
    for (let i = 0; i < 400 && cur <= range.end; i++) {
      keys.push(cur)
      cur = addDays(cur, 1)
    }
    return keys
  }
  // Mensuel : itère du mois de `start` au mois de `end` inclus.
  let cur = `${range.start.slice(0, 7)}-01`
  const endMonth = range.end.slice(0, 7)
  for (let i = 0; i < 240 && cur.slice(0, 7) <= endMonth; i++) {
    keys.push(cur.slice(0, 7))
    cur = addMonths(cur, 1)
  }
  return keys
}

/** Remplit les buckets manquants avec 0 (série continue, ordre des `keys`). */
export function fillSeries(
  keys: string[],
  rows: { bucket: string; totalCents: number }[],
): { bucket: string; totalCents: number }[] {
  const map = new Map(rows.map((r) => [r.bucket, r.totalCents]))
  return keys.map((k) => ({ bucket: k, totalCents: map.get(k) ?? 0 }))
}

/* ---------------------------- Comparaison ----------------------------- */

/**
 * Évolution vs période précédente.
 *  - `previous > 0`  → pct = variation arrondie (peut être négative) ;
 *  - `previous = 0` et `current > 0` → "new" (jamais +∞ %) ;
 *  - `previous = 0` et `current = 0` → "none" (rien à comparer).
 */
export type ChangeKind = "up" | "down" | "flat" | "new" | "none"
export type Change = { pct: number | null; kind: ChangeKind }

export function computeChange(current: number, previous: number): Change {
  if (previous === 0) {
    if (current === 0) return { pct: null, kind: "none" }
    return { pct: null, kind: "new" }
  }
  const pct = Math.round(((current - previous) / Math.abs(previous)) * 100)
  if (pct > 0) return { pct, kind: "up" }
  if (pct < 0) return { pct, kind: "down" }
  return { pct: 0, kind: "flat" }
}
