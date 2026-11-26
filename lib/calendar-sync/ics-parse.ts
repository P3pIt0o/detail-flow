/**
 * L80 — Petit lecteur iCalendar (pur, sans dépendance, sans I/O).
 *
 * Ne garde QUE début/fin des événements « occupé » : jamais le titre, la
 * description ni le lieu (ils ne sont même pas lus). Gère : lignes repliées,
 * dates UTC / fuseau (TZID) / flottantes / journée entière, DURATION, TRANSP,
 * STATUS, RRULE (DAILY/WEEKLY/MONTHLY/YEARLY, INTERVAL, COUNT, UNTIL, BYDAY,
 * BYMONTHDAY, BYSETPOS), EXDATE, RECURRENCE-ID (occurrence déplacée ou annulée).
 * Les événements dont l'UID est celui d'un rendez-vous DetailFlow sont ignorés
 * (anti-boucle).
 */

export type BusyBlock = { startsAt: Date; endsAt: Date; allDay: boolean }

/** Doit couvrir toute la fenêtre réservable (180 j, `SEARCH_MAX_DAYS`) avec une marge. */
export const HORIZON_DAYS = 200
const MAX_BLOCKS = 5000
const MAX_LOOP = 60000
/** Budget de calcul pour TOUT un fichier (dépassé → lecture refusée, anciens blocages conservés). */
const MAX_TOTAL_STEPS = 500_000
const MAX_EVENTS = 20_000
const MAX_EXCEPTIONS = 20_000
const DAY_MS = 86_400_000

type Budget = { steps: number; exceptions: number }

function spend(budget: Budget, key: keyof Budget) {
  if (--budget[key] < 0) throw new Error("calendar_too_complex")
}

/* ------------------------------ Fuseaux ------------------------------ */

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
    formatters.set(tz, f)
  }
  return f
}

export function isValidTimeZone(tz: string | undefined | null): tz is string {
  if (!tz) return false
  try {
    formatterFor(tz)
    return true
  } catch {
    return false
  }
}

function wallParts(ms: number, tz: string) {
  const out: Record<string, number> = {}
  for (const p of formatterFor(tz).formatToParts(new Date(ms))) {
    if (p.type !== "literal") out[p.type] = Number(p.value)
  }
  return out
}

/** Décalage (heure locale − UTC) en ms, à l'instant `utcMs`. */
function tzOffsetMs(utcMs: number, tz: string): number {
  const p = wallParts(utcMs, tz)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(utcMs / 1000) * 1000
}

/** Heure locale `tz` (mur) → instant UTC en ms. */
export function zonedToUtcMs(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s)
  const r1 = guess - tzOffsetMs(guess, tz)
  const o2 = tzOffsetMs(r1, tz)
  return guess - o2
}

/** Date locale "YYYY-MM-DD" + minutes depuis minuit (décimales = secondes) d'un instant. */
export function localParts(ms: number, tz: string): { date: string; minutes: number } {
  const p = wallParts(ms, tz)
  const date = `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`
  return { date, minutes: p.hour * 60 + p.minute + p.second / 60 }
}

/* ------------------------------ Lecture ------------------------------ */

type Params = Record<string, string>
type Line = { name: string; params: Params; value: string }

function unfold(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n")
}

function parseLine(raw: string): Line | null {
  // Premier « : » hors guillemets.
  let inQuote = false
  let idx = -1
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]
    if (c === '"') inQuote = !inQuote
    else if (c === ":" && !inQuote) {
      idx = i
      break
    }
  }
  if (idx <= 0) return null
  const head = raw.slice(0, idx)
  const value = raw.slice(idx + 1)
  const parts: string[] = []
  let cur = ""
  inQuote = false
  for (const c of head) {
    if (c === '"') inQuote = !inQuote
    if (c === ";" && !inQuote) {
      parts.push(cur)
      cur = ""
    } else cur += c
  }
  parts.push(cur)
  const name = parts[0].toUpperCase()
  const params: Params = {}
  for (const p of parts.slice(1)) {
    const eq = p.indexOf("=")
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/"/g, "")
  }
  return { name, params, value }
}

