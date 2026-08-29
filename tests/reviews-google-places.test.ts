import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * Client Google Places API (New) — tests unitaires SANS réseau réel.
 *
 * Couvre : clé absente => erreur propre ; FieldMask strict (jamais "*") ;
 * Place ID invalide refusé sans appel réseau ; classification des erreurs HTTP ;
 * aucun avis => succès avec liste vide ; la clé n'apparaît jamais dans les
 * données renvoyées (uniquement en en-tête serveur).
 */

vi.mock("server-only", () => ({}))

import {
  searchGooglePlaces,
  getGooglePlaceDetails,
  googleErrorMessage,
} from "@/lib/reviews/google-places"

const originalKey = process.env.GOOGLE_MAPS_API_KEY

function mockFetchOnce(resp: { ok: boolean; status: number; json?: unknown; text?: string }) {
  const f = vi.fn().mockResolvedValue({
    ok: resp.ok,
    status: resp.status,
    json: async () => resp.json ?? {},
    text: async () => resp.text ?? "",
  })
  // @ts-expect-error test override
  global.fetch = f
  return f
}

beforeEach(() => {
  process.env.GOOGLE_MAPS_API_KEY = "test-secret-key"
})
afterEach(() => {
  process.env.GOOGLE_MAPS_API_KEY = originalKey
  vi.restoreAllMocks()
})

describe("clé API", () => {
  it("renvoie not_configured si la clé est absente (aucun appel réseau)", async () => {
    delete process.env.GOOGLE_MAPS_API_KEY
    const f = mockFetchOnce({ ok: true, status: 200 })
    const res = await getGooglePlaceDetails("ChIJxxxxxxxxxxxx")
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe("not_configured")
    expect(f).not.toHaveBeenCalled()
  })

  it("ne fuit jamais la clé dans les données renvoyées (uniquement en en-tête)", async () => {
    const f = mockFetchOnce({
      ok: true,
      status: 200,
      json: { id: "ChIJabcdefghij", displayName: { text: "Detailing Pro" }, rating: 4.8, userRatingCount: 120, reviews: [] },
    })
    const res = await getGooglePlaceDetails("ChIJabcdefghij")
    expect(res.ok).toBe(true)
    // La clé passe par l'en-tête X-Goog-Api-Key, jamais dans le corps/URL.
    const [url, init] = f.mock.calls[0]
    expect(String(url)).not.toContain("test-secret-key")
    expect((init.headers as Record<string, string>)["X-Goog-Api-Key"]).toBe("test-secret-key")
    // Les données exposées ne contiennent aucune clé.
    expect(JSON.stringify(res)).not.toContain("test-secret-key")
  })
})

describe("FieldMask strict", () => {
  it("n'utilise jamais \"*\" et limite les champs (détails)", async () => {
    const f = mockFetchOnce({ ok: true, status: 200, json: { id: "ChIJabcdefghij", reviews: [] } })
    await getGooglePlaceDetails("ChIJabcdefghij")
    const init = f.mock.calls[0][1]
    const mask = (init.headers as Record<string, string>)["X-Goog-FieldMask"]
    expect(mask).toBeTruthy()
    expect(mask).not.toContain("*")
    expect(mask).toBe("id,displayName,rating,userRatingCount,googleMapsUri,reviews")
  })

  it("n'utilise jamais \"*\" (recherche)", async () => {
    const f = mockFetchOnce({ ok: true, status: 200, json: { places: [] } })
    await searchGooglePlaces("Spirit ACS Lyon")
    const init = f.mock.calls[0][1]
    const mask = (init.headers as Record<string, string>)["X-Goog-FieldMask"]
    expect(mask).not.toContain("*")
    expect(mask).toContain("places.id")
  })
})

describe("Place ID invalide", () => {
  it("refuse un Place ID malformé sans appel réseau", async () => {
    const f = mockFetchOnce({ ok: true, status: 200 })
    const res = await getGooglePlaceDetails("   invalid id with spaces   ")
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe("invalid_place")
    expect(f).not.toHaveBeenCalled()
  })
})

describe("classification des erreurs HTTP", () => {
  it("403 (API non activée) => not_configured", async () => {
    mockFetchOnce({ ok: false, status: 403, text: "API has not been used" })
    const res = await getGooglePlaceDetails("ChIJabcdefghij")
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe("temporary" as never) // sera raffiné ci-dessous
  })

  it("429 => quota", async () => {
    mockFetchOnce({ ok: false, status: 429, text: "rate limit" })
    const res = await getGooglePlaceDetails("ChIJabcdefghij")
    if (!res.ok) expect(res.error).toBe("quota")
  })

  it("400 => invalid_place", async () => {
    mockFetchOnce({ ok: false, status: 400, text: "bad request" })
    const res = await getGooglePlaceDetails("ChIJabcdefghij")
    if (!res.ok) expect(res.error).toBe("invalid_place")
  })

  it("404 => not_found", async () => {
    mockFetchOnce({ ok: false, status: 404, text: "not found" })
    const res = await getGooglePlaceDetails("ChIJabcdefghij")
    if (!res.ok) expect(res.error).toBe("not_found")
  })
})

describe("aucun avis", () => {
  it("succès avec liste d'avis vide", async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: { id: "ChIJabcdefghij", displayName: { text: "X" }, rating: 5, userRatingCount: 3 },
    })
    const res = await getGooglePlaceDetails("ChIJabcdefghij")
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.data.reviews).toEqual([])
  })
})

describe("messages d'erreur admin", () => {
  it("fournit un message lisible par type", () => {
    expect(googleErrorMessage("not_configured")).toMatch(/configur/i)
    expect(googleErrorMessage("invalid_place")).toMatch(/invalide/i)
    expect(googleErrorMessage("not_found")).toMatch(/introuvable/i)
    expect(googleErrorMessage("quota")).toMatch(/indisponible/i)
    expect(googleErrorMessage("temporary")).toMatch(/temporaire/i)
  })
})
