import { describe, it, expect } from "vitest"
import {
  resolveHost,
  resolveCustomDomainSlug,
  tenantCanonicalHost,
  tenantCanonicalOrigin,
  tenantPublicPathUrl,
  normalizeSlug,
  isValidSlug,
  isReservedSlug,
  tenantPublicUrl,
  tenantPathUrl,
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

  it("mappe le domaine personnalisé Spirit ACS (apex + www) vers spirit-acs", () => {
    expect(resolveHost("spiritacs.com", ROOT)).toEqual({ kind: "tenant", slug: "spirit-acs" })
    expect(resolveHost("www.spiritacs.com", ROOT)).toEqual({ kind: "tenant", slug: "spirit-acs" })
    expect(resolveHost("SpiritACS.com", ROOT)).toEqual({ kind: "tenant", slug: "spirit-acs" })
    expect(resolveHost("spiritacs.com:443", ROOT)).toEqual({ kind: "tenant", slug: "spirit-acs" })
  })

  it("mappe le domaine personnalisé même sans domaine racine configuré", () => {
    expect(resolveHost("spiritacs.com", undefined)).toEqual({ kind: "tenant", slug: "spirit-acs" })
    expect(resolveHost("www.spiritacs.com", "")).toEqual({ kind: "tenant", slug: "spirit-acs" })
  })

  it("n'affiche JAMAIS la vitrine DetailFlow sur le domaine Spirit", () => {
    expect(resolveHost("spiritacs.com", ROOT)).not.toEqual({ kind: "root" })
    expect(resolveHost("www.spiritacs.com", ROOT)).not.toEqual({ kind: "root" })
  })

  it("ne détourne aucun autre domaine inconnu (mapping strictement additif)", () => {
    expect(resolveHost("spiritacs.fr", ROOT)).toEqual({ kind: "root" })
    expect(resolveHost("notspiritacs.com", ROOT)).toEqual({ kind: "root" })
    expect(resolveHost("spiritacs.com.evil.com", ROOT)).toEqual({ kind: "root" })
  })
})

describe("resolveCustomDomainSlug — table fermée", () => {
  it("reconnaît l'apex et le www d'un domaine personnalisé", () => {
    expect(resolveCustomDomainSlug("spiritacs.com")).toBe("spirit-acs")
    expect(resolveCustomDomainSlug("www.spiritacs.com")).toBe("spirit-acs")
  })

  it("renvoie null pour tout domaine hors table", () => {
    expect(resolveCustomDomainSlug("detailflow.fr")).toBeNull()
    expect(resolveCustomDomainSlug("elite.detailflow.fr")).toBeNull()
    expect(resolveCustomDomainSlug("spiritacs.fr")).toBeNull()
    expect(resolveCustomDomainSlug("www.spiritacs.com.evil.com")).toBeNull()
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
  it("construit une URL ?tenant= sur le domaine racine (www garanti)", () => {
    expect(tenantPublicUrl("elite", ROOT)).toBe("https://www.detailflow.fr/?tenant=elite")
    expect(tenantPublicUrl("elite", "www.detailflow.fr")).toBe("https://www.detailflow.fr/?tenant=elite")
  })
  it("retombe sur ?tenant= sans domaine racine", () => {
    expect(tenantPublicUrl("elite")).toBe("/?tenant=elite")
    expect(tenantPublicUrl("elite", "")).toBe("/?tenant=elite")
  })
})

/**
 * Régression BUG 2 : les liens accepter/refuser des emails DOIVENT utiliser le
 * routing `?tenant=` sur le domaine racine, JAMAIS un sous-domaine
 * `{slug}.detailflow.fr` (qui n'existe pas → NXDOMAIN). Le module email
 * (lib/email/custom-requests.ts) s'appuie désormais sur tenantPathUrl.
 */
describe("tenantPathUrl — liens transactionnels (emails)", () => {
  it("construit un lien de demande sur le domaine racine avec ?tenant=", () => {
    const url = tenantPathUrl("/demande/TOKEN123", "spirit-acs", ROOT)
    expect(url).toBe("https://www.detailflow.fr/demande/TOKEN123?tenant=spirit-acs")
  })

  it("n'utilise JAMAIS un sous-domaine {slug}.detailflow.fr", () => {
    const url = tenantPathUrl("/demande/TOKEN123", "spirit-acs", ROOT)
    expect(url).not.toContain("spirit-acs.detailflow.fr")
    expect(url.startsWith("https://www.detailflow.fr/")).toBe(true)
  })

  it("préserve un query existant (ajout via &) pour l'intent accepter/refuser", () => {
    const base = tenantPathUrl("/demande/TOKEN123", "spirit-acs", ROOT)
    const withIntent = `${base}${base.includes("?") ? "&" : "?"}intent=accept`
    expect(withIntent).toBe("https://www.detailflow.fr/demande/TOKEN123?tenant=spirit-acs&intent=accept")
  })

  it("retombe sur un chemin relatif sans domaine racine (aperçu / local)", () => {
    expect(tenantPathUrl("/demande/TOKEN123", "spirit-acs")).toBe("/demande/TOKEN123?tenant=spirit-acs")
  })
})

describe("tenantCanonicalHost / tenantCanonicalOrigin — domaine public par tenant", () => {
  it("Spirit ACS a pour hôte canonique www.spiritacs.com", () => {
    expect(tenantCanonicalHost("spirit-acs")).toBe("www.spiritacs.com")
    expect(tenantCanonicalOrigin("spirit-acs")).toBe("https://www.spiritacs.com")
  })

  it("les autres tenants n'ont aucun domaine personnalisé (null)", () => {
    expect(tenantCanonicalHost("elite")).toBeNull()
    expect(tenantCanonicalHost("rozancleaningservice")).toBeNull()
    expect(tenantCanonicalOrigin("detailflow")).toBeNull()
  })
})

describe("tenantPublicPathUrl — liens PUBLICS client (domaine personnalisé)", () => {
  it("Spirit : utilise www.spiritacs.com SANS ?tenant=", () => {
    expect(tenantPublicPathUrl("/demande/TOKEN123", "spirit-acs", ROOT)).toBe(
      "https://www.spiritacs.com/demande/TOKEN123",
    )
    expect(tenantPublicPathUrl("/reservation", "spirit-acs", ROOT)).toBe(
      "https://www.spiritacs.com/reservation",
    )
  })

  it("Spirit : le domaine personnalisé prime même sans domaine racine", () => {
    expect(tenantPublicPathUrl("/demande/TOKEN123", "spirit-acs")).toBe(
      "https://www.spiritacs.com/demande/TOKEN123",
    )
  })

  it("Spirit : ne contient jamais detailflow.fr ni ?tenant=", () => {
    const url = tenantPublicPathUrl("/demande/TOKEN123", "spirit-acs", ROOT)
    expect(url).not.toContain("detailflow.fr")
    expect(url).not.toMatch(/tenant=/)
    // Un intent accept/refuse s'ajoute proprement (base sans query → ?).
    const withIntent = `${url}${url.includes("?") ? "&" : "?"}intent=accept`
    expect(withIntent).toBe("https://www.spiritacs.com/demande/TOKEN123?intent=accept")
  })

  it("autre tenant : comportement historique inchangé (?tenant= sur la racine)", () => {
    expect(tenantPublicPathUrl("/demande/TOKEN123", "elite", ROOT)).toBe(
      "https://www.detailflow.fr/demande/TOKEN123?tenant=elite",
    )
    expect(tenantPublicPathUrl("/reservation", "elite")).toBe("/reservation?tenant=elite")
  })
})