type Wall = { y: number; mo: number; d: number; h: number; mi: number; s: number }
type Dt = { wall: Wall; tz: string; allDay: boolean; ms: number }

function parseDt(value: string, params: Params, tenantTz: string): Dt | null {
  const v = value.trim()
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(v)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const allDay = m[4] === undefined || params.VALUE === "DATE"
  if (allDay) {
    return { wall: { y, mo, d, h: 0, mi: 0, s: 0 }, tz: tenantTz, allDay: true, ms: zonedToUtcMs(y, mo, d, 0, 0, 0, tenantTz) }
  }
  const wall: Wall = { y, mo, d, h: Number(m[4]), mi: Number(m[5]), s: Number(m[6] ?? 0) }
  const tz = m[7] ? "UTC" : isValidTimeZone(params.TZID) ? params.TZID : tenantTz
  const ms = tz === "UTC" ? Date.UTC(y, mo - 1, d, wall.h, wall.mi, wall.s) : zonedToUtcMs(y, mo, d, wall.h, wall.mi, wall.s, tz)
  return { wall, tz, allDay: false, ms }
}

function parseDuration(v: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim())
  if (!m) return null
  const n = (x: string | undefined) => Number(x ?? 0)
  const ms = (n(m[2]) * 7 + n(m[3])) * DAY_MS + n(m[4]) * 3_600_000 + n(m[5]) * 60_000 + n(m[6]) * 1000
  return m[1] === "-" ? -ms : ms
}

/* ------------------------------ Récurrence ------------------------------ */

type Rule = {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY"
  interval: number
  count: number | null
  until: Dt | null
  byday: { ord: number; wd: number }[]
  bymonthday: number[]
  bysetpos: number[]
}

const WD: Record<string, number> = { MO: 0, TU: 1, WE: 2, TH: 3, FR: 4, SA: 5, SU: 6 }

function parseRule(value: string, tenantTz: string): Rule | null {
  const kv: Record<string, string> = {}
  for (const part of value.split(";")) {
    const eq = part.indexOf("=")
    if (eq > 0) kv[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1)
  }
  const freq = kv.FREQ?.toUpperCase()
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY" && freq !== "YEARLY") return null
  const interval = Math.max(1, Math.min(1000, Number.parseInt(kv.INTERVAL ?? "1", 10) || 1))
  const count = kv.COUNT ? Math.max(0, Number.parseInt(kv.COUNT, 10) || 0) : null
  const until = kv.UNTIL ? parseDt(kv.UNTIL, {}, tenantTz) : null
  const byday: Rule["byday"] = []
  for (const tok of (kv.BYDAY ?? "").split(",")) {
    const m = /^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/i.exec(tok.trim())
    if (!m) continue
    const day = { ord: m[1] ? Number(m[1]) : 0, wd: WD[m[2].toUpperCase()] }
    if (!byday.some((b) => b.ord === day.ord && b.wd === day.wd) && byday.length < 70) byday.push(day)
  }
  const ints = (list: string | undefined, min: number, max: number) => [
    ...new Set(
      (list ?? "")
        .split(",")
        .map((x) => Number.parseInt(x, 10))
        .filter((x) => Number.isInteger(x) && x !== 0 && x >= min && x <= max),
    ),
  ]
  const bymonthday = ints(kv.BYMONTHDAY, -31, 31)
  const bysetpos = ints(kv.BYSETPOS, -366, 366).slice(0, 62) // coût par période borné
  return { freq, interval, count, until, byday, bymonthday, bysetpos }
}

/** BYSETPOS : ne garde que les positions demandées dans les jours d'une période. */
function pickPositions(days: number[], positions: number[]): number[] {
  if (!positions.length) return days
  const picked = positions
    .map((p) => (p > 0 ? days[p - 1] : days[days.length + p]))
    .filter((x): x is number => x !== undefined)
  return [...new Set(picked)].sort((a, b) => a - b)
}

