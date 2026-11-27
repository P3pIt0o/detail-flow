import { describe, it, expect, vi } from "vitest"
import { readFileSync, existsSync } from "node:fs"
import path from "node:path"

/**
 * SEO Spirit ACS — invariants vérifiables sans rendu DOM ni base de données.
 *
 * Deux niveaux :
 *  1. Tests UNITAIRES des helpers PURS (URL canoniques, données structurées) —
 *     cœur de la logique multi-tenant, sans dépendance serveur.
 *  2. Tests STRUCTURELS sur les sources (regex) pour vérifier le câblage des
 *     pages (métadonnées centralisées, CTA avis, unicité H1, pages prestations).
 */

import {
  tenantSeoIdentity,
  tenantCanonicalUrl,
  resolveTenantOrigin,
  normalizePath,
  SEO_BASE,
} from "@/lib/seo/tenant-url"
import {
  buildPostalAddress,
  buildOpeningHours,
  buildLocalBusinessJsonLd,
  buildBreadcrumbJsonLd,
  buildFaqJsonLd,
} from "@/lib/seo/structured-data"
import { withTenant } from "@/lib/tenant-link"
import { SPIRIT_SERVICES, SPIRIT_FAQ, getSpiritService } from "@/components/custom-sites/spirit-acs/seo-content"
import sitemap from "@/app/sitemap"

const hostRef = vi.hoisted(() => ({ host: "" }))
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: hostRef.host }) }))

// L85 — dépendances serveur simulées (aucune BDD) pour le JSON-LD tenant et les routes.
const l85 = vi.hoisted(() => ({
  tenant: null as Record<string, unknown> | null,
  siteKey: null as string | null,
}))
vi.mock("server-only", () => ({}))
vi.mock("next/font/google", () => {
  const font = () => ({ className: "", variable: "", style: {} })
  return { Oswald: font, Fraunces: font, Inter: font }
})
vi.mock("next/font/local", () => ({ default: () => ({ className: "", variable: "", style: {} }) }))
vi.mock("@/lib/tenant",() => ({ getCurrentTenant: async () => l85.tenant }))
vi.mock("@/lib/public-contact", () => ({ getPublicHours: async () => [] }))
vi.mock("@/lib/reviews/public", () => ({ getTenantGoogleRating: async () => null }))
vi.mock("@/lib/licensing/server", () => ({ hasFeature: async () => true }))
vi.mock("@/lib/public-page/config", () => ({ getEffectivePublicPageForCurrentTenant: async () => null }))
vi.mock("@/lib/licensing/website-guard", () => ({ requireWebsiteFeature: async () => undefined }))
vi.mock("@/lib/custom-sites/server", () => ({
  resolveCustomSite: async () => (l85.siteKey ? { key: l85.siteKey } : null),
  getCustomSitePublicData: async () => ({ tenant: { slug: String(l85.tenant?.slug ?? "") } }),
}))
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND")
  },
}))
async function sitemapUrls(...hosts: string[]) {
  const out: string[] = []
  for (const h of hosts) {
    hostRef.host = h
    out.push(...(await sitemap()).map((e) => e.url))
  }
  return out
}

const root = process.cwd()
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8")
const SPIRIT = "components/custom-sites/spirit-acs"
const SLUG = "spirit-acs"

// Identité d'un tenant SANS domaine personnalisé connecté : la fonction pure
// produit alors la forme historique `?tenant=<slug>` sur le domaine racine.
// (En production, Spirit ACS a désormais un domaine personnalisé — voir le bloc
// « bascule domaine personnalisé » ci-dessous ; ce `SLUG` sert ici uniquement à
// éprouver le CONTRAT DE REPLI, identique pour tout tenant sans domaine.)
const fallbackIdentity = tenantSeoIdentity({ slug: SLUG })

describe("SEO — URL canoniques : contrat de repli (tenant sans domaine personnalisé)", () => {
  it("accueil → https://www.detailflow.fr/?tenant=spirit-acs", () => {
    expect(tenantCanonicalUrl("/", fallbackIdentity)).toBe("https://www.detailflow.fr/?tenant=spirit-acs")
  })

  it("avis → https://www.detailflow.fr/avis?tenant=spirit-acs", () => {
    expect(tenantCanonicalUrl("/avis", fallbackIdentity)).toBe("https://www.detailflow.fr/avis?tenant=spirit-acs")
  })

  it("contact → https://www.detailflow.fr/contact?tenant=spirit-acs", () => {
    expect(tenantCanonicalUrl("/contact", fallbackIdentity)).toBe(
      "https://www.detailflow.fr/contact?tenant=spirit-acs",
    )
  })

  it("chaque page de prestation conserve tenant=spirit-acs", () => {
    for (const s of SPIRIT_SERVICES) {
      expect(tenantCanonicalUrl(`/prestations/${s.slug}`, fallbackIdentity)).toBe(
        `https://www.detailflow.fr/prestations/${s.slug}?tenant=spirit-acs`,
      )
    }
  })

  it("la base canonique est bien le domaine DetailFlow vérifié", () => {
    expect(SEO_BASE).toBe("https://www.detailflow.fr")
  })

  it("un query/hash passé dans le chemin est ignoré (forme canonique stricte)", () => {
    expect(tenantCanonicalUrl("/avis?foo=1#x", fallbackIdentity)).toBe(
      "https://www.detailflow.fr/avis?tenant=spirit-acs",
    )
  })
})

