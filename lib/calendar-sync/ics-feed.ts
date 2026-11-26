/**
 * L80 — Flux d'agenda DetailFlow → téléphone (pur, sans I/O).
 * Ne contient QUE des réservations (jamais les blocages importés : anti-boucle).
 */

import { zonedToUtcMs, isValidTimeZone } from "./ics-parse"

export const FEED_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/
export const OWN_UID_RE = /^df-booking-[A-Za-z0-9_-]+@detailflow\.fr$/

export type FeedBooking = {
  id: number
  reference: string
  date: string // YYYY-MM-DD (fuseau du tenant)
  startTime: string // HH:MM
  endTime: string // HH:MM
  customerName: string
  customerPhone: string
  address: string
  serviceNames: string[]
}

export const isOwnUid = (uid: string) => OWN_UID_RE.test(uid.trim())
export const bookingUid = (id: number) => `df-booking-${id}@detailflow.fr`

/** Jeton lu dans l'URL (`<jeton>` ou `<jeton>.ics`) ; null si mal formé. */
export function parseFeedToken(raw: string): string | null {
  const t = raw.endsWith(".ics") ? raw.slice(0, -4) : raw
  return FEED_TOKEN_RE.test(t) ? t : null
}

export function feedHttpsUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/api/calendar/${token}.ics`
}
/** Lien d'abonnement iPhone (ouvre l'app Calendrier). */
export function feedIphoneUrl(httpsUrl: string): string {
  return httpsUrl.replace(/^https?:\/\//i, "webcal://")
}
/** Lien d'abonnement Google Agenda. */
export function feedGoogleUrl(httpsUrl: string): string {
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feedIphoneUrl(httpsUrl))}`
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n")
}

/** Repli à 75 octets, CRLF. */
function fold(line: string): string {
  const enc = new TextEncoder()
  if (enc.encode(line).length <= 75) return line
  const out: string[] = []
  let cur = ""
  let curBytes = 0
  for (const ch of line) {
    const b = enc.encode(ch).length
    const limit = out.length === 0 ? 75 : 74
    if (curBytes + b > limit) {
      out.push(cur)
      cur = ""
      curBytes = 0
    }
    cur += ch
    curBytes += b
  }
  out.push(cur)
  return out.join("\r\n ")
}

function utcStamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
}

function toMs(date: string, time: string, tz: string): number | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const t = /^(\d{2}):(\d{2})$/.exec(time)
  if (!d || !t) return null
  return zonedToUtcMs(Number(d[1]), Number(d[2]), Number(d[3]), Number(t[1]), Number(t[2]), 0, tz)
}

export function buildFeed(bookings: readonly FeedBooking[], opts: { tz: string; now?: Date; calendarName?: string }): string {
  const tz = isValidTimeZone(opts.tz) ? opts.tz : "Europe/Paris"
  const stamp = utcStamp((opts.now ?? new Date()).getTime())
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DetailFlow//Agenda//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(opts.calendarName ?? "DetailFlow")}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
    "X-PUBLISHED-TTL:PT15M",
  ]
  for (const b of bookings) {
    const s = toMs(b.date, b.startTime, tz)
    const e = toMs(b.date, b.endTime, tz)
    if (s === null || e === null || e <= s) continue
    const service = b.serviceNames.filter(Boolean).join(" + ") || "Rendez-vous"
    lines.push(
      "BEGIN:VEVENT",
      `UID:${bookingUid(b.id)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${utcStamp(s)}`,
      `DTEND:${utcStamp(e)}`,
      `SUMMARY:${esc(`${service} — ${b.customerName}`)}`,
      `LOCATION:${esc(b.address)}`,
      `DESCRIPTION:${esc(`Téléphone : ${b.customerPhone}\nRéférence : ${b.reference}`)}`,
      "END:VEVENT",
    )
  }
  lines.push("END:VCALENDAR")
  return lines.map(fold).join("\r\n") + "\r\n"
}

/** Message clair (sans jargon) pour un code d'erreur de lecture. */
export function syncErrorMessage(code: string | null | undefined): string | null {
  switch (code) {
    case null:
    case undefined:
    case "":
      return null
    case "invalid_url":
    case "blocked_host":
    case "redirects":
      return "Cette adresse n'est pas acceptée. Vérifiez que vous avez bien copié l'adresse privée de votre agenda."
    case "timeout":
      return "Votre agenda met trop de temps à répondre. Nous réessayons automatiquement ; vos derniers créneaux restent pris en compte."
    case "too_large":
      return "Votre agenda est trop volumineux pour être lu."
    case "http_error":
      return "Votre agenda a refusé la lecture. L'adresse a peut-être changé : copiez-la de nouveau."
    case "not_calendar":
      return "Cette adresse ne mène pas à un agenda. Copiez de nouveau l'adresse privée de votre agenda."
    default:
      return "La dernière mise à jour a échoué. Nous réessayons automatiquement ; vos derniers créneaux restent pris en compte."
  }
}
