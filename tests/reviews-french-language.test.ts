import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * Règle métier : TOUS les avis publics DetailFlow doivent être en FRANÇAIS.
 *
 * Ce fichier couvre :
 *  - la langue forcée "fr" À LA SOURCE (mutualisée, tous tenants) ;
 *  - la sélection d'affichage française (helper pur `selectFrenchReviewText`) ;
 *  - l'absence de logique spécifique à un tenant (fonction tenant-agnostique).
 */

vi.mock("server-only", () => ({}))

import { getGooglePlaceDetails, selectFrenchReviewText } from "@/lib/reviews/google-places"

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

// Petit constructeur d'avis pour alléger les cas.
function review(partial: Partial<Parameters<typeof selectFrenchReviewText>[0]>) {
  return {
    text: null,
    languageCode: null,
    originalText: null,
    originalLanguageCode: null,
    ...partial,
  }
}

describe("langue forcée fr à la source (mutualisée)", () => {
  it("envoie languageCode=fr par défaut quand l'appelant n'en fournit aucune", async () => {
    const f = mockFetchOnce({ ok: true, status: 200, json: { id: "ChIJabcdefghij", reviews: [] } })
    await getGooglePlaceDetails("ChIJabcdefghij")
    const url = String(f.mock.calls[0][0])
    expect(url).toContain("languageCode=fr")
  })

  it("respecte une langue explicite mais l'envoie toujours (Spirit → fr)", async () => {
    const f = mockFetchOnce({ ok: true, status: 200, json: { id: "ChIJabcdefghij", reviews: [] } })
    await getGooglePlaceDetails("ChIJabcdefghij", { languageCode: "fr" })
    const url = String(f.mock.calls[0][0])
    expect(url).toContain("languageCode=fr")
  })
})

describe("sélection française à l'affichage", () => {
  it("TEST 1 — avis original français → texte français, non traduit", () => {
    const r = review({ text: "Service impeccable, équipe rapide.", languageCode: "fr" })
    const { text, translatedByGoogle } = selectFrenchReviewText(r)
    expect(text).toBe("Service impeccable, équipe rapide.")
    expect(translatedByGoogle).toBe(false)
  })

  it("TEST 1bis — original français + localisé français (pas d'attribution)", () => {
    const r = review({
      text: "Très bon travail.",
      languageCode: "fr",
      originalText: "Très bon travail.",
      originalLanguageCode: "fr",
    })
    expect(selectFrenchReviewText(r).translatedByGoogle).toBe(false)
  })

  it("TEST 2 — avis original anglais → version française affichée + attribution", () => {
    const r = review({
      text: "Service impeccable ! L'équipe a été très rapide.",
      languageCode: "fr",
      originalText: "Impeccable service! The team was very quick.",
      originalLanguageCode: "en",
    })
    const { text, translatedByGoogle } = selectFrenchReviewText(r)
    expect(text).toBe("Service impeccable ! L'équipe a été très rapide.")
    expect(translatedByGoogle).toBe(true)
  })

  it("TEST 3 — avis dans une autre langue → version française affichée", () => {
    const r = review({
      text: "Excellent service, je recommande.",
      languageCode: "fr",
      originalText: "Servicio excelente, lo recomiendo.",
      originalLanguageCode: "es",
    })
    const { text, translatedByGoogle } = selectFrenchReviewText(r)
    expect(text).toBe("Excellent service, je recommande.")
    expect(translatedByGoogle).toBe(true)
  })

  it("TEST 4 — original + traduction française → traduction française sélectionnée", () => {
    const r = review({
      text: "Prestation de grande qualité.",
      languageCode: "fr-FR",
      originalText: "High quality service.",
      originalLanguageCode: "en",
    })
    expect(selectFrenchReviewText(r).text).toBe("Prestation de grande qualité.")
  })

  it("TEST 5 — original français + traduction NON française → ne pas prendre la traduction", () => {
    // Cas défensif : Google renvoie un `text` anglais alors que l'original est
    // français. On NE doit PAS afficher l'anglais : on affiche l'original fr.
    const r = review({
      text: "Impeccable service! Very quick.",
      languageCode: "en",
      originalText: "Service impeccable ! Très rapide.",
      originalLanguageCode: "fr",
    })
    const { text, translatedByGoogle } = selectFrenchReviewText(r)
    expect(text).toBe("Service impeccable ! Très rapide.")
    expect(translatedByGoogle).toBe(false)
  })

  it("TEST 6 — aucune version française fiable → repli sur meilleure donnée Google", () => {
    // Ni le localisé ni l'original ne sont français (edge très improbable une
    // fois fr demandé). On affiche la meilleure donnée disponible sans mentir.
    const r = review({
      text: "Great service.",
      languageCode: "en",
      originalText: "Servizio eccellente.",
      originalLanguageCode: "it",
    })
    const { text } = selectFrenchReviewText(r)
    expect(text).toBe("Great service.")
  })

  it("repli sans traduction (texte unique) → affiché tel quel, non traduit", () => {
    const r = review({ text: "Parfait.", languageCode: "fr" })
    expect(selectFrenchReviewText(r)).toEqual({ text: "Parfait.", translatedByGoogle: false })
  })

  it("aucun texte du tout → null", () => {
    expect(selectFrenchReviewText(review({})).text).toBeNull()
  })

  it("TESTS 7/8/9 — logique tenant-agnostique (aucune fuite, aucun cas Prestige)", () => {
    // Le même avis produit STRICTEMENT le même résultat quel que soit le tenant :
    // la fonction ne reçoit ni companyId, ni slug, ni identité tenant. La règle
    // française s'applique donc identiquement aux tenants standards et
    // personnalisés, sans traitement spécifique ni possibilité de fuite.
    const r = review({
      text: "Travail soigné.",
      languageCode: "fr",
      originalText: "Neat work.",
      originalLanguageCode: "en",
    })
    const first = selectFrenchReviewText(r)
    const second = selectFrenchReviewText(r)
    expect(first).toEqual(second)
    expect(first).toEqual({ text: "Travail soigné.", translatedByGoogle: true })
    // Garde-fou anti-régression : la source du helper ne référence aucun tenant.
    expect(selectFrenchReviewText.toString().toLowerCase()).not.toContain("prestige")
  })
})
