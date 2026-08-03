import { describe, it, expect } from "vitest"
import {
  resolveHost,
  normalizeSlug,
  isValidSlug,
  isReservedSlug,
  tenantPublicUrl,
} from "@/lib/tenant-shared"

const ROOT = "detailflow.fr"

describe("resolveHost — isolation par hostname", () => {
  it("traite le domaine racine et le www comme la vitrine", () => {
    expect(resolveHost("detailflow.fr", ROOT)).toEqual({ kind: "root" })
    expect(resolveHost("www.detailflow.fr", ROOT)).toEqual({ kind: "root" })
  })

  it("extrait le slug d'un sous-domaine d'entreprise", () => {
    expect(resolveHost("elite.detailflow.fr", ROOT)).toEqual({ kind: "tenant", slug: "elite" })
    expect(resolveHost("autoshine.detailflow.fr:443", ROOT)).toEqual({ kind: "tenant", slug: "autoshine" })
  })

  it("ne confond jamais deux entreprises différentes", () => {
    const a = resolveHost("alpha.detailflow.fr", ROOT)
    const b = resolveHost("beta.detailflow.fr", ROOT)
    expect(a).toEqual({ kind: "tenant", slug: "alpha" })
    expect(b).toEqual({ kind: "tenant", slug: "beta" })
    expect(a).not.toEqual(b)
  })

  it("prend le premier label pour un sous-domaine multi-niveaux", () => {
    expect(resolveHost("a.b.detailflow.fr", ROOT)).toEqual({ kind: "tenant", slug: "a" })
  })

  it("gère les hôtes d'aperçu via ?tenant=", () => {
    expect(resolveHost("localhost:3000", ROOT, "elite")).toEqual({ kind: "preview", slug: "elite" })
    expect(resolveHost("localhost:3000", ROOT, null)).toEqual({ kind: "preview", slug: null })
    expect(resolveHost("project.vusercontent.net", ROOT, "beta")).toEqual({ kind: "preview", slug: "beta" })
  })

  it("supporte {slug}.localhost en développement", () => {
    expect(resolveHost("elite.localhost:3000", ROOT)).toEqual({ kind: "tenant", slug: "elite" })
  })

  it("traite un domaine inconnu comme racine (la DB renverra 404 au besoin)", () => {
    expect(resolveHost("exemple-inconnu.com", ROOT)).toEqual({ kind: "root" })
  })
})

describe("normalizeSlug", () => {
  it("retire accents, espaces et caractères spéciaux", () => {
    expect(normalizeSlug("Éléphant Bleu Détailing")).toBe("elephant-bleu-detailing")
    expect(normalizeSlug("  Auto  Shine!! ")).toBe("auto-shine")
    expect(normalizeSlug("A---B__C")).toBe("a-b-c")
  })
})

describe("isValidSlug / isReservedSlug", () => {
  it("accepte les slugs valides", () => {
    expect(isValidSlug("elite-detailing")).toBe(true)
    expect(isValidSlug("auto123")).toBe(true)
  })

  it("rejette les slugs trop courts, mal formés ou réservés", () => {
    expect(isValidSlug("ab")).toBe(false)
    expect(isValidSlug("-abc")).toBe(false)
    expect(isValidSlug("abc-")).toBe(false)
    expect(isValidSlug("ABC")).toBe(false)
    expect(isValidSlug("admin")).toBe(false)
    expect(isValidSlug("detailflow")).toBe(false)
    expect(isValidSlug("super-admin")).toBe(false)
  })

  it("marque les slugs système comme réservés", () => {
    expect(isReservedSlug("www")).toBe(true)
    expect(isReservedSlug("api")).toBe(true)
    expect(isReservedSlug("elite")).toBe(false)
  })
})

describe("tenantPublicUrl", () => {
  it("construit une URL ?tenant= sur le domaine racine", () => {
    expect(tenantPublicUrl("elite", ROOT)).toBe("https://detailflow.fr/?tenant=elite")
  })
  it("retombe sur ?tenant= sans domaine racine", () => {
    expect(tenantPublicUrl("elite")).toBe("/?tenant=elite")
    expect(tenantPublicUrl("elite", "")).toBe("/?tenant=elite")
  })
})
