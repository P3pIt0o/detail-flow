import { describe, it, expect } from "vitest"
import { isReservedSlug, isValidSlug, normalizeSlug } from "@/lib/tenant-shared"

/**
 * Verrouille la logique PURE de slug utilisée par le parcours self-service
 * (« Créer mon espace ») : dérivation depuis le nom d'entreprise, rejet des
 * slugs réservés/invalides. Le provisioning DB (idempotence, transaction,
 * unicité) est validé séparément sur la branche Neon de développement.
 */
describe("self-service — dérivation et validation du slug", () => {
  it("dérive une adresse valide depuis un nom d'entreprise accentué", () => {
    const slug = normalizeSlug("Détailing Éclat Lyon")
    expect(slug).toBe("detailing-eclat-lyon")
    expect(isValidSlug(slug)).toBe(true)
  })

  it("compresse espaces et caractères spéciaux en tirets simples", () => {
    expect(normalizeSlug("  Wash   &  Go!!  ")).toBe("wash-go")
    expect(normalizeSlug("A---B")).toBe("a-b")
  })

  it("rejette les adresses trop courtes", () => {
    expect(isValidSlug(normalizeSlug("ab"))).toBe(false)
  })

  it("rejette les adresses réservées à la plateforme", () => {
    for (const reserved of ["admin", "www", "api", "detailflow", "super-admin"]) {
      expect(isReservedSlug(reserved)).toBe(true)
      expect(isValidSlug(reserved)).toBe(false)
    }
  })

  it("accepte une adresse personnalisée bien formée", () => {
    const slug = normalizeSlug("Detailing Lyon 69")
    expect(slug).toBe("detailing-lyon-69")
    expect(isReservedSlug(slug)).toBe(false)
    expect(isValidSlug(slug)).toBe(true)
  })
})
