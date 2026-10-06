import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import {
  BUILTIN_TYPES,
  RETIRED_TYPE_KEYS,
  activeTypes,
  findRequestType,
  resolveCustomRequestsConfig,
  resolveCustomRequestTexts,
} from "@/lib/custom-requests"

const ROOT = join(__dirname, "..")
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")

const LEGACY_CONFIG = {
  enabled: true,
  types: [
    { key: "sur-mesure", label: "Prestation sur mesure", enabled: true, builtin: true },
    { key: "abonnement", label: "Abonnement / entretien régulier", enabled: true, builtin: true },
    { key: "abonnement", label: "Mon abonnement perso", enabled: true, builtin: false },
    { key: "jantes", label: "Rénovation jantes", enabled: true, builtin: false },
  ],
}

describe("Type de demande historique « abonnement » désactivé", () => {
  it("n'est plus un type intégré et est marqué comme clé historique", () => {
    expect(BUILTIN_TYPES.map((t) => t.key)).not.toContain("abonnement")
    expect(RETIRED_TYPE_KEYS.has("abonnement")).toBe(true)
  })

  it("resolveCustomRequestsConfig() ne retourne plus « abonnement » (config par défaut)", () => {
    expect(resolveCustomRequestsConfig(null).types.map((t) => t.key)).not.toContain("abonnement")
    expect(resolveCustomRequestsConfig({ enabled: true }).types.map((t) => t.key)).not.toContain("abonnement")
  })

  it("une ancienne config avec key=abonnement ne le réinjecte pas (ni comme type personnalisé)", () => {
    const cfg = resolveCustomRequestsConfig(LEGACY_CONFIG)
    expect(cfg.types.map((t) => t.key)).not.toContain("abonnement")
    expect(cfg.types.some((t) => /abonnement/i.test(t.label))).toBe(false)
    // Les autres types (intégrés + personnalisés) sont conservés.
    expect(cfg.types.map((t) => t.key)).toEqual(expect.arrayContaining(["sur-mesure", "flotte", "autre", "jantes"]))
  })

  it("activeTypes() ne retourne jamais « abonnement »", () => {
    const forged = { ...resolveCustomRequestsConfig(LEGACY_CONFIG) }
    forged.types = [...forged.types, { key: "abonnement", label: "x", enabled: true, builtin: true }]
    expect(activeTypes(forged).map((t) => t.key)).not.toContain("abonnement")
  })

  it("findRequestType(..., « abonnement ») retourne null (nouvelle soumission refusée)", () => {
    expect(findRequestType(resolveCustomRequestsConfig(LEGACY_CONFIG), "abonnement")).toBeNull()
    expect(findRequestType(resolveCustomRequestsConfig(null), "abonnement")).toBeNull()
    expect(findRequestType(resolveCustomRequestsConfig(null), "sur-mesure")?.key).toBe("sur-mesure")
  })

  it("la description par défaut ne parle plus d'abonnement / entretien régulier", () => {
    const { description } = resolveCustomRequestTexts(resolveCustomRequestsConfig(null))
    expect(description).not.toMatch(/abonnement|entretien régulier/i)
    expect(description).toMatch(/flotte professionnelle/)
  })

  it("l'enregistrement des réglages bloque la clé historique", () => {
    const src = read("app/admin/(dashboard)/parametres/custom-requests-actions.ts")
    expect(src).toMatch(/RETIRED_TYPE_KEYS\.has\(t\.key\)/)
  })
})

describe("Demandes historiques préservées", () => {
  it("aucune suppression / mise à jour en masse ni migration ciblant « abonnement »", () => {
    const files = [
      "lib/custom-requests.ts",
      "app/admin/(dashboard)/parametres/custom-requests-actions.ts",
      "app/admin/(dashboard)/demandes/page.tsx",
    ]
    for (const f of files) {
      const src = read(f)
      expect(src).not.toMatch(/\.delete\(/)
      expect(src).not.toMatch(/DELETE FROM|UPDATE custom_requests/i)
    }
  })
})

describe("/prestations affiche les vraies formules", () => {
  const src = read("app/(site)/prestations/page.tsx")

  it("utilise loadPublicOffer(db, tenant?.id) et <PublicPlans>", () => {
    expect(src).toMatch(/loadPublicOffer\(db, tenant\?\.id\)/)
    expect(src).toMatch(/<PublicPlans offer=\{offer\}/)
  })

  it("place PublicPlans avant la carte Demande personnalisée", () => {
    expect(src.indexOf("<PublicPlans")).toBeGreaterThan(-1)
    expect(src.indexOf("<PublicPlans")).toBeLessThan(src.indexOf("<CustomRequestCard"))
  })

  it("aucun prix ni formule statique dupliqués", () => {
    expect(src).not.toMatch(/maintenance_plans|maintenancePlans/)
    expect(src).not.toMatch(/\d+\s?€\s?\/\s?mois/)
  })
})

describe("Libellés admin « Demandes spéciales »", () => {
  it("page /admin/demandes renommée", () => {
    const src = read("app/admin/(dashboard)/demandes/page.tsx")
    expect(src).toMatch(/title: "Demandes spéciales"/)
    expect(src).toMatch(/>Demandes spéciales</)
  })

  it("onglet Paramètres renommé", () => {
    expect(read("lib/admin/settings-nav.ts")).toMatch(/label: "Demandes spéciales"/)
  })
})

describe("Spirit ACS", () => {
  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
      const p = join(dir, n)
      return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|ts)$/.test(n) ? [p] : []
    })
  }

  it("n'affiche plus « flotte, abonnement, besoin spécifique »", () => {
    for (const f of walk(join(ROOT, "components/custom-sites/spirit-acs"))) {
      expect(readFileSync(f, "utf8")).not.toContain("flotte, abonnement, besoin spécifique")
    }
    expect(read("components/custom-sites/spirit-acs/configurator/spirit-configurator.tsx")).toContain(
      "Autre demande (flotte, besoin spécifique)",
    )
  })
})
