import { describe, it, expect } from "vitest"
import {
  buildDraftKey,
  serializeDraft,
  parseDraft,
  isDraftMeaningful,
  BOOKING_FORM_VERSION,
  DRAFT_MAX_AGE_MS,
  type BookingDraft,
} from "@/lib/booking/draft"
import type { VehicleSelection } from "@/components/booking/shared"

const emptyContact = { name: "", email: "", phone: "", address: "", notes: "" }

function vehicle(partial: Partial<VehicleSelection> = {}): VehicleSelection {
  return {
    uid: "v1",
    vehicleTypeId: null,
    services: [{ lid: "l1", serviceId: null, optionIds: [] }],
    ...partial,
  }
}

function baseState(overrides: Partial<Omit<BookingDraft, "v" | "savedAt">> = {}) {
  return {
    step: 0,
    vehicles: [vehicle()],
    date: null as string | null,
    startTime: null as string | null,
    contact: { ...emptyContact },
    promoInput: "",
    ...overrides,
  }
}

describe("buildDraftKey — isolation par tenant + version", () => {
  it("sépare les clés par tenant", () => {
    expect(buildDraftKey("spirit-acs")).not.toBe(buildDraftKey("autre-tenant"))
  })
  it("intègre la version de formulaire", () => {
    expect(buildDraftKey("t")).toContain(`v${BOOKING_FORM_VERSION}`)
  })
  it("gère un tenant nul sans planter", () => {
    expect(buildDraftKey(null)).toContain("df:booking:_:")
  })
})

describe("serialize/parse — aller-retour fidèle", () => {
  it("restaure exactement l'état saisi", () => {
    const state = baseState({
      step: 2,
      date: "2026-09-01",
      startTime: "10:00",
      contact: { name: "Jean", email: "j@ex.fr", phone: "0600000000", address: "1 rue X", notes: "code 42" },
      promoInput: "WELCOME10",
    })
    const parsed = parseDraft(serializeDraft(state, 1_000))
    expect(parsed).not.toBeNull()
    expect(parsed!.step).toBe(2)
    expect(parsed!.date).toBe("2026-09-01")
    expect(parsed!.contact.name).toBe("Jean")
    expect(parsed!.promoInput).toBe("WELCOME10")
    expect(parsed!.savedAt).toBe(1_000)
  })
})

describe("parseDraft — sécurité / robustesse", () => {
  it("rejette un JSON invalide", () => {
    expect(parseDraft("{pas du json")).toBeNull()
  })
  it("rejette null/undefined", () => {
    expect(parseDraft(null)).toBeNull()
    expect(parseDraft(undefined)).toBeNull()
  })
  it("rejette une version incompatible (ancien format jamais restauré de force)", () => {
    const raw = JSON.stringify({ ...baseState(), v: BOOKING_FORM_VERSION + 1, savedAt: Date.now() })
    expect(parseDraft(raw)).toBeNull()
  })
  it("rejette une forme inattendue (vehicles manquant)", () => {
    const raw = JSON.stringify({ v: BOOKING_FORM_VERSION, savedAt: Date.now(), contact: emptyContact })
    expect(parseDraft(raw)).toBeNull()
  })
})

describe("parseDraft — TTL 24 h (mémorisation appareil)", () => {
  it("accepte un brouillon récent", () => {
    const raw = serializeDraft(baseState(), 10_000)
    const parsed = parseDraft(raw, { maxAgeMs: DRAFT_MAX_AGE_MS, now: 10_000 + DRAFT_MAX_AGE_MS - 1 })
    expect(parsed).not.toBeNull()
  })
  it("rejette un brouillon expiré (> 24 h)", () => {
    const raw = serializeDraft(baseState(), 10_000)
    const parsed = parseDraft(raw, { maxAgeMs: DRAFT_MAX_AGE_MS, now: 10_000 + DRAFT_MAX_AGE_MS + 1 })
    expect(parsed).toBeNull()
  })
  it("sans maxAgeMs (session), l'âge n'a aucune importance", () => {
    const raw = serializeDraft(baseState(), 0)
    expect(parseDraft(raw, { now: 10 * DRAFT_MAX_AGE_MS })).not.toBeNull()
  })
})

describe("isDraftMeaningful — ne propose la reprise que si utile", () => {
  it("faux pour un tunnel vierge", () => {
    const parsed = parseDraft(serializeDraft(baseState()))
    expect(isDraftMeaningful(parsed)).toBe(false)
  })
  it("vrai dès qu'un contact est saisi", () => {
    const parsed = parseDraft(serializeDraft(baseState({ contact: { ...emptyContact, name: "Jean" } })))
    expect(isDraftMeaningful(parsed)).toBe(true)
  })
  it("vrai dès qu'un véhicule est composé", () => {
    const parsed = parseDraft(serializeDraft(baseState({ vehicles: [vehicle({ brand: "Peugeot" })] })))
    expect(isDraftMeaningful(parsed)).toBe(true)
  })
  it("vrai dès qu'un créneau est choisi", () => {
    const parsed = parseDraft(serializeDraft(baseState({ date: "2026-09-01" })))
    expect(isDraftMeaningful(parsed)).toBe(true)
  })
  it("faux pour null", () => {
    expect(isDraftMeaningful(null)).toBe(false)
  })
})

describe("promo — jamais la remise, seulement le texte saisi", () => {
  it("ne persiste pas de montant de remise", () => {
    const raw = serializeDraft(baseState({ promoInput: "WELCOME10" }))
    expect(raw).not.toContain("discountCents")
    expect(raw).not.toContain("discountValue")
  })
})
