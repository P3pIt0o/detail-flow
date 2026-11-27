import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/calendar-sync/store", () => ({
  getCompanyTimezone: vi.fn(),
  getSyncSettings: vi.fn(),
  listDueCompanyIds: vi.fn(),
  markSyncAttempt: vi.fn(),
  recordSyncError: vi.fn(),
  replaceExternalBlocks: vi.fn(),
  saveExternalCalendar: vi.fn(),
}))

import { externalBlocksForDay, parseBusyEvents } from "@/lib/calendar-sync/ics-parse"
import { buildFeed, formatSince, linkErrorMessage, syncErrorMessage } from "@/lib/calendar-sync/ics-feed"
import { connectCalendar, syncAllDue, syncCompany, type SyncDeps } from "@/lib/calendar-sync/sync"

const TZ = "Europe/Paris"
const NOW = new Date("2026-11-24T08:00:00Z")
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const cal = (...events: string[]) => `BEGIN:VCALENDAR\r\n${events.join("\r\n")}\r\nEND:VCALENDAR\r\n`
const ev = (...lines: string[]) => ["BEGIN:VEVENT", ...lines, "END:VEVENT"].join("\r\n")
const parse = (ics: string) => parseBusyEvents(ics, { tenantTz: TZ, now: NOW })
const days = (ics: string) => parse(ics).map((b) => b.startsAt.toISOString().slice(0, 10)).sort()

describe("L82 — lecture de l'agenda", () => {
  it("un événement à J+150 (dans la fenêtre réservable) est bloqué", () => {
    const blocks = parse(cal(ev("UID:a", "DTSTART;VALUE=DATE:20270423", "DTEND;VALUE=DATE:20270424")))
    expect(externalBlocksForDay(blocks, "2027-04-23", TZ).fullDay).toBe(true)
  })

  const weekly = ev("UID:s", "DTSTART:20261125T090000Z", "DTEND:20261125T100000Z", "RRULE:FREQ=WEEKLY;COUNT=3")

  it("occurrence déplacée : l'ancien horaire est libéré, le nouveau bloqué", () => {
    const moved = ev("UID:s", "RECURRENCE-ID:20261202T090000Z", "DTSTART:20261203T090000Z", "DTEND:20261203T100000Z")
    expect(days(cal(weekly, moved))).toEqual(["2026-11-25", "2026-12-03", "2026-12-09"])
    expect(days(cal(moved, weekly))).toEqual(["2026-11-25", "2026-12-03", "2026-12-09"])
  })

  it("occurrence annulée ou passée « disponible » : plus bloquée", () => {
    for (const flag of ["STATUS:CANCELLED", "TRANSP:TRANSPARENT"]) {
      const o = ev("UID:s", "RECURRENCE-ID:20261202T090000Z", "DTSTART:20261202T090000Z", "DTEND:20261202T100000Z", flag)
      expect(days(cal(weekly, o))).toEqual(["2026-11-25", "2026-12-09"])
    }
  })

  it("BYSETPOS : « dernier jour ouvré du mois » ne bloque qu'un jour par mois", () => {
    const rule = "RRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;COUNT=3"
    const ics = cal(ev("UID:p", "DTSTART:20261130T090000Z", "DTEND:20261130T100000Z", rule))
    expect(days(ics)).toEqual(["2026-11-30", "2026-12-31", "2027-01-29"])
  })

  it("budget de calcul global : un fichier piégé est refusé au lieu de figer le serveur", () => {
    const old = Array.from({ length: 2000 }, (_, i) =>
      ev(`UID:x${i}`, "DTSTART:18000101T090000Z", "DTEND:18000101T100000Z", "RRULE:FREQ=DAILY"),
    )
    const t0 = Date.now()
    expect(() => parse(cal(...old))).toThrow()
    expect(Date.now() - t0).toBeLessThan(10_000)
  })

  it("une série ancienne mais normale reste lue", () => {
    const ics = cal(ev("UID:o", "DTSTART:20200101T090000Z", "DTEND:20200101T100000Z", "RRULE:FREQ=DAILY"))
    expect(days(ics)).toContain("2026-11-25")
  })
})

const ICS = cal(ev("UID:z", "DTSTART:20261130T090000Z", "DTEND:20261130T100000Z"))
const mkDeps = (res: { ok: true; text: string } | { ok: false; code: string }) => ({
  fetchIcs: vi.fn(async () => res),
  getExternalUrl: vi.fn(async () => "https://calendar.example.com/old.ics"),
  getTimezone: vi.fn(async () => TZ),
  markAttempt: vi.fn(async () => undefined),
  replaceBlocks: vi.fn(async () => true),
  saveCalendar: vi.fn(async () => undefined),
  recordError: vi.fn(async () => undefined),
})
const asDeps = (d: ReturnType<typeof mkDeps>) => d as unknown as SyncDeps

