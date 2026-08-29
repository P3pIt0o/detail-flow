import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Tests de la couche SOURCE des avis (config + résolution publique centralisée).
 *
 * On mocke @/lib/db pour ne JAMAIS toucher Neon. Chaque test contrôle le SQL
 * réellement émis afin de garantir : défaut "manual", repli défensif si colonnes
 * absentes, isolation par company_id, et absence de toute suppression d'avis.
 */

type ExecCall = { text: string; params: unknown[] }
const execCalls: ExecCall[] = []
let execImpl: (call: ExecCall) => unknown = () => ({ rows: [] })

// Capture le SQL tag Drizzle sous une forme inspectable. On extrait les parties
// statiques (StringChunk.value) des queryChunks : suffisant pour vérifier le
// verbe SQL (UPDATE/SELECT) et l'absence de DELETE/DROP/TRUNCATE.
function extractText(node: unknown, out: string[]): void {
  if (node == null) return
  if (typeof node === "string") {
    out.push(node)
    return
  }
  if (Array.isArray(node)) {
    for (const n of node) extractText(n, out)
    return
  }
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>
    if ("value" in obj) extractText(obj.value, out)
    if ("queryChunks" in obj) extractText(obj.queryChunks, out)
  }
}

function serializeSql(query: unknown): ExecCall {
  const out: string[] = []
  extractText(query, out)
  return { text: out.join(" "), params: [] }
}

const dbSelectChain = {
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn(),
}

vi.mock("@/lib/db", () => ({
  db: {
    execute: vi.fn(async (query: unknown) => {
      // Drizzle passe un objet SQL ; on le sérialise grossièrement + on lit les
      // valeurs interpolées exposées par le mock via un champ injecté au besoin.
      const call = serializeSql(query)
      execCalls.push(call)
      return execImpl(call)
    }),
    select: vi.fn(() => dbSelectChain),
  },
}))

// Le schéma n'est pas utilisé pour ses colonnes ici (select mocké).
vi.mock("@/lib/db/schema", () => ({ reviews: {} }))

// Google est mocké : la résolution publique ne doit jamais appeler le vrai réseau.
const getGooglePlaceDetailsMock = vi.fn()
vi.mock("@/lib/reviews/google-places", () => ({
  getGooglePlaceDetails: (...args: unknown[]) => getGooglePlaceDetailsMock(...args),
}))

import {
  getReviewsSourceConfig,
  saveReviewsSourceConfig,
  DEFAULT_REVIEWS_CONFIG,
} from "@/lib/reviews/config"
import { resolveTenantReviews } from "@/lib/reviews/public"

beforeEach(() => {
  execCalls.length = 0
  execImpl = () => ({ rows: [] })
  getGooglePlaceDetailsMock.mockReset()
  dbSelectChain.orderBy.mockReset()
})

describe("getReviewsSourceConfig", () => {
  it("retourne 'manual' par défaut quand aucune ligne n'existe (rétrocompat)", async () => {
    execImpl = () => ({ rows: [] })
    const cfg = await getReviewsSourceConfig(42)
    expect(cfg).toEqual(DEFAULT_REVIEWS_CONFIG)
    expect(cfg.source).toBe("manual")
  })

  it("retombe sur 'manual' si les colonnes n'existent pas (migration non jouée)", async () => {
    execImpl = () => {
      throw new Error('column "reviews_source" does not exist')
    }
    const cfg = await getReviewsSourceConfig(42)
    expect(cfg.source).toBe("manual")
    expect(cfg.googlePlaceId).toBeNull()
  })

  it("lit source=google + placeId quand la colonne est renseignée", async () => {
    execImpl = () => ({ rows: [{ reviews_source: "google", google_place_id: "places/ChIJ123" }] })
    const cfg = await getReviewsSourceConfig(7)
    expect(cfg.source).toBe("google")
    expect(cfg.googlePlaceId).toBe("places/ChIJ123")
  })

  it("refuse un companyId invalide sans requête", async () => {
    const cfg = await getReviewsSourceConfig(0)
    expect(cfg).toEqual(DEFAULT_REVIEWS_CONFIG)
    expect(execCalls.length).toBe(0)
  })
})

