import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Hardening Lot 2 SMS — défense en profondeur sur les chemins d'allocation /
 * recharge / provisioning.
 *
 * Ces tests mockent le moteur central (`canUseFeature`) et l'accès réseau
 * (`fetch`) : ils vérifient que, licence sans `sms`, AUCUN transfert AllMySMS et
 * AUCUNE écriture n'ont lieu — SANS toucher la base de production.
 */

// --- Mock du moteur de licence ------------------------------------------------
const canUseFeatureMock = vi.fn<(companyId: number, key: string) => Promise<boolean>>()
vi.mock("@/lib/licensing/enforce", () => ({
  canUseFeature: (companyId: number, key: string) => canUseFeatureMock(companyId, key),
  FEATURE_LOCKED_MESSAGE: "Cette fonctionnalité n'est pas incluse dans votre licence.",
}))

// --- Mock de la couche DB (jamais de vraie requête) ---------------------------
// Toute fonction de sélection renvoie une ligne "sous-compte existant" afin que
// SEULE la garde de licence puisse expliquer un refus (et pas l'absence de data).
vi.mock("@/lib/db", () => {
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.from = () => chain
  chain.where = () => chain
  chain.limit = async () => [{ subLogin: "sub", subApiKey: "key", granted: 100, purchased: 0, allocated: 0 }]
  chain.update = () => chain
  chain.set = () => chain
  chain.insert = () => chain
  chain.values = () => chain
  chain.onConflictDoNothing = () => chain
  chain.returning = async () => [{ balance: 0 }]
  return { db: chain }
})

import { allocateCreditsToTenant, allocateDeltaToTenant, ensureTenantSubAccount } from "@/lib/sms/send"

const PRO = 1
beforeEach(() => {
  canUseFeatureMock.mockReset()
  // Espionne fetch pour prouver l'absence d'appel réseau AllMySMS en cas de refus.
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })))
})

describe("hardening SMS — refus quand la licence n'inclut pas sms", () => {
  it("allocateCreditsToTenant refuse et n'appelle jamais AllMySMS", async () => {
    canUseFeatureMock.mockResolvedValue(false)
    const res = await allocateCreditsToTenant(PRO, 50)
    expect(res.ok).toBe(false)
    expect(res.allocated).toBe(0)
    expect(fetch).not.toHaveBeenCalled()
  })

  it("allocateDeltaToTenant refuse (court-circuit) sans appel réseau", async () => {
    canUseFeatureMock.mockResolvedValue(false)
    const res = await allocateDeltaToTenant(PRO)
    expect(res.ok).toBe(false)
    expect(res.allocated).toBe(0)
    expect(fetch).not.toHaveBeenCalled()
  })

  it("ensureTenantSubAccount ne provisionne pas un NOUVEAU sous-compte", async () => {
    // Sous-compte inexistant => on passerait au provisioning si la licence l'autorisait.
    canUseFeatureMock.mockResolvedValue(false)
    const res = await ensureTenantSubAccount({
      companyId: PRO,
      companyName: "ABC",
      firstName: "Jean",
      lastName: "Dupont",
      mobile: "+33600000000",
    })
    expect(res.ok).toBe(false)
    expect(res.created).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe("hardening SMS — autorisé quand sms inclus (BUSINESS/FOUNDER/LEGACY/override ENABLED)", () => {
  it("allocateDeltaToTenant tente l'allocation quand sms autorisé", async () => {
    canUseFeatureMock.mockResolvedValue(true)
    const res = await allocateDeltaToTenant(PRO)
    // La garde de licence est franchie : la fonction poursuit son traitement.
    // (Le résultat exact dépend d'AllMySMS mocké ; on vérifie qu'on n'a PAS le
    //  refus de licence.)
    expect(res.error).not.toBe("SMS non inclus dans la licence.")
  })
})