describe("SEO — bascule domaine personnalisé Spirit ACS (www.spiritacs.com)", () => {
  // Reproduit EXACTEMENT ce que `resolveTenantSeo` injecte en production pour
  // Spirit via `tenantCanonicalHost("spirit-acs")` = « www.spiritacs.com ».
  const spiritLive = tenantSeoIdentity({ slug: SLUG, publicDomain: "www.spiritacs.com" })

  it("accueil/avis/contact → https://www.spiritacs.com/... SANS ?tenant=", () => {
    expect(tenantCanonicalUrl("/", spiritLive)).toBe("https://www.spiritacs.com/")
    expect(tenantCanonicalUrl("/avis", spiritLive)).toBe("https://www.spiritacs.com/avis")
    expect(tenantCanonicalUrl("/contact", spiritLive)).toBe("https://www.spiritacs.com/contact")
  })

  it("chaque page de prestation est canonique sur www.spiritacs.com", () => {
    for (const s of SPIRIT_SERVICES) {
      const url = tenantCanonicalUrl(`/prestations/${s.slug}`, spiritLive)
      expect(url).toBe(`https://www.spiritacs.com/prestations/${s.slug}`)
      expect(url).not.toMatch(/tenant=/)
    }
  })

  it("ne référence jamais detailflow.fr comme origine SEO de Spirit", () => {
    expect(resolveTenantOrigin(spiritLive)).toBe("https://www.spiritacs.com")
    expect(tenantCanonicalUrl("/", spiritLive)).not.toContain("detailflow.fr")
  })
})

describe("SEO — bascule automatique vers le futur domaine personnalisé vérifié", () => {
  it("quand un domaine vérifié existe, l'URL l'utilise SANS ?tenant=", () => {
    const id = tenantSeoIdentity({ slug: SLUG, publicDomain: "spirit-acs.fr" })
    expect(resolveTenantOrigin(id)).toBe("https://spirit-acs.fr")
    expect(tenantCanonicalUrl("/", id)).toBe("https://spirit-acs.fr/")
    expect(tenantCanonicalUrl("/avis", id)).toBe("https://spirit-acs.fr/avis")
    expect(tenantCanonicalUrl("/contact", id)).not.toMatch(/tenant=/)
  })

  it("sans domaine vérifié, aucune origine tenant n'est inventée", () => {
    expect(resolveTenantOrigin(fallbackIdentity)).toBeNull()
  })

  it("normalizePath garantit un slash initial et retire les slashes finaux", () => {
    expect(normalizePath("")).toBe("/")
    expect(normalizePath("avis")).toBe("/avis")
    expect(normalizePath("/avis/")).toBe("/avis")
    expect(normalizePath("/")).toBe("/")
  })
})

describe("SEO — préservation du paramètre tenant dans les liens internes", () => {
  it("withTenant conserve tenant=spirit-acs sur un lien simple", () => {
    expect(withTenant("/prestations/nettoyage-automobile", SLUG)).toBe(
      "/prestations/nettoyage-automobile?tenant=spirit-acs",
    )
  })

  it("withTenant place tenant AVANT l'ancre (#demande-devis)", () => {
    expect(withTenant("/#demande-devis", SLUG)).toBe("/?tenant=spirit-acs#demande-devis")
  })

  it("les cartes de prestations et le CTA passent par serviceHref/withTenant", () => {
    const prest = read(`${SPIRIT}/spirit-prestations.tsx`)
    // La grille est désormais alimentée par le catalogue public (Phase 3) : les
    // cartes itèrent sur `services` mais restent routées via `serviceHref`.
    expect(prest).toMatch(/href=\{serviceHref\((?:card|page)\.slug\)\}/)
    const home = read(`${SPIRIT}/home-page.tsx`)
    expect(home).toMatch(/withTenant\(`\/prestations\/\$\{slug\}`, data\.tenant\.slug\)/)
  })
})

