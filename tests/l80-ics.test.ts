import { describe, expect, it } from "vitest"
import { externalBlocksForDay, parseBusyEvents, zonedToUtcMs } from "@/lib/calendar-sync/ics-parse"
import {
  buildFeed,
  feedGoogleUrl,
  feedIphoneUrl,
  isOwnUid,
  parseFeedToken,
  bookingUid,
  syncErrorMessage,
} from "@/lib/calendar-sync/ics-feed"

const NOW = new Date("2026-11-24T08:00:00Z")
const TZ = "Europe/Paris"

const cal = (...events: string[]) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${events.join("\r\n")}\r\nEND:VCALENDAR\r\n`
const ev = (...lines: string[]) => ["BEGIN:VEVENT", ...lines, "END:VEVENT"].join("\r\n")
const parse = (ics: string, extra = {}) => parseBusyEvents(ics, { tenantTz: TZ, now: NOW, isOwnUid, ...extra })

describe("L80 — événements « occupé » → créneaux bloqués", () => {
  it("un événement bloque exactement les créneaux qui le chevauchent", () => {
    // 10:00–12:00 heure de Paris le 25/11 (UTC+1)
    const blocks = parse(cal(ev("UID:a", "DTSTART:20261125T090000Z", "DTEND:20261125T110000Z")))
    expect(blocks).toHaveLength(1)
    const day = externalBlocksForDay(blocks, "2026-11-25", TZ)
    expect(day.fullDay).toBe(false)
    expect(day.ranges).toEqual([{ start: 600, end: 720 }])
    // le jour d'avant / d'après est libre
    expect(externalBlocksForDay(blocks, "2026-11-24", TZ).ranges).toEqual([])
    expect(externalBlocksForDay(blocks, "2026-11-26", TZ).ranges).toEqual([])
    // chevauchement strict comme getAvailability : 12:00 n'est pas bloqué, 11:30 l'est
    const { ranges } = day
    const blocked = (start: number, dur: number) => ranges.some((r) => start < r.end && start + dur > r.start)
    expect(blocked(720, 60)).toBe(false)
    expect(blocked(690, 60)).toBe(true)
    expect(blocked(540, 60)).toBe(false)
    expect(blocked(540, 90)).toBe(true)
  })

  it("événement toute la journée = jour entier bloqué (et seulement ce jour)", () => {
    const blocks = parse(cal(ev("UID:a", "DTSTART;VALUE=DATE:20261126", "DTEND;VALUE=DATE:20261127")))
    expect(externalBlocksForDay(blocks, "2026-11-26", TZ).fullDay).toBe(true)
    expect(externalBlocksForDay(blocks, "2026-11-25", TZ).fullDay).toBe(false)
    expect(externalBlocksForDay(blocks, "2026-11-27", TZ).fullDay).toBe(false)
  })

  it("événement sur plusieurs jours (journée entière)", () => {
    const blocks = parse(cal(ev("UID:a", "DTSTART;VALUE=DATE:20261126", "DTEND;VALUE=DATE:20261129")))
    for (const d of ["2026-11-26", "2026-11-27", "2026-11-28"]) expect(externalBlocksForDay(blocks, d, TZ).fullDay).toBe(true)
    expect(externalBlocksForDay(blocks, "2026-11-29", TZ).fullDay).toBe(false)
  })

  it("TRANSPARENT et CANCELLED sont ignorés", () => {
    const base = ["DTSTART:20261125T090000Z", "DTEND:20261125T110000Z"]
    expect(parse(cal(ev("UID:a", ...base, "TRANSP:TRANSPARENT")))).toHaveLength(0)
    expect(parse(cal(ev("UID:a", ...base, "STATUS:CANCELLED")))).toHaveLength(0)
    expect(parse(cal(ev("UID:a", ...base, "TRANSP:OPAQUE", "STATUS:CONFIRMED")))).toHaveLength(1)
  })

  it("le titre, la description et le lieu ne sont jamais conservés", () => {
    const secret = "RDV-MEDECIN-SECRET"
    const blocks = parse(
      cal(
        ev(
          "UID:a",
          `SUMMARY:${secret}`,
          `DESCRIPTION:${secret} desc`,
          `LOCATION:${secret} lieu`,
          "DTSTART:20261125T090000Z",
          "DTEND:20261125T110000Z",
        ),
      ),
    )
    expect(JSON.stringify(blocks)).not.toContain("SECRET")
    expect(Object.keys(blocks[0]).sort()).toEqual(["allDay", "endsAt", "startsAt"])
  })

  it("lignes repliées (CRLF + espace) et alarmes imbriquées", () => {
    const blocks = parse(
      cal(
        ev(
          "UID:a",
          "DTSTART:2026112",
          " 5T090000Z",
          "DTEND:20261125T110000Z",
          "BEGIN:VALARM",
          "TRANSP:TRANSPARENT",
          "END:VALARM",
        ),
      ),
    )
    expect(blocks).toHaveLength(1)
  })

  it("récurrence hebdomadaire + EXDATE", () => {
    // Tous les mardis 14:00–15:00 UTC (mardi 24/11 inclus), sauf le 1/12
    const blocks = parse(
      cal(
        ev(
          "UID:r",
          "DTSTART:20261110T140000Z",
          "DTEND:20261110T150000Z",
          "RRULE:FREQ=WEEKLY;BYDAY=TU",
          "EXDATE:20261201T140000Z",
        ),
      ),
    )
    const days = blocks.map((b) => b.startsAt.toISOString().slice(0, 10))
    expect(days).toContain("2026-11-24")
    expect(days).toContain("2026-12-08")
    expect(days).not.toContain("2026-12-01")
    expect(days).not.toContain("2026-11-17") // avant la fenêtre (J-1)
  })

  it("COUNT et UNTIL bornent la récurrence", () => {
    const counted = parse(cal(ev("UID:c", "DTSTART:20261125T090000Z", "DTEND:20261125T100000Z", "RRULE:FREQ=DAILY;COUNT=3")))
    expect(counted).toHaveLength(3)
    const until = parse(cal(ev("UID:u", "DTSTART:20261125T090000Z", "DTEND:20261125T100000Z", "RRULE:FREQ=DAILY;UNTIL=20261127T235959Z")))
    expect(until).toHaveLength(3)
  })

  it("récurrence mensuelle (1er lundi) et annuelle", () => {
    const monthly = parse(cal(ev("UID:m", "DTSTART:20260105T090000Z", "DTEND:20260105T100000Z", "RRULE:FREQ=MONTHLY;BYDAY=1MO")), { horizonDays: 90 })
    expect(monthly.map((b) => b.startsAt.toISOString().slice(0, 10))).toEqual(["2026-12-07", "2027-01-04", "2027-02-01"])
    const yearly = parse(cal(ev("UID:y", "DTSTART;VALUE=DATE:20200301", "RRULE:FREQ=YEARLY")), { horizonDays: 400 })
    expect(yearly.some((b) => b.allDay)).toBe(true)
  })

  it("fuseau TZID converti vers l'heure du tenant", () => {
    // 10:00 à New York (UTC−5 en novembre) = 15:00 UTC = 16:00 Paris
    const blocks = parse(cal(ev("UID:t", "DTSTART;TZID=America/New_York:20261125T100000", "DTEND;TZID=America/New_York:20261125T110000")))
    expect(blocks[0].startsAt.toISOString()).toBe("2026-11-25T15:00:00.000Z")
    expect(externalBlocksForDay(blocks, "2026-11-25", TZ).ranges).toEqual([{ start: 960, end: 1020 }])
  })

  it("heure flottante ou fuseau inconnu = heure du tenant", () => {
    const floating = parse(cal(ev("UID:f", "DTSTART:20261125T100000", "DTEND:20261125T110000")))
    expect(floating[0].startsAt.getTime()).toBe(zonedToUtcMs(2026, 11, 25, 10, 0, 0, TZ))
    const unknown = parse(cal(ev("UID:g", "DTSTART;TZID=Mars/Olympus:20261125T100000", "DTEND;TZID=Mars/Olympus:20261125T110000")))
    expect(unknown[0].startsAt.getTime()).toBe(zonedToUtcMs(2026, 11, 25, 10, 0, 0, TZ))
  })

  it("heure d'été : 10:00 Paris en juillet = 08:00 UTC", () => {
    const n = new Date("2027-07-01T00:00:00Z")
    const blocks = parseBusyEvents(cal(ev("UID:s", "DTSTART:20270705T100000", "DTEND:20270705T110000")), { tenantTz: TZ, now: n })
    expect(blocks[0].startsAt.toISOString()).toBe("2027-07-05T08:00:00.000Z")
  })

  it("DURATION est supportée ; durée nulle ignorée", () => {
    expect(parse(cal(ev("UID:d", "DTSTART:20261125T090000Z", "DURATION:PT90M")))[0].endsAt.toISOString()).toBe("2026-11-25T10:30:00.000Z")
    expect(parse(cal(ev("UID:z", "DTSTART:20261125T090000Z")))).toHaveLength(0)
  })

  it("UID d'un rendez-vous DetailFlow ignoré (anti-boucle) ; les événements du flux réimporté disparaissent", () => {
    const feed = buildFeed(
      [
        { id: 7, reference: "R7", date: "2026-11-25", startTime: "10:00", endTime: "12:00", customerName: "Jean", customerPhone: "0600000000", address: "1 rue X", serviceNames: ["Lavage"] },
      ],
      { tz: TZ, now: NOW },
    )
    expect(parse(feed)).toHaveLength(0)
    expect(parse(cal(ev(`UID:${bookingUid(7)}`, "DTSTART:20261125T090000Z", "DTEND:20261125T110000Z")))).toHaveLength(0)
    // un événement du téléphone ordinaire reste pris en compte
    expect(parse(cal(ev("UID:abc@icloud.com", "DTSTART:20261125T090000Z", "DTEND:20261125T110000Z")))).toHaveLength(1)
  })

  it("entrée hostile : contenu non iCalendar, dates absurdes → aucun plantage", () => {
    expect(parse("n'importe quoi")).toEqual([])
    expect(parse(cal(ev("UID:x", "DTSTART:99999999T999999Z")))).toEqual([])
    expect(parse(cal(ev("UID:x", "DTSTART:20261125T090000Z", "DTEND:20261125T100000Z", "RRULE:FREQ=SECONDLY")))).toHaveLength(1)
  })
})

describe("L80 — flux DetailFlow → téléphone", () => {
  const feed = buildFeed(
    [
      { id: 1, reference: "DF-1", date: "2026-11-25", startTime: "10:00", endTime: "12:30", customerName: "Marie; Dupont", customerPhone: "0612345678", address: "5 rue des Lilas, Lyon", serviceNames: ["Lavage", "Polish"] },
      { id: 2, reference: "DF-2", date: "2026-11-25", startTime: "bad", endTime: "12:30", customerName: "X", customerPhone: "1", address: "a", serviceNames: [] },
    ],
    { tz: TZ, now: NOW },
  )

  it("contient les rendez-vous valides au format iCalendar (UTC, CRLF, échappements)", () => {
    expect(feed.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true)
    expect(feed).toContain("DTSTART:20261125T090000Z")
    expect(feed).toContain("DTEND:20261125T113000Z")
    expect(feed).toContain("SUMMARY:Lavage + Polish — Marie\\; Dupont")
    expect(feed).toContain("LOCATION:5 rue des Lilas\\, Lyon")
    expect(feed).toContain("0612345678")
    expect((feed.match(/BEGIN:VEVENT/g) ?? []).length).toBe(1) // créneau illisible ignoré
    expect(feed.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true)
  })

  it("aucun identifiant d'entreprise dans le flux ni dans l'adresse", () => {
    expect(feed).not.toMatch(/company/i)
    expect(feedIphoneUrl("https://www.detailflow.fr/api/calendar/abc.ics")).toBe("webcal://www.detailflow.fr/api/calendar/abc.ics")
  })

  it("boutons : iPhone = lien direct, Google = lien d'abonnement Google", () => {
    const https = "https://www.detailflow.fr/api/calendar/tok.ics"
    expect(feedIphoneUrl(https).startsWith("webcal://")).toBe(true)
    expect(feedGoogleUrl(https)).toBe(
      `https://calendar.google.com/calendar/r?cid=${encodeURIComponent("webcal://www.detailflow.fr/api/calendar/tok.ics")}`,
    )
  })

  it("jeton : 43 caractères base64url, avec ou sans .ics ; le reste est refusé", () => {
    const t = "A".repeat(43)
    expect(parseFeedToken(`${t}.ics`)).toBe(t)
    expect(parseFeedToken(t)).toBe(t)
    for (const bad of ["", "abc", `${t}x`, `${t}/../`, "../etc/passwd", "A".repeat(42) + "!"]) expect(parseFeedToken(bad)).toBeNull()
  })

  it("messages d'erreur sans jargon", () => {
    for (const code of ["invalid_url", "blocked_host", "redirects", "timeout", "too_large", "http_error", "not_calendar", "network", "x"]) {
      expect(syncErrorMessage(code)).not.toMatch(/ical|webcal|caldav|ssrf|dns/i)
    }
    expect(syncErrorMessage(null)).toBeNull()
  })
})
