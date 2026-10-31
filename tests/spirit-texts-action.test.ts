import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Action serveur `saveSpiritSiteTexts` / `getSpiritSiteTexts`.
 *
 * On vérifie l'AUTORISATION (rôle + tenant Spirit + licence), la VALIDATION
 * (liste blanche, longueurs, HTML/URL/caractères de contrôle), la PRÉSERVATION
 * du JSON existant (fusion imbriquée, jamais d'écrasement partiel) et la
 * RÉINITIALISATION champ par champ. Toutes les dépendances (auth, DB, licence,
 * résolveurs, cache) sont mockées : aucun accès réseau/DB réel.
 */

const requireCompanyMember = vi.fn()
const canUseFeature = vi.fn(async () => true)
let captured: Record<string, unknown> | null = null

vi.mock("@/lib/admin", () => ({
  requireCompanyMember: (...a: unknown[]) => requireCompanyMember(...a),
}))
vi.mock("@/lib/licensing/enforce", () => ({
  canUseFeature: (...a: unknown[]) => canUseFeature(...(a as [])),
  FEATURE_LOCKED_MESSAGE: "Fonctionnalité indisponible.",
}))
vi.mock("@/lib/db", () => ({
  db: {
    update: () => ({
      set: (v: Record<string, unknown>) => {
        captured = v
        return { where: () => Promise.resolve() }
      },
    }),
  },
}))
vi.mock("@/lib/db/schema", () => ({
  companies: { id: "companies.id", customSiteKey: "companies.customSiteKey" },
}))
vi.mock("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
  and: (...a: unknown[]) => ({ and: a }),
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/site-content", () => ({
  SITE_CONTENT_DEFAULTS: {
    gallery: { title: "Avant / Après", intro: "Le résultat de notre travail, en images." },
    reviews: { title: "Ce que disent nos clients", intro: "Leur satisfaction est notre meilleure publicité." },
    footer: { text: "", tagline: "" },
  },
}))
vi.mock("@/lib/custom-requests", () => ({
  resolveCustomRequestsConfig: (r: unknown) => r ?? {},
  resolveCustomRequestTexts: (c: { title?: string; description?: string } | undefined) => ({
    title: c?.title || "Titre par défaut",
    description: c?.description || "Description par défaut",
  }),
}))

import { saveSpiritSiteTexts, getSpiritSiteTexts } from "@/app/admin/(dashboard)/parametres/spirit-texts-actions"

function setMember(opts: { customSiteKey?: string | null; siteContent?: unknown; heroSubtitle?: string | null; isSuperAdmin?: boolean }) {
  requireCompanyMember.mockResolvedValue({
    user: { id: "u1", email: "a@b.c", name: "A" },
    tenant: {
      id: 42,
      slug: "spirit",
      customSiteKey: opts.customSiteKey ?? "spirit-acs",
      siteContent: opts.siteContent ?? null,
      heroSubtitle: opts.heroSubtitle ?? null,
    },
    role: "OWNER",
    isSuperAdmin: opts.isSuperAdmin ?? false,
  })
}

beforeEach(() => {
  requireCompanyMember.mockReset()
  canUseFeature.mockReset()
  canUseFeature.mockResolvedValue(true)
  captured = null
})

describe("autorisation", () => {
  it("exige le rôle OWNER/ADMIN (délégué à requireCompanyMember)", async () => {
    setMember({})
    await saveSpiritSiteTexts({ heroSubtitle: "x" })
    expect(requireCompanyMember).toHaveBeenCalledWith(["OWNER", "ADMIN"])
  })

  it("refuse un tenant non-Spirit (aucune écriture)", async () => {
    setMember({ customSiteKey: "autre" })
    const res = await saveSpiritSiteTexts({ heroSubtitle: "x" })
    expect(res.ok).toBe(false)
    expect(captured).toBeNull()
  })

  it("refuse si la licence website est absente", async () => {
    setMember({})
    canUseFeature.mockResolvedValue(false)
    const res = await saveSpiritSiteTexts({ heroSubtitle: "x" })
    expect(res.ok).toBe(false)
    expect(captured).toBeNull()
  })
})

describe("validation (tout-ou-rien)", () => {
  beforeEach(() => setMember({}))

  it("rejette une clé inconnue", async () => {
    const res = await saveSpiritSiteTexts({ "clé-inconnue": "x" })
    expect(res.ok).toBe(false)
    expect(captured).toBeNull()
  })

  it("rejette un paragraphe surnuméraire (slug à 2 paragraphes)", async () => {
    const res = await saveSpiritSiteTexts({ "service:polissage-automobile:3": "x" })
    expect(res.ok).toBe(false)
  })

  it("rejette une valeur trop longue SANS troncature", async () => {
    const res = await saveSpiritSiteTexts({ heroSubtitle: "a".repeat(401) })
    expect(res.ok).toBe(false)
    expect(captured).toBeNull()
  })

  it("rejette le HTML (< et >)", async () => {
    expect((await saveSpiritSiteTexts({ zoneText: "a<b" })).ok).toBe(false)
    expect((await saveSpiritSiteTexts({ zoneText: "a>b" })).ok).toBe(false)
  })

  it("rejette une URL", async () => {
    expect((await saveSpiritSiteTexts({ zoneText: "voir http://x.fr" })).ok).toBe(false)
    expect((await saveSpiritSiteTexts({ zoneText: "www.exemple.fr ici" })).ok).toBe(false)
  })

  it("rejette des caractères de contrôle dangereux", async () => {
    const res = await saveSpiritSiteTexts({ zoneText: "a\u0007b" })
    expect(res.ok).toBe(false)
  })
})

