import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

/* -------------------------------------------------------------------------- */
/*  Régression : le menu « trois points » du super-admin plantait (page noire  */
/*  « This page couldn't load ») à l'ouverture, car <DropdownMenuLabel>        */
/*  (base-ui Menu.GroupLabel) était rendu HORS d'un <DropdownMenuGroup>.       */
/*  base-ui lève alors « MenuGroupContext is missing » au montage du menu.     */
/*                                                                             */
/*  Ces tests n'exécutent AUCUNE suppression réelle : toutes les dépendances   */
/*  serveur (DB, provision, auth) sont mockées.                                */
/* -------------------------------------------------------------------------- */

/* ----------------------- Garde structurelle (source) ---------------------- */

describe("CompanyRowActions — structure du menu (anti-crash base-ui)", () => {
  const src = readFileSync(
    path.join(process.cwd(), "components/super-admin/company-row-actions.tsx"),
    "utf8",
  )

  it("rend chaque DropdownMenuLabel à l'intérieur d'un DropdownMenuGroup", () => {
    // Le label DOIT apparaître entre l'ouverture et la fermeture d'un groupe.
    expect(src).toMatch(/<DropdownMenuGroup>[\s\S]*<DropdownMenuLabel[\s\S]*<\/DropdownMenuGroup>/)
    // Import du composant Group présent.
    expect(src).toMatch(/DropdownMenuGroup/)
  })
})

/* --------------------- Mocks des dépendances serveur ---------------------- */

const requireSuperAdmin = vi.fn()
vi.mock("@/lib/admin", () => ({
  requireSuperAdmin: (...a: unknown[]) => requireSuperAdmin(...a),
}))

const deleteCompanyCompletely = vi.fn()
vi.mock("@/lib/company/provision", () => ({
  provisionCompany: vi.fn(),
  removeDemoData: vi.fn(),
  resetOwnerPassword: vi.fn(),
  deleteCompanyCompletely: (...a: unknown[]) => deleteCompanyCompletely(...a),
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

// Faux client Drizzle chaînable : db.select().from().where().limit() -> Promise.
let companyRow: { id: number; name: string } | undefined
vi.mock("@/lib/db", () => {
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.from = () => chain
  chain.where = () => chain
  chain.limit = async () => (companyRow ? [companyRow] : [])
  return { db: chain }
})

// Empêche de tirer le graphe des composants de sites personnalisés (next/font…)
// via registry.ts lors de l'import de actions.ts.
vi.mock("@/lib/custom-sites/registry", () => ({
  isRegisteredCustomSiteKey: () => false,
  customSiteLabel: () => null,
}))
vi.mock("@/lib/sms/credits", () => ({ creditFromRecharge: vi.fn() }))
vi.mock("@/lib/sms/send", () => ({ allocateDeltaToTenant: vi.fn() }))
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn() }))
vi.mock("@/lib/email/templates", () => ({ smsCreditedEmail: vi.fn() }))
vi.mock("@/lib/payments/config", () => ({
  setDefaultPlatformFeeBps: vi.fn(),
  getPlatformPaymentsOverview: vi.fn(),
}))

describe("deleteCompanyAction — sécurité de la suppression (aucune suppression réelle)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    companyRow = { id: 42, name: "Detailing Pro" }
    requireSuperAdmin.mockResolvedValue({ id: "u1", email: "admin@detailflow.app" })
    deleteCompanyCompletely.mockResolvedValue({ name: "Detailing Pro", deletedUsers: 1, deletedBlobs: 3 })
  })

  it("refuse un utilisateur non super-admin côté serveur (aucune suppression)", async () => {
    const { deleteCompanyAction } = await import("@/app/super-admin/actions")
    requireSuperAdmin.mockRejectedValueOnce(new Error("NEXT_HTTP_ERROR_FALLBACK;404"))
    await expect(deleteCompanyAction(42, "Detailing Pro")).rejects.toThrow()
    expect(deleteCompanyCompletely).not.toHaveBeenCalled()
  })

  it("refuse si le nom de confirmation ne correspond pas exactement", async () => {
    const { deleteCompanyAction } = await import("@/app/super-admin/actions")
    const res = await deleteCompanyAction(42, "Mauvais Nom")
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/ne correspond pas/i)
    expect(deleteCompanyCompletely).not.toHaveBeenCalled()
  })

  it("affiche une erreur propre si l'entreprise est introuvable (donnée manquante)", async () => {
    const { deleteCompanyAction } = await import("@/app/super-admin/actions")
    companyRow = undefined
    const res = await deleteCompanyAction(42, "Detailing Pro")
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/introuvable/i)
    expect(deleteCompanyCompletely).not.toHaveBeenCalled()
  })

  it("supprime UNIQUEMENT le compte ciblé lorsque le nom correspond exactement", async () => {
    const { deleteCompanyAction } = await import("@/app/super-admin/actions")
    const res = await deleteCompanyAction(42, "Detailing Pro")
    expect(res.ok).toBe(true)
    // L'identifiant transmis correspond exactement au compte sélectionné.
    expect(deleteCompanyCompletely).toHaveBeenCalledTimes(1)
    expect(deleteCompanyCompletely).toHaveBeenCalledWith(42)
  })
})