describe("SEO — données structurées LocalBusiness (données réelles uniquement)", () => {
  it("n'émet jamais une propriété vide (aucune donnée → objet minimal)", () => {
    const jsonLd = buildLocalBusinessJsonLd({ name: "Spirit ACS" })
    expect(jsonLd["@type"]).toBe("AutoWash")
    expect(jsonLd.name).toBe("Spirit ACS")
    expect(jsonLd).not.toHaveProperty("address")
    expect(jsonLd).not.toHaveProperty("telephone")
    expect(jsonLd).not.toHaveProperty("openingHoursSpecification")
    expect(jsonLd).not.toHaveProperty("sameAs")
  })

  it("construit un PostalAddress structuré quand rue + ville existent", () => {
    const addr = buildPostalAddress({
      streetAddress: "12 rue des Artisans",
      postalCode: "77400",
      addressLocality: "Lagny-sur-Marne",
      addressCountry: "FR",
    })
    expect(addr).toMatchObject({
      "@type": "PostalAddress",
      streetAddress: "12 rue des Artisans",
      postalCode: "77400",
      addressLocality: "Lagny-sur-Marne",
      addressCountry: "FR",
    })
  })

  it("renvoie null si aucune ville ni rue (info locale absente)", () => {
    expect(buildPostalAddress({ postalCode: "77400", addressCountry: "FR" })).toBeNull()
    expect(buildPostalAddress(null)).toBeNull()
    expect(buildPostalAddress({})).toBeNull()
  })

  it("regroupe les jours partageant les mêmes horaires et ignore les jours fermés", () => {
    const hours = buildOpeningHours([
      { day: 1, open: true, from: "09:00", to: "18:00" },
      { day: 2, open: true, from: "09:00", to: "18:00" },
      { day: 0, open: false, from: null, to: null },
      { day: 3, open: true, from: null, to: null },
    ])
    expect(hours).toHaveLength(1)
    expect(hours[0]).toMatchObject({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday"],
      opens: "09:00",
      closes: "18:00",
    })
    // Les clés techniques de fusion ne fuient jamais.
    expect(hours[0]).not.toHaveProperty("__from")
  })

  it("inclut adresse, horaires, areaServed, sameAs et hasMap quand fournis", () => {
    const jsonLd = buildLocalBusinessJsonLd({
      name: "Spirit ACS",
      url: "https://www.detailflow.fr/?tenant=spirit-acs",
      telephone: "+33612345678",
      email: "contact@example.fr",
      address: { streetAddress: "12 rue X", addressLocality: "Lagny-sur-Marne", addressCountry: "FR" },
      openingHours: [{ day: 1, open: true, from: "09:00", to: "18:00" }],
      areaServed: ["Lagny-sur-Marne", ""],
      sameAs: ["https://g.page/spirit"],
      hasMap: "https://maps.google.com/?q=spirit",
    })
    expect(jsonLd.address).toBeTruthy()
    expect(jsonLd.openingHoursSpecification).toBeTruthy()
    expect(jsonLd.areaServed).toEqual(["Lagny-sur-Marne"]) // valeur vide filtrée
    expect(jsonLd.sameAs).toEqual(["https://g.page/spirit"])
    expect(jsonLd.hasMap).toBe("https://maps.google.com/?q=spirit")
  })
})

describe("SEO — BreadcrumbList & FAQPage", () => {
  it("BreadcrumbList numérote correctement les positions", () => {
    const bc = buildBreadcrumbJsonLd([
      { name: "Accueil", url: "https://www.detailflow.fr/?tenant=spirit-acs" },
      { name: "Prestations", url: "https://www.detailflow.fr/?tenant=spirit-acs" },
      { name: "Nettoyage", url: "https://www.detailflow.fr/prestations/nettoyage-automobile?tenant=spirit-acs" },
    ])
    expect(bc["@type"]).toBe("BreadcrumbList")
    const items = bc.itemListElement as Array<Record<string, unknown>>
    expect(items).toHaveLength(3)
    expect(items[0]).toMatchObject({ position: 1, name: "Accueil" })
    expect(items[2]).toMatchObject({ position: 3, name: "Nettoyage" })
  })

  it("FAQPage reflète EXACTEMENT les Q/R fournies (aucune divergence)", () => {
    const faq = buildFaqJsonLd(SPIRIT_FAQ.map((e) => ({ question: e.question, answer: e.answer })))
    expect(faq["@type"]).toBe("FAQPage")
    const entities = faq.mainEntity as Array<Record<string, unknown>>
    expect(entities).toHaveLength(SPIRIT_FAQ.length)
    expect(entities[0]).toMatchObject({
      "@type": "Question",
      name: SPIRIT_FAQ[0].question,
      acceptedAnswer: { "@type": "Answer", text: SPIRIT_FAQ[0].answer },
    })
  })
})

describe("SEO — isolation multi-tenant (aucune fuite)", () => {
  it("la canonique n'utilise QUE le slug fourni", () => {
    const other = tenantSeoIdentity({ slug: "autre-garage" })
    const url = tenantCanonicalUrl("/avis", other)
    expect(url).toContain("tenant=autre-garage")
    expect(url).not.toContain("spirit-acs")
  })

  it("le contenu éditorial Spirit est strictement isolé dans son dossier", () => {
    // Le config éditorial ne vit QUE sous components/custom-sites/spirit-acs.
    expect(existsSync(path.join(root, SPIRIT, "seo-content.ts"))).toBe(true)
  })
})

