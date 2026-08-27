import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Lot 1 — Action super-admin `setCustomSiteKeyAction`.
 *
 * Vérifie la SÉCURITÉ côté serveur :
 *   - protégée par requireSuperAdmin (si elle lève, aucune écriture)
 *   - clé inconnue REFUSÉE (aucun UPDATE)
 *   - clé enregistrée acceptée (UPDATE scoping companyId)
 *   - null/vide => rétablit le site standard (customSiteKey = null)
 *   - companyId invalide refusé
 *
 * Toutes les dépendances (DB, licences, provisioning…) sont mockées.
 */

const requireSuperAdmin = vi.fn(async () => {})
const isRegisteredCustomSiteKey = vi.fn()
const customSiteLabel = vi.fn(() => "Spirit ACS")

const whereSpy = vi.fn(async () => {})
const setSpy = vi.fn(() => ({ where: whereSpy }))
const updateSpy = vi.fn(() => ({ set: setSpy }))

vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/db", () => ({ db: { update: (...a: unknown[]) => updateSpy(...a) } }))
vi.mock("@/lib/admin", () => ({ requireSuperAdmin: () => requireSuperAdmin() }))
vi.mock("@/lib/custom-sites/registry", () => ({
  isRegisteredCustomSiteKey: (k: string | null | undefined) => isRegisteredCustomSiteKey(k),
  customSiteLabel: (k: string | null | undefined) => customSiteLabel(k),
}))

// Dépendances non concernées par cette action, mockées pour éviter tout accès réel.
vi.mock("@/lib/company/provision", () => ({
  provisionCompany: vi.fn(),
  removeDemoData: vi.fn(),
  resetOwnerPassword: vi.fn(),
  deleteCompanyCompletely: vi.fn(),
}))
vi.mock("@/lib/sms/credits", () => ({ creditFromRecharge: vi.fn() }))
vi.mock("@/lib/sms/send", () => ({ allocateDeltaToTenant: vi.fn() }))
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn() }))
vi.mock("@/lib/email/templates", () => ({ smsCreditedEmail: vi.fn() }))
vi.mock("@/lib/tenant-shared", () => ({ tenantAdminUrl: vi.fn() }))
vi.mock("@/lib/payments/config", () => ({ setDefaultPlatformFeeBps: vi.fn() }))

import { setCustomSiteKeyAction } from "@/app/super-admin/actions"

beforeEach(() => {
  requireSuperAdmin.mockReset().mockResolvedValue(undefined)
  isRegisteredCustomSiteKey.mockReset()
  updateSpy.mockClear()
  setSpy.mockClear()
  whereSpy.mockClear()
})

describe("setCustomSiteKeyAction — sécurité serveur", () => {
  it("refuse une clé inconnue sans écrire en base", async () => {
    isRegisteredCustomSiteKey.mockReturnValue(false)
    const res = await setCustomSiteKeyAction(10, "clé-bidon")
    expect(res.ok).toBe(false)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("accepte une clé enregistrée et écrit la valeur (scoping companyId)", async () => {
    isRegisteredCustomSiteKey.mockReturnValue(true)
    const res = await setCustomSiteKeyAction(10, "spirit-acs")
    expect(res.ok).toBe(true)
    expect(updateSpy).toHaveBeenCalledTimes(1)
    expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({ customSiteKey: "spirit-acs" }))
    expect(whereSpy).toHaveBeenCalledTimes(1)
  })

  it("null/vide rétablit le site standard (customSiteKey = null) sans valider de clé", async () => {
    const res = await setCustomSiteKeyAction(10, null)
    expect(res.ok).toBe(true)
    expect(isRegisteredCustomSiteKey).not.toHaveBeenCalled()
    expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({ customSiteKey: null }))
  })

  it("refuse un companyId invalide sans écrire", async () => {
    const res = await setCustomSiteKeyAction(0, "spirit-acs")
    expect(res.ok).toBe(false)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("protégée par requireSuperAdmin : si elle lève, aucune écriture", async () => {
    requireSuperAdmin.mockRejectedValue(new Error("FORBIDDEN"))
    await expect(setCustomSiteKeyAction(10, "spirit-acs")).rejects.toThrow("FORBIDDEN")
    expect(updateSpy).not.toHaveBeenCalled()
  })
})
