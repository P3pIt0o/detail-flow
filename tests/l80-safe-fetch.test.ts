import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import {
  MAX_BYTES,
  MAX_REDIRECTS,
  isPrivateIp,
  maskExternalUrl,
  parseExternalUrl,
  safeFetchIcs,
  type FetchDeps,
  type RawResponse,
} from "@/lib/calendar-sync/safe-fetch"
import { externalBlocksForDay, parseBusyEvents } from "@/lib/calendar-sync/ics-parse"

const enc = new TextEncoder()
const ICS = "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n"

async function* chunks(parts: Uint8Array[]) {
  for (const p of parts) yield p
}
const ok = (body: string | Uint8Array[], extra: Partial<RawResponse> = {}): RawResponse => ({
  status: 200,
  body: chunks(typeof body === "string" ? [enc.encode(body)] : body),
  destroy: vi.fn(),
  ...extra,
})

function deps(over: Partial<FetchDeps> = {}): FetchDeps & { clock: { t: number } } {
  const clock = { t: 0 }
  return {
    clock,
    now: () => clock.t,
    resolveHost: vi.fn(async () => ["93.184.216.34"]),
    request: vi.fn(async () => ok(ICS)),
    ...over,
  }
}

describe("L80 — adresses refusées", () => {
  it.each([
    "http://example.com/a.ics",
    "ftp://example.com/a.ics",
    "https://localhost/a.ics",
    "https://127.0.0.1/a.ics",
    "https://10.0.0.5/a.ics",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/a.ics",
    "https://2130706433/a.ics",
    "https://calendar.local/a.ics",
    "https://intranet/a.ics",
    "https://user:pass@example.com/a.ics",
    "https://example.com:8443/a.ics",
    "https://example.com:80/a.ics",
    "",
    "pas une adresse",
  ])("refuse %s", (u) => {
    expect(parseExternalUrl(u)).toBeNull()
  })

  it("accepte https et webcal (converti en https), port 443", () => {
    expect(parseExternalUrl("webcal://p01-caldav.icloud.com/published/2/abc")?.url.protocol).toBe("https:")
    expect(parseExternalUrl("https://calendar.google.com:443/x.ics")?.hostname).toBe("calendar.google.com")
  })

  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fe80::1", "fc00::1", "::ffff:127.0.0.1", "::ffff:7f00:1"])(
    "IP non publique : %s",
    (ip) => expect(isPrivateIp(ip)).toBe(true),
  )
  it.each(["93.184.216.34", "8.8.8.8", "2606:4700:4700::1111"])("IP publique : %s", (ip) => expect(isPrivateIp(ip)).toBe(false))

  it("l'adresse n'est jamais affichée en entier", () => {
    const masked = maskExternalUrl("https://calendar.google.com/calendar/ical/SECRET-TOKEN/private-abc/basic.ics")
    expect(masked).toBe("calendar.google.com/…")
    expect(masked).not.toContain("SECRET")
  })

  it("refus propagé par safeFetchIcs sans aucun appel réseau", async () => {
    const d = deps()
    for (const u of ["http://example.com/a", "https://localhost/a", "https://127.0.0.1/a", "https://10.0.0.1/a", "https://169.254.169.254/", "https://[::1]/", "https://example.com:8080/a"]) {
      expect(await safeFetchIcs(u, d)).toEqual({ ok: false, code: "invalid_url" })
    }
    expect(d.resolveHost).not.toHaveBeenCalled()
    expect(d.request).not.toHaveBeenCalled()
  })

  it("hôte résolu vers une IP privée (ou mélange public/privé) refusé", async () => {
    for (const addrs of [["10.0.0.7"], ["93.184.216.34", "192.168.0.1"], ["::1"], []]) {
      const d = deps({ resolveHost: vi.fn(async () => addrs) })
      expect(await safeFetchIcs("https://evil.example.com/a.ics", d)).toEqual({ ok: false, code: "blocked_host" })
      expect(d.request).not.toHaveBeenCalled()
    }
  })
})