describe("SEO — câblage des métadonnées par page (canonique corrigée)", () => {
  it("accueil (layout) : métadonnées centralisées, plus de canonique statique", () => {
    const src = read("app/(site)/layout.tsx")
    expect(src).toMatch(/buildTenantMetadata\(\{ path: "\/"/)
  })

  it("avis : buildTenantMetadata(path:/avis) et non plus canonical:/avis", () => {
    const src = read("app/(site)/avis/page.tsx")
    expect(src).toMatch(/buildTenantMetadata\(\{ path: "\/avis"/)
    expect(src).not.toMatch(/canonical:\s*["']\/avis["']/)
  })

  it("contact : buildTenantMetadata(path:/contact) et non plus canonical:/contact", () => {
    const src = read("app/(site)/contact/page.tsx")
    expect(src).toMatch(/buildTenantMetadata\(\{ path: "\/contact"/)
    expect(src).not.toMatch(/canonical:\s*["']\/contact["']/)
  })

  it("titres/descriptions Spirit conformes au cahier des charges", () => {
    const src = read(`${SPIRIT}/seo-content.ts`)
    expect(src).toMatch(/Detailing automobile à Lagny-sur-Marne \| Spirit ACS/)
    expect(src).toMatch(/Avis clients Spirit ACS \| Detailing à Lagny-sur-Marne/)
    expect(src).toMatch(/Contact et devis \| Spirit ACS Lagny-sur-Marne/)
  })
})

describe("SEO — CTA de la page Avis (vers le devis, jamais /reservation)", () => {
  it("Spirit : bouton vers /#demande-devis avec les textes imposés", () => {
    const src = read("app/(site)/avis/page.tsx")
    expect(src).toMatch(/ctaButtonHref = isSpirit \? "\/#demande-devis"/)
    expect(src).toMatch(/Vous souhaitez confier votre véhicule à Spirit ACS \?/)
    expect(src).toMatch(/Demander un devis/)
    // La destination /reservation ne doit JAMAIS être forcée pour Spirit.
    expect(src).not.toMatch(/isSpirit \? "\/reservation"/)
  })
})

describe("SEO — pages de prestations dédiées", () => {
  it("expose exactement les pages SEO canoniques (6 familles + céramique), sans les pages retirées", () => {
    const slugs = SPIRIT_SERVICES.map((s) => s.slug).sort()
    // Les 6 familles + la page SEO « protection céramique » conservée (elle
    // n'est pas une carte d'accueil autonome mais garde sa page/URL dédiée).
    expect(slugs).toEqual(
      [
        "nettoyage-automobile",
        "polissage-automobile",
        "protection-ceramique",
        "protection-ppf",
        "renovation-phares",
        "detailing-moto",
        "nettoyage-textile",
      ].sort(),
    )
    // Pages fusionnées dans « nettoyage-automobile » puis retirées (301) : elles
    // ne doivent plus exister comme entrées indexables autonomes.
    expect(slugs).not.toContain("entretien-regulier")
    expect(slugs).not.toContain("nettoyage-moteur")
  })

  it("chaque prestation a un title, une description et une FAQ non vides", () => {
    for (const s of SPIRIT_SERVICES) {
      expect(s.metaTitle.trim().length, `title vide: ${s.slug}`).toBeGreaterThan(0)
      expect(s.metaDescription.trim().length, `description vide: ${s.slug}`).toBeGreaterThan(0)
      expect(s.faq.length, `FAQ vide: ${s.slug}`).toBeGreaterThan(0)
    }
  })

  it("les titres et descriptions des prestations sont uniques (pas de duplication)", () => {
    const titles = SPIRIT_SERVICES.map((s) => s.metaTitle)
    const descs = SPIRIT_SERVICES.map((s) => s.metaDescription)
    expect(new Set(titles).size).toBe(titles.length)
    expect(new Set(descs).size).toBe(descs.length)
  })

  it("getSpiritService résout par slug et renvoie undefined pour un slug inconnu", () => {
    expect(getSpiritService("nettoyage-automobile")?.slug).toBe("nettoyage-automobile")
    expect(getSpiritService("slug-inexistant")).toBeUndefined()
  })

  it("la route dynamique existe et fait un notFound pour un slug inconnu", () => {
    expect(existsSync(path.join(root, "app/(site)/prestations/[service]/page.tsx"))).toBe(true)
    const src = read("app/(site)/prestations/[service]/page.tsx")
    expect(src).toMatch(/notFound\(\)/)
  })
})

describe("SEO — unicité du H1", () => {
  it("le template de page de prestation ne rend qu'un seul <h1>", () => {
    const src = read(`${SPIRIT}/service-page.tsx`)
    const count = (src.match(/<h1[\s>]/g) ?? []).length
    expect(count).toBe(1)
  })

  it("le hero (accueil) ne rend qu'un seul <h1>", () => {
    const src = read(`${SPIRIT}/spirit-hero.tsx`)
    const count = (src.match(/<h1[\s>]/g) ?? []).length
    expect(count).toBe(1)
  })

  it("le H1 SEO local de l'accueil est bien « Detailing automobile à Lagny-sur-Marne »", () => {
    const src = read(`${SPIRIT}/seo-content.ts`)
    expect(src).toMatch(/SPIRIT_HERO_H1\s*=\s*["']Detailing automobile à Lagny-sur-Marne["']/)
  })
})

describe("SEO — FAQ accueil visible == FAQPage (10 questions du cahier des charges)", () => {
  it("les 10 questions imposées sont présentes", () => {
    const qs = SPIRIT_FAQ.map((e) => e.question.toLowerCase())
    const expected = [
      "différence entre le detailing et un lavage",
      "combien de temps dure une prestation",
      "comment obtenir un devis",
      "retirer toutes les rayures",
      "protection céramique",
      "film ppf",
      "motos",
      "à domicile",
      "avant sa vente",
      "professionnels",
    ]
    for (const frag of expected) {
      expect(qs.some((q) => q.includes(frag)), `question manquante: ${frag}`).toBe(true)
    }
  })
})

describe("SEO — pages légales conservent noindex, follow", () => {
  for (const p of ["mentions-legales", "cgv", "confidentialite"]) {
    it(`${p} : robots index:false, follow:true`, () => {
      const src = read(`app/(site)/${p}/page.tsx`)
      expect(src).toMatch(/index:\s*false/)
      expect(src).toMatch(/follow:\s*true/)
    })
  }
})

describe("SEO — sitemap tenant-aware", async () => {
  const urls = await sitemapUrls("www.spiritacs.com", "www.cleanyzer.fr", "www.detailflow.fr")

  it("Spirit ACS (domaine personnalisé connecté) : URL sur www.spiritacs.com SANS ?tenant=", () => {
    // Accueil sans « / » final : c'est la forme de la canonique rendue par Next.
    expect(urls).toContain("https://www.spiritacs.com")
    expect(urls).not.toContain("https://www.spiritacs.com/")
    expect(urls).toContain("https://www.spiritacs.com/avis")
    expect(urls).toContain("https://www.spiritacs.com/contact")
  })

  it("aucune URL Spirit ne pointe plus vers detailflow.fr?tenant=spirit-acs", () => {
    for (const u of urls) {
      expect(u).not.toContain("tenant=spirit-acs")
    }
  })

  it("inclut les 6 pages de prestations Spirit sur www.spiritacs.com", () => {
    for (const s of SPIRIT_SERVICES) {
      expect(urls).toContain(`https://www.spiritacs.com/prestations/${s.slug}`)
    }
  })

  it("n'inclut aucune page admin, API, réservation, ni page légale noindex", () => {
    for (const u of urls) {
      expect(u).not.toMatch(/\/admin|\/super-admin|\/api\/|\/reservation|\/mentions-legales|\/cgv|\/confidentialite/)
    }
  })

  it("chaque URL de site tenant est soit sur son domaine personnalisé, soit taguée ?tenant=", () => {
    // Aucune URL de site tenant ne doit être ambiguë : soit elle vit sur un
    // domaine personnalisé connecté (Spirit → www.spiritacs.com), soit elle
    // porte son paramètre « ?tenant= » sur le domaine racine (Rozan) ; Cleanyzer
    // est sur www.cleanyzer.fr depuis L50.
    const nonRoot = urls.filter((u) => u !== "https://www.detailflow.fr")
    for (const u of nonRoot) {
      const ok =
        u.startsWith("https://www.spiritacs.com") ||
        /[?&]tenant=rozancleaningservice/.test(u) ||
        /^https:\/\/www\.cleanyzer\.fr\//.test(u)
      expect(ok, `URL tenant ambiguë: ${u}`).toBe(true)
    }
  })
})

/* -------------------------------------------------------------------------- */
/*  L85 — zone d'intervention, pages ville, prix « dès » dans le JSON-LD       */
/* -------------------------------------------------------------------------- */

const L85_CITIES = [
  "Lagny-sur-Marne",
  "Chelles",
  "Jossigny",
  "Serris",
  "Crécy-la-Chapelle",
  "Jablines",
  "Collégien",
  "Villevaudé",
  "Pomponne",
  "Saint-Thibault-des-Vignes",
  "Gouvernes",
  "Conches-sur-Gondoire",
  "Montévrain",
  "Bussy-Saint-Georges",
]
const L85_CITY_SLUGS = ["chelles", "bussy-saint-georges", "serris", "montevrain", "saint-thibault-des-vignes"]
const l85Tenant = (slug: string, customSiteKey: string | null) => ({
  id: `id-${slug}`,
  slug,
  name: slug === "spirit-acs" ? "Spirit ACS" : "Autre",
  customSiteKey,
  logoUrl: null,
  phone: null,
  email: null,
  socialLinks: null,
})
const notFoundOf = async (fn: () => Promise<unknown>) => {
  try {
    await fn()
    return false
  } catch (e) {
    return e instanceof Error && e.message === "NEXT_NOT_FOUND"
  }
}

describe("L85 — communes confirmées (source unique)", async () => {
  const content = await import("@/components/custom-sites/spirit-acs/seo-content")

  it("SPIRIT_CITIES = les 14 communes de la fiche, orthographe exacte, sans Marne-la-Vallée", () => {
    expect([...content.SPIRIT_CITIES]).toEqual(L85_CITIES)
    expect(content.SPIRIT_CITIES).not.toContain("Marne-la-Vallée" as never)
    expect("SPIRIT_ZONE_CITIES" in content).toBe(false)
  })

  it("le texte de zone par défaut cite le secteur de Marne-la-Vallée", () => {
    expect(content.SPIRIT_ZONE_TEXT).toMatch(/secteur de Marne-la-Vallée/)
  })

  it("la section zone et l'accueil utilisent SPIRIT_CITIES", () => {
    const home = read(`${SPIRIT}/home-page.tsx`)
    expect(home).toMatch(/cities=\{SPIRIT_CITIES\}/)
    expect(home).not.toMatch(/SPIRIT_ZONE_CITIES/)
  })
})

describe("L85 — JSON-LD AutoWash : areaServed en objets City", async () => {
  const { buildTenantLocalBusiness } = await import("@/lib/seo/tenant-seo.server")
  const { SPIRIT_LOCAL_BUSINESS_OPTIONS } = await import("@/components/custom-sites/spirit-acs/service-offers")
  const { CLZ_AREA_SERVED, CLZ_PRICE_RANGE } = await import("@/components/custom-sites/cleanyzer/seo-content")

  it("Spirit : 14 City exactes, @id stable, sans Marne-la-Vallée ni aggregateRating", async () => {
    l85.tenant = l85Tenant("spirit-acs", "spirit-acs")
    const ld = (await buildTenantLocalBusiness(SPIRIT_LOCAL_BUSINESS_OPTIONS))!
    expect(ld.areaServed).toEqual(L85_CITIES.map((name) => ({ "@type": "City", name })))
    expect(JSON.stringify(ld.areaServed)).not.toMatch(/Marne-la-Vallée/)
    expect(ld["@id"]).toBe("https://www.spiritacs.com/#business")
    expect("aggregateRating" in ld).toBe(false)
  })

  it("le layout passe ces options au seul tenant Spirit", () => {
    const src = read("app/(site)/layout.tsx")
    expect(src).toMatch(/isSpirit\s*\n?\s*\? SPIRIT_LOCAL_BUSINESS_OPTIONS/)
  })

  it("Cleanyzer inchangé (chaînes) ; tenant standard sans areaServed", async () => {
    l85.tenant = l85Tenant("cleanyzer", "cleanyzer")
    const clz = (await buildTenantLocalBusiness({
      areaServed: CLZ_AREA_SERVED,
      priceRange: CLZ_PRICE_RANGE,
      withStableId: true,
    }))!
    expect(clz.areaServed).toEqual(["Annecy"])
    l85.tenant = l85Tenant("autre-garage", null)
    const std = (await buildTenantLocalBusiness())!
    expect("areaServed" in std).toBe(false)
    expect("@id" in std).toBe(false)
  })
})

describe("L85 — pages zone et ville : textes", async () => {
  const c = await import("@/components/custom-sites/spirit-acs/seo-content")
  const pages = [c.SPIRIT_ZONE_PAGE, ...c.SPIRIT_CITY_PAGES]

  it("exactement les 5 communes prévues, pas de page Lagny", () => {
    expect(c.SPIRIT_CITY_PAGES.map((p) => p.slug)).toEqual(L85_CITY_SLUGS)
    expect(c.getSpiritCityPage("lagny-sur-marne")).toBeUndefined()
    expect(c.getSpiritCityPage("marne-la-vallee")).toBeUndefined()
  })

  it("titres ≤ 60, descriptions 140-160", () => {
    for (const p of pages) {
      expect(p.metaTitle.length, p.metaTitle).toBeLessThanOrEqual(60)
      expect(p.metaDescription.length, p.metaDescription).toBeGreaterThanOrEqual(140)
      expect(p.metaDescription.length, p.metaDescription).toBeLessThanOrEqual(160)
    }
  })

  it("titres, descriptions, H1 et intros différents deux à deux (et des autres pages Spirit)", () => {
    const others = [
      ...Object.values(c.SPIRIT_PAGE_META).map((m) => m.title),
      ...c.SPIRIT_SERVICES.map((s) => s.metaTitle),
    ]
    for (const key of ["metaTitle", "metaDescription", "h1", "intro"] as const) {
      const values = pages.map((p) => p[key])
      expect(new Set(values).size, key).toBe(values.length)
    }
    for (const p of pages) expect(others).not.toContain(p.metaTitle)
  })

  it("chaque page ville nomme sa commune dans le titre, le H1 et l'intro", () => {
    for (const p of c.SPIRIT_CITY_PAGES) {
      expect(p.metaTitle).toContain(p.city)
      expect(p.h1).toContain(p.city)
      expect(p.intro).toContain(p.city)
    }
  })

  it("communes proches : toutes dans la liste, jamais la ville elle-même, listes différentes", () => {
    for (const p of c.SPIRIT_CITY_PAGES) {
      expect(p.nearby.length).toBeGreaterThan(0)
      expect(p.nearby).not.toContain(p.city)
      for (const n of p.nearby) expect(L85_CITIES).toContain(n)
      expect(new Set(p.nearby).size).toBe(p.nearby.length)
    }
    const keys = c.SPIRIT_CITY_PAGES.map((p) => p.nearby.join("|"))
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("aucune distance ni durée de trajet inventée", () => {
    for (const p of pages) expect(`${p.intro} ${p.metaDescription}`).not.toMatch(/\d+\s*(km|min)/)
  })

  it("une seule balise <h1> par gabarit", () => {
    for (const f of ["zone-page.tsx", "city-page.tsx"]) {
      expect((read(`${SPIRIT}/${f}`).match(/<h1[\s>]/g) ?? []).length, f).toBe(1)
    }
  })

  it("pages ville : FAQ affichée sans JSON-LD FAQPage ; bouton « Réserver une prestation » vers /#demande-devis", async () => {
    expect(read(`${SPIRIT}/city-page.tsx`)).toMatch(/<SpiritFaq entries=\{SPIRIT_FAQ\} withJsonLd=\{false\}/)
    const z = await import("@/components/custom-sites/spirit-acs/zone-page")
    expect(z.SPIRIT_BOOK_LABEL).toBe("Réserver une prestation")
    expect(z.SPIRIT_BOOK_PATH).toBe("/#demande-devis")
  })

  it("pied de page et section zone renvoient vers les pages", () => {
    const footer = read(`${SPIRIT}/spirit-footer.tsx`)
    expect(footer).toMatch(/Nous intervenons à/)
    expect(footer).toMatch(/spiritCityPath\(p\.slug\)/)
    expect(footer).toMatch(/SPIRIT_ZONE_PATH/)
    const zone = read(`${SPIRIT}/spirit-zone.tsx`)
    expect(zone).toMatch(/Voir la zone d&apos;intervention/)
    expect(zone).toMatch(/spiritCityPath\(page\.slug\)/)
  })
})

describe("L85 — prix « dès » (affichage et JSON-LD Service)", async () => {
  const c = await import("@/components/custom-sites/spirit-acs/seo-content")
  const o = await import("@/components/custom-sites/spirit-acs/service-offers")

  it("une Offer par formule chiffrée, montant = priceCents / 100, rien pour « quote »", () => {
    for (const s of c.SPIRIT_SERVICES) {
      const offers = o.spiritServiceOffers(s) as Array<{
        name: string
        priceCurrency: string
        priceSpecification: { minPrice: number; priceCurrency: string }
      }>
      const priced = (s.formules ?? []).filter(
        (f) => (f.priceKind === "from" || f.priceKind === "exact") && typeof f.priceCents === "number",
      )
      expect(offers.map((x) => x.name), s.slug).toEqual(priced.map((f) => f.label))
      offers.forEach((x, i) => {
        expect(x.priceSpecification.minPrice).toBe(priced[i].priceCents! / 100)
        expect(x.priceCurrency).toBe("EUR")
        expect(x.priceSpecification.priceCurrency).toBe("EUR")
      })
      for (const q of (s.formules ?? []).filter((f) => f.priceKind === "quote")) {
        expect(offers.map((x) => x.name), q.label).not.toContain(q.label)
      }
    }
  })

  it("Service : provider par @id, 14 City, offers absent pour une prestation tout sur devis, pas d'aggregateRating", () => {
    const base = c.getSpiritService("protection-ppf")!
    const ld = o.buildSpiritServiceJsonLd({
      service: base,
      url: "https://www.spiritacs.com/prestations/protection-ppf",
      providerId: "https://www.spiritacs.com/#business",
      providerName: "Spirit Auto Clean Service",
    })
    expect(ld["@type"]).toBe("Service")
    expect((ld.provider as Record<string, unknown>)["@id"]).toBe("https://www.spiritacs.com/#business")
    expect((ld.areaServed as unknown[]).length).toBe(14)
    expect(ld.offers).toEqual([expect.objectContaining({ name: "Peinture d'étriers" })])
    expect("aggregateRating" in ld).toBe(false)

    const allQuote = { ...base, formules: base.formules!.filter((f) => f.priceKind === "quote") }
    const ldQuote = o.buildSpiritServiceJsonLd({
      service: allQuote,
      url: "https://www.spiritacs.com/prestations/protection-ppf",
      providerId: "https://www.spiritacs.com/#business",
      providerName: "Spirit Auto Clean Service",
    })
    expect("offers" in ldQuote).toBe(false)
    expect(o.spiritStartingPriceLabel(allQuote)).toBe("Sur devis")
  })

  it("prix « dès » affiché = plus petit montant du code, toujours suivi du nom de la formule", () => {
    const start = o.spiritStartingPrice(c.getSpiritService("nettoyage-automobile")!)
    expect(start).toMatchObject({ priceCents: 7500, label: "Entretien régulier — Citadine" })
    expect(o.spiritStartingPrice(c.getSpiritService("nettoyage-textile")!)?.label).toBe("À partir de 5 chaises")
  })

  const plain = (s: string) => s.replace(/[  ]/g, " ")
  const render = async () => {
    const { createElement } = await import("react")
    const { renderToStaticMarkup } = await import("react-dom/server")
    const z = await import("@/components/custom-sites/spirit-acs/zone-page")
    const html = renderToStaticMarkup(createElement(z.SpiritPriceList, { tenantSlug: "spirit-acs" }))
    return plain(html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " "))
  }

  it("textile : le prix de 15 € est affiché « par chaise »", async () => {
    const label = plain(o.spiritStartingPriceLabel(c.getSpiritService("nettoyage-textile")!))
    expect(label).toBe("dès 15 € par chaise · À partir de 5 chaises")
    expect(await render()).toContain("dès 15 € par chaise · À partir de 5 chaises")
  })

  it("entretien : 75 € est affiché par mois, nettoyage ponctuel sur devis", async () => {
    const expected = "dès 75 € par mois · Entretien régulier — Citadine, mensuel ; nettoyage ponctuel sur devis"
    expect(plain(o.spiritStartingPriceLabel(c.getSpiritService("nettoyage-automobile")!))).toBe(expected)
    expect(await render()).toContain(expected)
  })

  it("liste des prix : les montants ronds n'ont pas de décimales, les autres les gardent", () => {
    const label = (priceCents: number) =>
      plain(o.spiritStartingPriceLabel({ formules: [{ label: "F", priceCents, priceKind: "from" }] }))
    expect(label(29900)).toBe("dès 299 € · F")
    expect(label(1550)).toBe("dès 15,50 € · F")
    expect(label(100000)).toBe("dès 1 000 € · F")
  })

  it("JSON-LD : un prix avec unité la publie (unitText), les autres n'en ont pas", () => {
    const unitTexts = (slug: string) =>
      (o.spiritServiceOffers(c.getSpiritService(slug)!) as Array<{ priceSpecification: { unitText?: string } }>).map(
        (x) => x.priceSpecification.unitText,
      )
    expect(unitTexts("nettoyage-textile")).toContain("par chaise")
    expect(unitTexts("nettoyage-automobile")).toContain("par mois")
    expect(unitTexts("protection-ppf")).toEqual([undefined])
  })

  it("la liste des prix précise le coût du déplacement textile", async () => {
    expect(await render()).toContain(c.SPIRIT_ZONE_TEXTILE_NOTE)
  })

  it("la page prestation émet le JSON-LD Service", () => {
    const src = read(`${SPIRIT}/service-page.tsx`)
    expect(src).toMatch(/buildSpiritServiceJsonLd\(/)
    expect(src).toMatch(/JSON\.stringify\(serviceJsonLd\)/)
  })
})

describe("L85 — sitemaps : 6 nouvelles URL chez Spirit uniquement", async () => {
  const spirit = await sitemapUrls("www.spiritacs.com")
  const others = await sitemapUrls("www.cleanyzer.fr", "www.detailflow.fr")

  it("Spirit : /zone-intervention et les 5 pages ville", () => {
    expect(spirit).toContain("https://www.spiritacs.com/zone-intervention")
    for (const s of L85_CITY_SLUGS) expect(spirit).toContain(`https://www.spiritacs.com/detailing/${s}`)
    expect(spirit).not.toContain("https://www.spiritacs.com/detailing/lagny-sur-marne")
  })

  it("Cleanyzer et detailflow.fr : aucune de ces URL", () => {
    for (const u of others) {
      expect(u).not.toMatch(/\/zone-intervention(\?|$)/)
      expect(u).not.toMatch(/\/detailing\//)
    }
  })
})

describe("L85 — routes : isolation tenant et communes inconnues", async () => {
  const city = await import("@/app/(site)/detailing/[commune]/page")
  const local = await import("@/app/(site)/[localSlug]/page")
  const cityParams = (commune: string) => ({ params: Promise.resolve({ commune }) })
  const localParams = (localSlug: string) => ({ params: Promise.resolve({ localSlug }) })
  const as = (slug: string, key: string | null) => {
    l85.tenant = slug ? l85Tenant(slug, key) : null
    l85.siteKey = key
  }

  it("Spirit : les 5 pages ville et la page zone se rendent", async () => {
    as("spirit-acs", "spirit-acs")
    for (const s of L85_CITY_SLUGS) expect(await notFoundOf(() => city.default(cityParams(s)))).toBe(false)
    expect(await notFoundOf(() => local.default(localParams("zone-intervention")))).toBe(false)
  })

  it("Spirit : commune inconnue (dont Lagny) → notFound", async () => {
    as("spirit-acs", "spirit-acs")
    for (const s of ["lagny-sur-marne", "jossigny", "marne-la-vallee", "inconnue"]) {
      expect(await notFoundOf(() => city.default(cityParams(s))), s).toBe(true)
    }
    expect(await notFoundOf(() => local.default(localParams("zone-intervention-annecy")))).toBe(true)
  })

  it("Cleanyzer, site standard et domaine racine → notFound sur les pages Spirit", async () => {
    for (const [slug, key] of [
      ["cleanyzer", "cleanyzer"],
      ["autre-garage", null],
      ["", null],
    ] as const) {
      as(slug, key)
      expect(await notFoundOf(() => city.default(cityParams("chelles"))), `${slug}`).toBe(true)
      expect(await city.generateMetadata(cityParams("chelles"))).toEqual({})
    }
    as("cleanyzer", "cleanyzer")
    expect(await notFoundOf(() => local.default(localParams("zone-intervention")))).toBe(true)
  })

  it("métadonnées Spirit : titre et canonique www.spiritacs.com", async () => {
    as("spirit-acs", "spirit-acs")
    const m = JSON.stringify(await city.generateMetadata(cityParams("chelles")))
    expect(m).toContain("Detailing à Chelles à domicile | Spirit ACS")
    expect(m).toContain("https://www.spiritacs.com/detailing/chelles")
    const z = JSON.stringify(await local.generateMetadata(localParams("zone-intervention")))
    expect(z).toContain("https://www.spiritacs.com/zone-intervention")
  })
})