const dnOf = (y: number, mo: number, d: number) => Math.round(Date.UTC(y, mo - 1, d) / DAY_MS)
const ymdOf = (dn: number) => {
  const dt = new Date(dn * DAY_MS)
  return { y: dt.getUTCFullYear(), mo: dt.getUTCMonth() + 1, d: dt.getUTCDate() }
}
/** Jour de semaine lundi = 0. */
const wdOf = (dn: number) => (new Date(dn * DAY_MS).getUTCDay() + 6) % 7
const daysInMonth = (y: number, mo: number) => new Date(Date.UTC(y, mo, 0)).getUTCDate()

/**
 * `onEmptyPeriod` est appelé pour chaque période qui ne produit aucun jour : une règle
 * impossible (6e lundi, 30 février…) consomme ainsi elle aussi le budget de calcul.
 */
function* occurrenceDays(
  rule: Rule,
  base: { y: number; mo: number; d: number },
  limitDn: number,
  onEmptyPeriod: () => void,
): Generator<number> {
  const baseDn = dnOf(base.y, base.mo, base.d)
  const { interval } = rule
  let guard = 0
  if (rule.freq === "DAILY") {
    for (let k = 0; guard++ < MAX_LOOP; k++) {
      const dn = baseDn + k * interval
      if (dn > limitDn) return
      if (rule.byday.length && !rule.byday.some((b) => b.wd === wdOf(dn))) {
        onEmptyPeriod()
        continue
      }
      yield dn
    }
  } else if (rule.freq === "WEEKLY") {
    const wds = [...new Set(rule.byday.length ? rule.byday.map((b) => b.wd) : [wdOf(baseDn)])].sort((a, b) => a - b)
    const weekStart = baseDn - wdOf(baseDn)
    for (let k = 0; guard++ < MAX_LOOP; k++) {
      const w0 = weekStart + k * interval * 7
      if (w0 > limitDn) return
      let produced = false
      for (const dn of pickPositions(wds.map((wd) => w0 + wd), rule.bysetpos)) {
        if (dn < baseDn) continue
        if (dn > limitDn) return
        produced = true
        yield dn
      }
      if (!produced) onEmptyPeriod()
    }
  } else if (rule.freq === "MONTHLY") {
    for (let k = 0; guard++ < MAX_LOOP; k++) {
      const idx = base.mo - 1 + k * interval
      const y = base.y + Math.floor(idx / 12)
      const mo = (idx % 12) + 1
      const firstDn = dnOf(y, mo, 1)
      if (firstDn > limitDn) return
      const dim = daysInMonth(y, mo)
      const days = new Set<number>()
      if (rule.byday.length) {
        // Un seul parcours du mois, quel que soit le nombre d'entrées BYDAY.
        const byWd: number[][] = [[], [], [], [], [], [], []]
        const firstWd = wdOf(firstDn)
        for (let d = 0; d < dim; d++) byWd[(firstWd + d) % 7].push(firstDn + d)
        for (const b of rule.byday) {
          const all = byWd[b.wd]
          if (!b.ord) all.forEach((x) => days.add(x))
          else {
            const pick = b.ord > 0 ? all[b.ord - 1] : all[all.length + b.ord]
            if (pick !== undefined) days.add(pick)
          }
        }
      } else {
        for (const d of rule.bymonthday.length ? rule.bymonthday : [base.d]) {
          const day = d > 0 ? d : dim + d + 1 // -1 = dernier jour du mois
          if (day >= 1 && day <= dim) days.add(firstDn + day - 1)
        }
      }
      let produced = false
      for (const dn of pickPositions([...days].sort((a, b) => a - b), rule.bysetpos)) {
        if (dn < baseDn) continue
        if (dn > limitDn) return
        produced = true
        yield dn
      }
      if (!produced) onEmptyPeriod()
    }
  } else {
    for (let k = 0; guard++ < MAX_LOOP; k++) {
      const y = base.y + k * interval
      if (dnOf(y, 1, 1) > limitDn) return
      if (base.d > daysInMonth(y, base.mo)) {
        onEmptyPeriod()
        continue
      }
      const dn = dnOf(y, base.mo, base.d)
      if (dn > limitDn) return
      yield dn
    }
  }
}

/* ------------------------------ API ------------------------------ */