describe("L82 — enregistrement et relecture", () => {
  const URL_NEW = "https://calendar.example.com/new.ics"

  it("nouvelle adresse illisible : rien n'est enregistré, l'ancienne reste", async () => {
    for (const res of [{ ok: false as const, code: "http_error" }, { ok: true as const, text: "<html/>" }]) {
      const d = mkDeps(res)
      expect((await connectCalendar(1, URL_NEW, NOW, asDeps(d))).ok).toBe(false)
      expect(d.saveCalendar).not.toHaveBeenCalled()
      expect(d.recordError).not.toHaveBeenCalled()
    }
  })

  it("nouvelle adresse lisible : enregistrée avec ses créneaux", async () => {
    const d = mkDeps({ ok: true, text: ICS })
    expect(await connectCalendar(1, URL_NEW, NOW, asDeps(d))).toEqual({ ok: true, blocks: 1 })
    expect(d.saveCalendar).toHaveBeenCalledWith(1, URL_NEW, expect.any(Array), NOW)
  })

  it("la relecture marque la tentative avant de télécharger", async () => {
    const d = mkDeps({ ok: true, text: ICS })
    await syncCompany(1, NOW, asDeps(d))
    expect(d.markAttempt.mock.invocationCallOrder[0]).toBeLessThan(d.fetchIcs.mock.invocationCallOrder[0])
  })

  it("agenda délié ou changé pendant la lecture : résultat abandonné", async () => {
    const d = mkDeps({ ok: true, text: ICS })
    d.replaceBlocks.mockResolvedValueOnce(false)
    expect(await syncCompany(1, NOW, asDeps(d))).toEqual({ ok: false, code: "stale" })
    expect(d.replaceBlocks).toHaveBeenCalledWith(1, expect.any(Array), NOW, "https://calendar.example.com/old.ics")
    const store = read("lib/calendar-sync/store.ts")
    expect(store).toContain('.for("update")')
    expect(store).toMatch(/current\?\.externalUrl !== expectedUrl/)
  })

  it("le passage du cron s'arrête avant la limite de durée", async () => {
    let t = 0
    const sync = vi.fn(async () => {
      t += 10_000
      return { ok: true as const, blocks: 0 }
    })
    const ids = Array.from({ length: 30 }, (_, i) => i + 1)
    const res = await syncAllDue(NOW, { list: async () => ids, sync, clock: () => t })
    expect(sync.mock.calls.length).toBeLessThan(30)
    expect(res.checked).toBe(sync.mock.calls.length)
    expect(read("app/api/cron/calendar-sync/route.ts")).toContain("export const maxDuration = 60")
    expect(read("lib/calendar-sync/store.ts")).toContain("asc nulls first")
  })
})

describe("L82 — écran", () => {
  const panel = read("components/admin/calendar-sync-panel.tsx")

  it("durée relative", () => {
    const at = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString()
    expect(formatSince(at(0), NOW.getTime())).toBe("à l'instant")
    expect(formatSince(at(6), NOW.getTime())).toBe("il y a 6 min")
    expect(formatSince(at(125), NOW.getTime())).toBe("il y a 2 h")
    expect(formatSince(at(3 * 24 * 60), NOW.getTime())).toBe("il y a 3 jours")
    expect(panel).not.toContain("toLocaleString")
    expect(panel).toContain("pris en compte")
  })

  it("textes et pictogrammes de l'aperçu validé", () => {
    expect(panel).toContain("Seuls les horaires sont lus, jamais le titre.")
    expect(panel).toContain("Vos rendez-vous DetailFlow sont reconnus et ignorés automatiquement.")
    expect(panel).toContain("mis à jour automatiquement")
    expect(panel).toMatch(/PHONE_ICONS\[phone\]\[i\]/)
  })

  it("les messages d'échec disent que les derniers créneaux restent pris en compte", () => {
    for (const code of ["http_error", "too_large", "not_calendar", "timeout"]) {
      expect(syncErrorMessage(code)).toContain("derniers créneaux")
    }
  })

  it.each(["invalid_url", "blocked_host", "redirects"])(
    "adresse refusée après liaison (%s) : les derniers créneaux restent pris en compte",
    (code) => {
      expect(syncErrorMessage(code)).toBe(
        "Cette adresse n'est pas acceptée. Vérifiez que vous avez bien copié l'adresse privée de votre agenda. Vos derniers créneaux restent pris en compte.",
      )
    },
  )
})

