import "server-only"

/**
 * L80 — Lecture sécurisée d'une adresse d'agenda fournie par l'utilisateur
 * (anti-SSRF). Règles : https/webcal seulement, port 443, pas d'IP ni d'hôte
 * interne, nom d'hôte résolu UNE fois par saut, TOUTES les IP contrôlées, puis
 * connexion sur l'IP validée (SNI/Host = nom d'origine) — anti DNS-rebinding.
 * Redirections revalidées (3 max). Lecture par paquets : 2 Mo max ET durée max
 * (8 s par lecture, 20 s au total).
 */

import { lookup } from "node:dns/promises"
import https from "node:https"
import net from "node:net"

export const MAX_BYTES = 2 * 1024 * 1024
export const MAX_REDIRECTS = 3
export const READ_TIMEOUT_MS = 8_000
export const TOTAL_TIMEOUT_MS = 20_000

export type FetchErrorCode = "invalid_url" | "blocked_host" | "redirects" | "timeout" | "too_large" | "http_error" | "network"
export type FetchResult = { ok: true; text: string } | { ok: false; code: FetchErrorCode }

export type RawResponse = {
  status: number
  location?: string
  contentLength?: number
  body: AsyncIterable<Uint8Array>
  destroy: () => void
}
export type FetchDeps = {
  resolveHost: (hostname: string) => Promise<string[]>
  request: (o: { ip: string; hostname: string; path: string; timeoutMs: number }) => Promise<RawResponse>
  now: () => number
}

/* ------------------------------ Validation ------------------------------ */

function ipv4Private(ip: string): boolean {
  const p = ip.split(".").map(Number)
  if (p.length !== 4 || p.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return true
  const [a, b] = p
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  )
}

/** Vrai si l'adresse n'est PAS publique (ou illisible). */
export function isPrivateIp(ip: string): boolean {
  const s = ip.trim().toLowerCase().replace(/^\[|\]$/g, "")
  if (net.isIPv4(s)) return ipv4Private(s)
  if (!net.isIPv6(s)) return true
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s)
  if (mapped) return ipv4Private(mapped[1])
  const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(s)
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16)
    const lo = parseInt(mappedHex[2], 16)
    return ipv4Private(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`)
  }
  if (s === "::" || s === "::1") return true
  const first = parseInt(s.split(":")[0] || "0", 16)
  if ((first & 0xfe00) === 0xfc00) return true // fc00::/7
  if ((first & 0xffc0) === 0xfe80) return true // fe80::/10
  if ((first & 0xff00) === 0xff00) return true // multicast
  if (first === 0x2001 && s.startsWith("2001:db8")) return true
  if (s.startsWith("64:ff9b")) return true
  return false
}

export type ParsedExternalUrl = { url: URL; hostname: string }

/** Valide une adresse saisie ; `webcal://` est converti en `https://`. */
export function parseExternalUrl(raw: string, base?: URL): ParsedExternalUrl | null {
  let input = raw.trim()
  if (!input || input.length > 2048) return null
  if (/^webcals?:\/\//i.test(input)) input = input.replace(/^webcals?:/i, "https:")
  let url: URL
  try {
    url = base ? new URL(input, base) : new URL(input)
  } catch {
    return null
  }
  if (url.protocol !== "https:") return null
  if (url.username || url.password) return null
  if (url.port && url.port !== "443") return null
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "")
  if (!hostname || hostname.startsWith("[") || net.isIP(hostname)) return null
  if (/^\d+$/.test(hostname.replace(/\./g, ""))) return null // formes numériques exotiques
  if (!hostname.includes(".")) return null
  if (hostname === "localhost" || /\.(localhost|local|internal|lan|home|corp|intranet)$/.test(hostname)) return null
  return { url, hostname }
}

/** Version masquée pour affichage (jamais l'adresse complète). */
export function maskExternalUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  const p = parseExternalUrl(raw)
  return p ? `${p.hostname}/…` : "adresse enregistrée"
}

/* ------------------------------ Réseau par défaut ------------------------------ */