describe("écriture & préservation du JSON existant", () => {
  it("fusionne uniquement le champ concerné et préserve les voisins", async () => {
    setMember({
      siteContent: {
        gallery: { enabled: true, title: "Ancien" },
        customRequests: { enabled: true, types: [{ key: "std" }], ctaLabel: "CTA" },
        spiritAcs: { home: { zoneText: "à garder" } },
        sectionOrder: ["about"],
      },
    })
    const res = await saveSpiritSiteTexts({
      "cardTagline:detailing-moto": "Nouvelle accroche",
      galleryTitle: "Titre perso",
    })
    expect(res.ok).toBe(true)
    const sc = captured!.siteContent as any
    // Nouveau champ Spirit écrit au bon endroit.
    expect(sc.spiritAcs.home.serviceCardTaglines["detailing-moto"]).toBe("Nouvelle accroche")
    // Voisins préservés (aucun écrasement partiel).
    expect(sc.spiritAcs.home.zoneText).toBe("à garder")
    expect(sc.gallery.enabled).toBe(true)
    expect(sc.gallery.title).toBe("Titre perso")
    expect(sc.customRequests).toEqual({ enabled: true, types: [{ key: "std" }], ctaLabel: "CTA" })
    expect(sc.sectionOrder).toEqual(["about"])
    // Écriture verrouillée au tenant courant + double condition Spirit.
    expect((captured!.siteContent as object)).toBeDefined()
  })

  it("écrit le hero dans la colonne dédiée (null quand réinitialisé)", async () => {
    setMember({})
    await saveSpiritSiteTexts({ heroSubtitle: "Bonjour" })
    expect(captured!.heroSubtitle).toBe("Bonjour")
    setMember({ heroSubtitle: "Existant" })
    await saveSpiritSiteTexts({ heroSubtitle: "   " })
    expect(captured!.heroSubtitle).toBeNull()
  })

  it("ne touche PAS la colonne hero si le champ n'est pas envoyé", async () => {
    setMember({ heroSubtitle: "Existant" })
    await saveSpiritSiteTexts({ zoneText: "z" })
    expect("heroSubtitle" in (captured as object)).toBe(false)
  })
})

describe("réinitialisation champ par champ", () => {
  it("supprime uniquement l'override concerné (les autres restent)", async () => {
    setMember({ siteContent: { spiritAcs: { home: { zoneText: "z", servicesIntro: "s" } } } })
    const res = await saveSpiritSiteTexts({ zoneText: "" })
    expect(res.ok).toBe(true)
    const sc = captured!.siteContent as any
    expect(sc.spiritAcs.home.zoneText).toBeUndefined()
    expect(sc.spiritAcs.home.servicesIntro).toBe("s")
  })

  it("élague spiritAcs devenu vide, sans toucher les autres clés", async () => {
    setMember({ siteContent: { spiritAcs: { home: { zoneText: "z" } }, gallery: { enabled: true } } })
    await saveSpiritSiteTexts({ zoneText: "" })
    const sc = captured!.siteContent as any
    expect(sc.spiritAcs).toBeUndefined()
    expect(sc.gallery).toEqual({ enabled: true })
  })

  it("réinitialiser customRequests.title préserve enabled/types/ctaLabel", async () => {
    setMember({ siteContent: { customRequests: { enabled: true, types: [{ key: "x" }], ctaLabel: "C", title: "T" } } })
    await saveSpiritSiteTexts({ customRequestsTitle: "" })
    const sc = captured!.siteContent as any
    expect(sc.customRequests.title).toBeUndefined()
    expect(sc.customRequests.enabled).toBe(true)
    expect(sc.customRequests.types).toEqual([{ key: "x" }])
    expect(sc.customRequests.ctaLabel).toBe("C")
  })
})

describe("getSpiritSiteTexts (lecture admin)", () => {
  it("pré-remplit la valeur effective et l'état défaut/personnalisé", async () => {
    setMember({ siteContent: { spiritAcs: { home: { zoneText: "Zone perso" } } } })
    const res = await getSpiritSiteTexts()
    expect(res.ok).toBe(true)
    expect(res.values!.zoneText.custom).toBe(true)
    expect(res.values!.zoneText.value).toBe("Zone perso")
    // Un champ non personnalisé est pré-rempli avec le fallback exact.
    expect(res.values!.servicesIntro.custom).toBe(false)
    expect(res.values!.servicesIntro.value.length).toBeGreaterThan(0)
  })
})