describe("L80 — connexion à l'adresse vérifiée (anti DNS-rebinding)", () => {
  it("un hôte qui répond d'abord une IP publique puis une IP privée n'est jamais recontacté", async () => {
    const resolveHost = vi.fn<(h: string) => Promise<string[]>>()
    resolveHost.mockResolvedValueOnce(["93.184.216.34"]).mockResolvedValue(["10.0.0.1"])
    const request = vi.fn(async () => ok(ICS))
    const d = deps({ resolveHost, request })
    const res = await safeFetchIcs("https://rebind.example.com/cal.ics", d)
    expect(res).toEqual({ ok: true, text: ICS })
    expect(resolveHost).toHaveBeenCalledTimes(1) // une seule résolution : pas de seconde chance pour le DNS
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ ip: "93.184.216.34", hostname: "rebind.example.com" }))
  })

  it("chaque redirection est résolue et contrôlée ; IP validée utilisée à chaque saut", async () => {
    const resolveHost = vi.fn(async (h: string) => (h === "a.example.com" ? ["93.184.216.34"] : ["93.184.216.35"]))
    const request = vi
      .fn()
      .mockResolvedValueOnce({ status: 302, location: "https://b.example.com/final", body: chunks([]), destroy: vi.fn() })
      .mockResolvedValueOnce(ok(ICS))
    const res = await safeFetchIcs("https://a.example.com/x", deps({ resolveHost, request }))
    expect(res.ok).toBe(true)
    expect(request.mock.calls[0][0]).toMatchObject({ ip: "93.184.216.34", hostname: "a.example.com", path: "/x" })
    expect(request.mock.calls[1][0]).toMatchObject({ ip: "93.184.216.35", hostname: "b.example.com", path: "/final" })
  })

  it("redirection vers une adresse interne refusée", async () => {
    for (const location of ["http://127.0.0.1/x", "https://169.254.169.254/x", "https://10.0.0.1/x", "https://[::1]/x", "https://example.com:9000/x"]) {
      const request = vi.fn().mockResolvedValue({ status: 301, location, body: chunks([]), destroy: vi.fn() })
      const res = await safeFetchIcs("https://a.example.com/x", deps({ request }))
      expect(res).toEqual({ ok: false, code: "blocked_host" })
      expect(request).toHaveBeenCalledTimes(1)
    }
  })

  it("redirection vers un hôte qui se résout en IP privée refusée", async () => {
    const resolveHost = vi.fn(async (h: string) => (h === "a.example.com" ? ["93.184.216.34"] : ["10.0.0.9"]))
    const request = vi.fn().mockResolvedValue({ status: 302, location: "https://internal.example.com/", body: chunks([]), destroy: vi.fn() })
    expect(await safeFetchIcs("https://a.example.com/", deps({ resolveHost, request }))).toEqual({ ok: false, code: "blocked_host" })
    expect(request).toHaveBeenCalledTimes(1)
  })

  it(`plus de ${MAX_REDIRECTS} redirections = refus`, async () => {
    const request = vi.fn().mockImplementation(async () => ({ status: 302, location: "https://a.example.com/next", body: chunks([]), destroy: vi.fn() }))
    expect(await safeFetchIcs("https://a.example.com/", deps({ request }))).toEqual({ ok: false, code: "redirects" })
    expect(request).toHaveBeenCalledTimes(MAX_REDIRECTS + 1)
  })

  it("code HTTP d'erreur → http_error", async () => {
    const request = vi.fn().mockResolvedValue(ok("", { status: 404 }))
    expect(await safeFetchIcs("https://a.example.com/", deps({ request }))).toEqual({ ok: false, code: "http_error" })
  })
})

