import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

/**
 * Non-régression : le code admin ne doit JAMAIS se contenter de
 * requireCompanyId() (simple résolution du tenant demandé, sans preuve
 * d'appartenance). Les server actions admin doivent vérifier la membership.
 */

const ROOT = process.cwd()

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

const rel = (f: string) => path.relative(ROOT, f)
const MEMBERSHIP_GUARD = /\b(requireCompanyMember|getCompanyMemberContext|requireCompanyRole|requireAdmin|requireAdminCompanyId|requireSuperAdmin)\b/
const TENANT_ONLY = /\b(requireCompanyId|getCompanyIdOrNull|resolveRequestTenant)\s*\(/

// Actions sans tenant existant (création du premier espace) : session seule, par conception.
const NO_TENANT_YET = new Set(["app/admin/creer-mon-espace/actions.ts"])

const adminFiles = [...walk(path.join(ROOT, "app/admin")), ...walk(path.join(ROOT, "lib/admin"))]
const serverActionFiles = walk(path.join(ROOT, "app/admin")).filter((f) =>
  /^\s*["']use server["']/.test(readFileSync(f, "utf8")),
)

describe("garde membership du code admin", () => {
  it("aucun fichier admin n'appelle requireCompanyId / getCompanyIdOrNull / resolveRequestTenant", () => {
    const offenders = adminFiles.filter((f) => TENANT_ONLY.test(readFileSync(f, "utf8"))).map(rel)
    expect(offenders).toEqual([])
  })

  it("chaque fichier de server actions admin vérifie la membership (directement ou via un service garde)", () => {
    expect(serverActionFiles.length).toBeGreaterThan(10)
    const offenders = serverActionFiles
      .filter((f) => !NO_TENANT_YET.has(rel(f)))
      .filter((f) => {
        const src = readFileSync(f, "utf8")
        if (MEMBERSHIP_GUARD.test(src)) return false
        // Délégation à un service *ForCurrentTenant gardé par requireCompanyMember.
        const delegates = /ForCurrentTenant\b/.test(src)
        if (!delegates) return true
        const service = readFileSync(path.join(ROOT, "lib/customer-subscriptions/service.ts"), "utf8")
        return !/requireCompanyMember\(/.test(service)
      })
      .map(rel)
    expect(offenders).toEqual([])
  })

  it("les actions clients utilisent requireCompanyMember", () => {
    const src = readFileSync(path.join(ROOT, "app/admin/(dashboard)/clients/actions.ts"), "utf8")
    expect(src).toMatch(/await requireCompanyMember\(\)/)
    expect(src).not.toMatch(/requireCompanyId/)
  })

  it("/api/admin/logo vérifie la membership et l'appartenance du pathname avant get()", () => {
    const src = readFileSync(path.join(ROOT, "app/api/admin/logo/route.ts"), "utf8")
    expect(src).toMatch(/getCompanyMemberContext\(\)/)
    expect(src).not.toMatch(/getSession\(/)
    const guardIdx = src.indexOf("isAllowedTenantLogoPathname(")
    const getIdx = src.indexOf("await get(")
    expect(guardIdx).toBeGreaterThan(0)
    expect(guardIdx).toBeLessThan(getIdx)
  })
})