export type ParseOptions = {
  tenantTz: string
  now?: Date
  horizonDays?: number
  /** UID d'un rendez-vous DetailFlow → événement ignoré. */
  isOwnUid?: (uid: string) => boolean
}

/** Retourne les créneaux occupés (début/fin uniquement) sur [now − 1 j ; now + horizon]. */
export function parseBusyEvents(ics: string, opts: ParseOptions): BusyBlock[] {
  const tenantTz = isValidTimeZone(opts.tenantTz) ? opts.tenantTz : "Europe/Paris"
  const now = (opts.now ?? new Date()).getTime()
  const winStart = now - DAY_MS
  const winEnd = now + (opts.horizonDays ?? HORIZON_DAYS) * DAY_MS
  const blocks: BusyBlock[] = []

  const lines = unfold(ics)
  let inEvent = false
  let alarmDepth = 0
  let ev: Line[] = []
  const events: Line[][] = []
  const budget: Budget = { steps: MAX_TOTAL_STEPS, exceptions: MAX_EXCEPTIONS }
  /** Par UID : occurrences remplacées par un événement `RECURRENCE-ID` (clés comme EXDATE). */
  const overridden = new Map<string, Set<number>>()

  for (const raw of lines) {
    const upper = raw.trim().toUpperCase()
    if (upper === "BEGIN:VEVENT") {
      inEvent = true
      alarmDepth = 0
      ev = []
      continue
    }
    if (upper === "END:VEVENT") {
      if (inEvent) {
        if (events.length >= MAX_EVENTS) throw new Error("calendar_too_complex")
        events.push(ev)
        registerOverride(ev)
      }
      inEvent = false
      continue
    }
    if (!inEvent) continue
    if (upper.startsWith("BEGIN:")) {
      alarmDepth++
      continue
    }
    if (upper.startsWith("END:")) {
      alarmDepth = Math.max(0, alarmDepth - 1)
      continue
    }
    if (alarmDepth > 0) continue
    const l = parseLine(raw)
    if (!l) continue
    // Seuls ces champs sont lus : titre, lieu et description sont volontairement ignorés.
    if (["UID", "DTSTART", "DTEND", "DURATION", "TRANSP", "STATUS", "RRULE", "EXDATE", "RECURRENCE-ID"].includes(l.name)) ev.push(l)
  }

  // Les événements sont traités après la lecture complète : une exception peut précéder sa série.
  for (const props of events) {
    handleEvent(props)
    if (blocks.length >= MAX_BLOCKS) break
  }

  function registerOverride(props: Line[]) {
    const rid = props.find((p) => p.name === "RECURRENCE-ID")
    const uid = props.find((p) => p.name === "UID")?.value.trim()
    if (!rid || !uid) return
    spend(budget, "exceptions")
    const x = parseDt(rid.value, rid.params, tenantTz)
    if (!x) return
    const keys = overridden.get(uid) ?? new Set<number>()
    keys.add(x.allDay ? dnOf(x.wall.y, x.wall.mo, x.wall.d) : x.ms)
    overridden.set(uid, keys)
  }

  function handleEvent(props: Line[]) {
    const get = (n: string) => props.find((p) => p.name === n)
    const uid = get("UID")?.value.trim()
    if (uid && opts.isOwnUid?.(uid)) return
    if (get("TRANSP")?.value.trim().toUpperCase() === "TRANSPARENT") return
    if (get("STATUS")?.value.trim().toUpperCase() === "CANCELLED") return
    const ds = get("DTSTART")
    if (!ds) return
    const start = parseDt(ds.value, ds.params, tenantTz)
    if (!start) return

    // Durée (ms) ou nombre de jours (journée entière).
    let durationMs: number
    let spanDays = 1
    const de = get("DTEND")
    const du = get("DURATION")
    if (de) {
      const end = parseDt(de.value, de.params, tenantTz)
      if (!end) return
      if (start.allDay) spanDays = Math.max(1, dnOf(end.wall.y, end.wall.mo, end.wall.d) - dnOf(start.wall.y, start.wall.mo, start.wall.d))
      durationMs = end.ms - start.ms
    } else if (du) {
      const dm = parseDuration(du.value)
      if (dm === null) return
      durationMs = dm
      if (start.allDay) spanDays = Math.max(1, Math.round(dm / DAY_MS))
    } else {
      durationMs = start.allDay ? DAY_MS : 0
    }
    if (!start.allDay && durationMs <= 0) return

    const exKeys = new Set<number>()
    for (const p of props.filter((x) => x.name === "EXDATE")) {
      for (const v of p.value.split(",")) {
        spend(budget, "exceptions")
        const x = parseDt(v, p.params, tenantTz)
        if (x) exKeys.add(x.allDay ? dnOf(x.wall.y, x.wall.mo, x.wall.d) : x.ms)
      }
    }

    const occurrenceBounds = (dn: number): { s: number; e: number } => {
      const { y, mo, d } = ymdOf(dn)
      if (start.allDay) {
        const e = ymdOf(dn + spanDays)
        return { s: zonedToUtcMs(y, mo, d, 0, 0, 0, tenantTz), e: zonedToUtcMs(e.y, e.mo, e.d, 0, 0, 0, tenantTz) }
      }
      const { h, mi, s } = start.wall
      const sMs = start.tz === "UTC" ? Date.UTC(y, mo - 1, d, h, mi, s) : zonedToUtcMs(y, mo, d, h, mi, s, start.tz)
      return { s: sMs, e: sMs + durationMs }
    }
    const push = (dn: number) => {
      const { s, e } = occurrenceBounds(dn)
      if (e <= winStart || s >= winEnd) return
      blocks.push({ startsAt: new Date(s), endsAt: new Date(e), allDay: start.allDay })
    }

    const baseDn = dnOf(start.wall.y, start.wall.mo, start.wall.d)
    const rr = get("RRULE")
    const rule = rr ? parseRule(rr.value, tenantTz) : null
    if (!rule) {
      push(baseDn)
      return
    }
    const limitDn = Math.ceil(winEnd / DAY_MS) + 2
    const spanLen = start.allDay ? spanDays : Math.ceil(durationMs / DAY_MS)
    const firstUsefulDn = Math.floor(winStart / DAY_MS) - spanLen - 2
    const replaced = uid ? overridden.get(uid) : undefined
    let n = 0
    for (const dn of occurrenceDays(rule, start.wall, limitDn, () => spend(budget, "steps"))) {
      if (rule.count !== null && n >= rule.count) break
      n++
      spend(budget, "steps")
      if (dn < firstUsefulDn) continue // passé : compté (COUNT) sans calcul de fuseau
      const { s } = occurrenceBounds(dn)
      if (rule.until && (start.allDay ? dn > dnOf(rule.until.wall.y, rule.until.wall.mo, rule.until.wall.d) : s > rule.until.ms)) break
      const key = start.allDay ? dn : s
      if (exKeys.has(key) || replaced?.has(key)) continue
      push(dn)
      if (blocks.length >= MAX_BLOCKS) break
    }
  }

  return blocks.slice(0, MAX_BLOCKS)
}

/** Occupation d'une journée "YYYY-MM-DD" (fuseau du tenant) : jour entier ou plages en minutes. */
export function externalBlocksForDay(
  blocks: readonly BusyBlock[],
  dateStr: string,
  tz: string,
): { fullDay: boolean; ranges: { start: number; end: number }[] } {
  const zone = isValidTimeZone(tz) ? tz : "Europe/Paris"
  let fullDay = false
  const ranges: { start: number; end: number }[] = []
  for (const b of blocks) {
    const s = localParts(b.startsAt.getTime(), zone)
    const e = localParts(b.endsAt.getTime() - 1, zone) // fin exclusive
    if (s.date > dateStr || e.date < dateStr) continue
    if (b.allDay) {
      fullDay = true
      continue
    }
    const start = s.date < dateStr ? 0 : Math.floor(s.minutes)
    const end = e.date > dateStr ? 1440 : Math.ceil(e.minutes + 1 / 60 - 1e-6)
    if (end > start) ranges.push({ start, end: Math.min(1440, end) })
  }
  return { fullDay, ranges }
}