describe("L82 — revue 2 : règles impossibles, message de liaison, mode d'emploi", () => {
  const trap = (count: number, start: string, rule: string) =>
    cal(
      ...Array.from({ length: count }, (_, i) =>
        ev(`UID:t${i}`, `DTSTART:${start}T090000Z`, `DTEND:${start}T100000Z`, `RRULE:${rule}`),
      ),
    )

  it.each([
    ["6e lundi du mois", 200, "01000101", "FREQ=MONTHLY;BYDAY=6MO,7MO,-6TU"],
    ["position 300 dans la semaine", 200, "01000101", "FREQ=WEEKLY;BYSETPOS=300"],
    ["30 février", 600, "01000230", "FREQ=YEARLY"],
  ])("une règle qui ne produit jamais rien consomme le budget (%s)", (_label, count, start, rule) => {
    const t0 = Date.now()
    expect(() => parse(trap(count, start, rule))).toThrow("calendar_too_complex")
    expect(Date.now() - t0).toBeLessThan(10_000)
  })

  it("un événement annuel antérieur à 1970 reste bloqué", () => {
    const ics = cal(ev("UID:y", "DTSTART;VALUE=DATE:19601225", "RRULE:FREQ=YEARLY"))
    expect(externalBlocksForDay(parse(ics), "2026-12-25", TZ).fullDay).toBe(true)
  })

  it("dernier jour du mois (BYMONTHDAY=-1)", () => {
    const ics = cal(ev("UID:m", "DTSTART:20261130T090000Z", "DTEND:20261130T100000Z", "RRULE:FREQ=MONTHLY;BYMONTHDAY=-1;COUNT=3"))
    expect(days(ics)).toEqual(["2026-11-30", "2026-12-31", "2027-01-31"])
  })

  it("liaison impossible : aucune promesse fausse", () => {
    for (const code of ["http_error", "too_large", "not_calendar", "timeout", "invalid_url", "network"]) {
      for (const existing of [false, true]) {
        expect(linkErrorMessage(code, existing)).not.toMatch(/derniers créneaux|réessayons/i)
      }
      expect(linkErrorMessage(code, false)).toContain("Agenda non relié")
      expect(linkErrorMessage(code, true)).toContain("votre ancien agenda reste relié")
    }
  })

  it("mode d'emploi d'abonnement et titres de l'aperçu", () => {
    const panel = read("components/admin/calendar-sync-panel.tsx")
    expect(panel).toContain("Réglages → Calendrier → Comptes → Ajouter un abonnement")
    expect(panel).toContain("Avec Google Agenda")
    expect(panel).toMatch(/SUBSCRIBE_HELP\.map/)
    expect(panel).toContain("1. Mes rendez-vous dans mon téléphone")
    expect(panel).toContain("2. Bloquer mes indisponibilités")
    expect(panel).toContain("Quel téléphone avez-vous ?")
  })
})

describe("L82 — boutons conformes à l'aperçu validé", () => {
  it("« Relier à mon téléphone » : bouton plein, placé après « Aujourd'hui »", () => {
    const calendar = read("components/admin/admin-calendar.tsx")
    expect(calendar.indexOf('href="/admin/mon-agenda"')).toBeGreaterThan(calendar.indexOf("Aujourd&apos;hui"))
    expect(calendar).toContain('href="/admin/mon-agenda" className={buttonVariants({ size: "sm" })}')
  })

  it("« Ajouter à Google Agenda » : bouton plein, comme celui de l'iPhone", () => {
    const panel = read("components/admin/calendar-sync-panel.tsx")
    const google = panel.slice(panel.indexOf("href={props.googleUrl}"), panel.indexOf("Ajouter à Google Agenda\n"))
    expect(google).toContain('buttonVariants({ size: "lg", className: "h-12 text-base" })')
    expect(google).not.toContain("outline")
  })
})

describe("L82 — flux : un nom saisi par un visiteur n'ajoute aucune ligne", () => {
  it("retour chariot seul et caractères de contrôle neutralisés", () => {
    const feed = buildFeed(
      [
        {
          id: 1,
          reference: "DF-20261130-1234",
          date: "2026-11-30",
          startTime: "09:00",
          endTime: "10:00",
          customerName: "Jean\rATTENDEE:mailto:x@example.com\u0000",
          customerPhone: "0600000000",
          address: "1 rue A\r\nBEGIN:VALARM",
          serviceNames: ["Lavage"],
        },
      ],
      { tz: TZ, now: NOW },
    )
    const unfolded = feed.replace(/\r\n /g, "")
    expect(unfolded.replace(/\r\n/g, "")).not.toMatch(/[\u0000-\u0008\u000a-\u001f\u007f]/)
    expect(unfolded).toContain("Jean\\nATTENDEE")
    expect(unfolded.split("\r\n")).not.toContain("BEGIN:VALARM")
  })
})
