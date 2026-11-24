/**
 * Génération pure des heures de début (sans BDD, sans "server-only") :
 * testable partout. Utilisée par `getAvailability`.
 */

export const MAX_FIXED_STARTS = 12

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}

export function minutesToTime(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

/** Lit la colonne texte "08:00,13:00" -> ["08:00","13:00"] (valeurs invalides ignorées, triées, uniques). */
export function parseFixedStarts(raw: string | null | undefined): string[] {
  if (!raw) return []
  const set = new Set<string>()
  for (const part of raw.split(",")) {
    const t = part.trim()
    if (HHMM.test(t)) set.add(t)
  }
  return [...set].sort()
}

/**
 * Valide la saisie serveur : format HH:MM, dédoublonnage, tri, max 12.
 * Renvoie la valeur à stocker (null = option désactivée) ou une erreur.
 */
export function normalizeFixedStarts(
  input: string[] | null | undefined,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (!input || input.length === 0) return { ok: true, value: null }
  if (!Array.isArray(input)) return { ok: false, error: "Heures de début invalides." }
  const set = new Set<string>()
  for (const raw of input) {
    const t = typeof raw === "string" ? raw.trim() : ""
    if (!HHMM.test(t)) return { ok: false, error: "Heure de début invalide (format HH:MM)." }
    set.add(t)
  }
  if (set.size > MAX_FIXED_STARTS) {
    return { ok: false, error: `Maximum ${MAX_FIXED_STARTS} heures de début par jour.` }
  }
  return { ok: true, value: [...set].sort().join(",") }
}

/** Vrai si dayOfWeek est un entier 0–6. */
export function isValidDayOfWeek(d: unknown): d is number {
  return typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= 6
}

export type SlotInput = {
  open: number
  close: number
  durationMin: number
  step: number
  buffer: number
  minStartFromNotice: number
  busy: Array<{ start: number; end: number }>
  blockedRanges: Array<{ start: number; end: number }>
  /** Heures fixes du jour ("HH:MM") ; vide = pas global. */
  fixedStarts?: string[]
}

export function computeSlotStarts(i: SlotInput): string[] {
  const candidates: number[] = []
  if (i.fixedStarts && i.fixedStarts.length) {
    for (const t of i.fixedStarts) {
      const s = timeToMinutes(t)
      if (s >= i.open && s + i.durationMin <= i.close) candidates.push(s)
    }
  } else {
    for (let s = i.open; s + i.durationMin <= i.close; s += i.step) candidates.push(s)
  }

  const slots: string[] = []
  for (const start of candidates) {
    const end = start + i.durationMin
    if (start < i.minStartFromNotice) continue
    if (i.busy.some((b) => start < b.end + i.buffer && end + i.buffer > b.start)) continue
    if (i.blockedRanges.some((r) => start < r.end && end > r.start)) continue
    slots.push(minutesToTime(start))
  }
  return slots
}