export const defaultDeps: FetchDeps = {
  now: () => Date.now(),
  resolveHost: async (hostname) => (await lookup(hostname, { all: true, verbatim: true })).map((a) => a.address),
  request: ({ ip, hostname, path, timeoutMs }) =>
    new Promise<RawResponse>((resolve, reject) => {
      const req = https.request(
        {
          host: ip, // IP déjà validée : aucune seconde résolution DNS
          port: 443,
          servername: hostname, // SNI
          method: "GET",
          path,
          headers: { Host: hostname, Accept: "text/calendar, */*;q=0.1", "User-Agent": "DetailFlow-Agenda/1.0" },
          timeout: timeoutMs,
        },
        (res) => {
          const len = Number(res.headers["content-length"])
          resolve({
            status: res.statusCode ?? 0,
            location: typeof res.headers.location === "string" ? res.headers.location : undefined,
            contentLength: Number.isFinite(len) ? len : undefined,
            body: res as AsyncIterable<Uint8Array>,
            destroy: () => res.destroy(),
          })
        },
      )
      req.on("timeout", () => req.destroy(new Error("timeout")))
      req.on("error", reject)
      req.end()
    }),
}

/* ------------------------------ Lecture ------------------------------ */

const REDIRECTS = new Set([301, 302, 303, 307, 308])

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout>
  const timer = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new Error("timeout")), Math.max(1, ms))
  })
  return Promise.race([p, timer]).finally(() => clearTimeout(t))
}

export async function safeFetchIcs(rawUrl: string, deps: FetchDeps = defaultDeps): Promise<FetchResult> {
  const startedAt = deps.now()
  let current = parseExternalUrl(rawUrl)
  if (!current) return { ok: false, code: "invalid_url" }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const remaining = TOTAL_TIMEOUT_MS - (deps.now() - startedAt)
    if (remaining <= 0) return { ok: false, code: "timeout" }
    const budget = Math.min(READ_TIMEOUT_MS, remaining)
    const hopStart = deps.now()

    let addresses: string[]
    try {
      addresses = await withTimeout(deps.resolveHost(current.hostname), budget)
    } catch {
      return { ok: false, code: "network" }
    }
    if (!addresses.length || addresses.some(isPrivateIp)) return { ok: false, code: "blocked_host" }
    const ip = addresses[0]

    let res: RawResponse
    try {
      res = await withTimeout(
        deps.request({ ip, hostname: current.hostname, path: current.url.pathname + current.url.search, timeoutMs: budget }),
        budget - (deps.now() - hopStart),
      )
    } catch (e) {
      return { ok: false, code: e instanceof Error && e.message === "timeout" ? "timeout" : "network" }
    }

    if (REDIRECTS.has(res.status)) {
      res.destroy()
      if (hop === MAX_REDIRECTS || !res.location) return { ok: false, code: "redirects" }
      const next = parseExternalUrl(res.location, current.url)
      if (!next) return { ok: false, code: "blocked_host" }
      current = next
      continue
    }
    if (res.status < 200 || res.status >= 300) {
      res.destroy()
      return { ok: false, code: "http_error" }
    }
    if (res.contentLength !== undefined && res.contentLength > MAX_BYTES) {
      res.destroy()
      return { ok: false, code: "too_large" }
    }

    const chunks: Uint8Array[] = []
    let total = 0
    const iterator = res.body[Symbol.asyncIterator]()
    try {
      for (;;) {
        const left = budget - (deps.now() - hopStart)
        if (left <= 0) throw new Error("timeout")
        const next = await withTimeout(iterator.next(), left)
        if (next.done) break
        total += next.value.byteLength
        if (total > MAX_BYTES) {
          res.destroy()
          return { ok: false, code: "too_large" }
        }
        chunks.push(next.value)
      }
    } catch (e) {
      res.destroy()
      return { ok: false, code: e instanceof Error && e.message === "timeout" ? "timeout" : "network" }
    }
    return { ok: true, text: new TextDecoder("utf-8").decode(Buffer.concat(chunks)) }
  }
  return { ok: false, code: "redirects" }
}