describe("saveReviewsSourceConfig", () => {
  it("exige la migration si les colonnes sont absentes (pas d'UPDATE)", async () => {
    // 1er execute = check colonnes -> renvoie 0 colonne.
    execImpl = () => ({ rows: [] })
    const res = await saveReviewsSourceConfig(1, "google", "places/abc")
    expect(res.ok).toBe(false)
    expect(res.migrationRequired).toBe(true)
    // Aucun UPDATE ne doit apparaître.
    expect(execCalls.some((c) => /UPDATE/i.test(c.text))).toBe(false)
  })

  it("refuse google sans placeId, sans vérifier la base", async () => {
    const res = await saveReviewsSourceConfig(1, "google", null)
    expect(res.ok).toBe(false)
    expect(execCalls.length).toBe(0)
  })

  it("écrit UPDATE settings (jamais DELETE sur reviews) quand les colonnes existent", async () => {
    let call = 0
    execImpl = () => {
      call += 1
      // 1er appel : check colonnes -> 2 colonnes présentes.
      if (call === 1) return { rows: [{ column_name: "reviews_source" }, { column_name: "google_place_id" }] }
      // 2e appel : l'UPDATE touche bien la ligne du tenant (rowCount = 1).
      return { rows: [], rowCount: 1 }
    }
    const res = await saveReviewsSourceConfig(9, "manual", null)
    expect(res.ok).toBe(true)
    const joined = execCalls.map((c) => c.text).join(" ")
    expect(/UPDATE settings/i.test(joined)).toBe(true)
    // ANTI-RÉGRESSION : la table settings utilise des identifiants camelCase
    // QUOTÉS. On doit référencer "companyId"/"updatedAt" (et jamais les variantes
    // snake_case company_id/updated_at qui n'existent pas -> cause du bug).
    expect(joined).toContain('"companyId"')
    expect(joined).toContain('"updatedAt"')
    expect(/\bcompany_id\b/.test(joined)).toBe(false)
    expect(/\bupdated_at\b/.test(joined)).toBe(false)
    // GARANTIE anti-suppression : aucune requête destructive sur les avis.
    expect(/DELETE/i.test(joined)).toBe(false)
    expect(/DROP|TRUNCATE/i.test(joined)).toBe(false)
  })

  it("échoue proprement si aucune ligne settings n'est mise à jour (tenant introuvable)", async () => {
    let call = 0
    execImpl = () => {
      call += 1
      if (call === 1) return { rows: [{ column_name: "reviews_source" }, { column_name: "google_place_id" }] }
      return { rows: [], rowCount: 0 } // aucune ligne pour ce tenant
    }
    const res = await saveReviewsSourceConfig(999, "manual", null)
    expect(res.ok).toBe(false)
  })
})

describe("resolveTenantReviews (sélection de source centralisée)", () => {
  it("mode manuel : renvoie les avis manuels, n'appelle jamais Google", async () => {
    execImpl = () => ({ rows: [] }) // config -> manual par défaut
    const manual = [{ id: "1", author: "A", vehicle: "", rating: 5, text: "top", date: "2024-01-01" }]
    const out = await resolveTenantReviews(3, { manualReviews: manual })
    expect(out.source).toBe("manual")
    if (out.source === "manual") expect(out.reviews).toEqual(manual)
    expect(getGooglePlaceDetailsMock).not.toHaveBeenCalled()
  })

  it("mode google : renvoie les données Google, jamais les avis manuels", async () => {
    execImpl = () => ({ rows: [{ reviews_source: "google", google_place_id: "places/x" }] })
    getGooglePlaceDetailsMock.mockResolvedValue({
      ok: true,
      data: { placeId: "places/x", name: "Garage X", rating: 4.8, userRatingCount: 120, reviews: [], googleMapsUri: "https://maps.google.com/x" },
    })
    const out = await resolveTenantReviews(3, { manualReviews: [{ id: "1", author: "A", vehicle: "", rating: 5, text: "top", date: "2024-01-01" }] })
    expect(out.source).toBe("google")
    if (out.source === "google") {
      expect(out.data?.name).toBe("Garage X")
      // Les avis manuels ne fuitent jamais dans la sortie Google.
      expect(out).not.toHaveProperty("reviews")
    }
  })

  it("mode google en panne : repli propre (data null + error), pas de crash", async () => {
    execImpl = () => ({ rows: [{ reviews_source: "google", google_place_id: "places/x" }] })
    getGooglePlaceDetailsMock.mockResolvedValue({ ok: false, error: "api_unavailable" })
    const out = await resolveTenantReviews(3)
    expect(out.source).toBe("google")
    if (out.source === "google") {
      expect(out.data).toBeNull()
      expect(out.error).toBe("api_unavailable")
    }
  })
})