describe("L80 — lecture par paquets : taille et durée", () => {
  it("limite : 10 Mo", () => {
    expect(MAX_BYTES).toBe(10 * 1024 * 1024)
  })

  it("agenda de plus de 2 Mo lu puis analysé : le créneau attendu est bloqué", async () => {
    // Descriptions volumineuses : le poids vient du texte, pas du nombre d'événements.
    const filler = Array.from(
      { length: 600 },
      (_, i) => `BEGIN:VEVENT\r\nUID:old-${i}\r\nDTSTART:20200101T090000Z\r\nDTEND:20200101T100000Z\r\nDESCRIPTION:${"x".repeat(4000)}\r\nEND:VEVENT\r\n`,
    ).join("")
    const wanted = "BEGIN:VEVENT\r\nUID:futur\r\nDTSTART:20261130T090000Z\r\nDTEND:20261130T100000Z\r\nEND:VEVENT\r\n"
    const big = `BEGIN:VCALENDAR\r\n${filler}${wanted}END:VCALENDAR\r\n`
    expect(enc.encode(big).length).toBeGreaterThan(2 * 1024 * 1024)

    const request = vi.fn().mockResolvedValue(ok(big))
    const res = await safeFetchIcs("https://a.example.com/", deps({ request }))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const blocks = parseBusyEvents(res.text, { tenantTz: "Europe/Paris", now: new Date("2026-11-26T12:00:00Z") })
    expect(externalBlocksForDay(blocks, "2026-11-30", "Europe/Paris").ranges).toEqual([{ start: 600, end: 660 }])
  })

  it("réponse sans Content-Length dépassant 10 Mo coupée en route", async () => {
    let produced = 0
    async function* big() {
      for (;;) {
        produced += 256 * 1024
        yield new Uint8Array(256 * 1024)
        if (produced > MAX_BYTES * 10) return // garde-fou du test
      }
    }
    const destroy = vi.fn()
    const request = vi.fn().mockResolvedValue({ status: 200, body: big(), destroy })
    expect(await safeFetchIcs("https://a.example.com/", deps({ request }))).toEqual({ ok: false, code: "too_large" })
    expect(produced).toBeLessThanOrEqual(MAX_BYTES + 512 * 1024) // arrêt immédiat au dépassement
    expect(destroy).toHaveBeenCalled()
  })

  it("Content-Length annoncé trop grand = refus avant lecture", async () => {
    const request = vi.fn().mockResolvedValue(ok(ICS, { contentLength: MAX_BYTES + 1 }))
    expect(await safeFetchIcs("https://a.example.com/", deps({ request }))).toEqual({ ok: false, code: "too_large" })
  })

  it("exactement 10 Mo accepté, avec Content-Length", async () => {
    const request = vi.fn().mockResolvedValue(ok([new Uint8Array(MAX_BYTES)], { contentLength: MAX_BYTES }))
    expect((await safeFetchIcs("https://a.example.com/", deps({ request }))).ok).toBe(true)
  })

  it("exactement 10 Mo accepté, sans Content-Length", async () => {
    const request = vi.fn().mockResolvedValue(ok([new Uint8Array(MAX_BYTES)]))
    expect((await safeFetchIcs("https://a.example.com/", deps({ request }))).ok).toBe(true)
  })

  it("serveur qui goutte-à-goutte coupé après la durée max", async () => {
    const d = deps()
    async function* drip() {
      for (;;) {
        d.clock.t += 3_000 // chaque paquet arrive 3 s plus tard
        yield enc.encode("x")
      }
    }
    const destroy = vi.fn()
    const request = vi.fn().mockResolvedValue({ status: 200, body: drip(), destroy })
    const res = await safeFetchIcs("https://slow.example.com/", { ...d, request })
    expect(res).toEqual({ ok: false, code: "timeout" })
    expect(destroy).toHaveBeenCalled()
  })

  it("serveur muet : coupé par le délai de lecture", async () => {
    vi.useFakeTimers()
    try {
      const hang: AsyncIterable<Uint8Array> = { [Symbol.asyncIterator]: () => ({ next: () => new Promise<never>(() => undefined) }) }
      const request = vi.fn().mockResolvedValue({ status: 200, body: hang, destroy: vi.fn() })
      const d = { ...deps({ request }), now: () => Date.now() }
      const p = safeFetchIcs("https://mute.example.com/", d)
      await vi.advanceTimersByTimeAsync(9_000)
      expect(await p).toEqual({ ok: false, code: "timeout" })
    } finally {
      vi.useRealTimers()
    }
  })

  it("erreur réseau → network (rien ne fuit)", async () => {
    const request = vi.fn().mockRejectedValue(new Error("ECONNRESET 10.0.0.1"))
    expect(await safeFetchIcs("https://a.example.com/", deps({ request }))).toEqual({ ok: false, code: "network" })
  })
})
