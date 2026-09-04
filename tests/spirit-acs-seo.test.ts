import { describe, it, expect } from "vitest"
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

const root = process.cwd()
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8")
const SPIRIT = "components/custom-sites/spirit-acs"
const SLUG = "spirit-acs"

// Identité sans domaine personnalisé (état actuel : domaine non connecté).
const spiritIdentity = tenantSeoIdentity({ slug: SLUG })

describe("SEO — URL canoniques tenant-aware (domaine personnalisé non connecté)", () => {
  it("accueil → https://www.detailflow.fr/?tenant=spirit-acs", () => {
    expect(tenantCanonicalUrl("/", spiritIdentity)).toBe("https://www.detailflow.fr/?tenant=spirit-acs")
  })

  it("avis → https://www.detailflow.fr/avis?tenant=spirit-acs", () => {
    expect(tenantCanonicalUrl("/avis", spiritIdentity)).toBe("https://www.detailflow.fr/avis?tenant=spirit-acs")
  })

  it("contact → https://www.detailflow.fr/contact?tenant=spirit-acs", () => {
    expect(tenantCanonicalUrl("/contact", spiritIdentity)).toBe(
      "https://www.detailflow.fr/contact?tenant=spirit-acs",
    )
  })

  it("chaque page de prestation conserve tenant=spirit-acs", () => {
    for (const s of SPIRIT_SERVICES) {
      expect(tenantCanonicalUrl(`/prestations/${s.slug}`, spiritIdentity)).toBe(
        `https://www.detailflow.fr/prestations/${s.slug}?tenant=spirit-acs`,
      )
    }
  })

  it("la base canonique est bien le domaine DetailFlow vérifié", () => {
    expect(SEO_BASE).toBe("https://www.detailflow.fr")
  })

  it("un query/hash passé dans le chemin est ignoré (forme canonique stricte)", () => {
    expect(tenantCanonicalUrl("/avis?foo=1#x", spiritIdentity)).toBe(
      "https://www.detailflow.fr/avis?tenant=spirit-acs",
    )
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
    expect(resolveTenantOrigin(spiritIdentity)).toBeNull()
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
    expect(prest).toMatch(/href=\{serviceHref\(card\.slug\)\}/)
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
  it("les 6 prestations attendues existent dans le config", () => {
    const slugs = SPIRIT_SERVICES.map((s) => s.slug).sort()
    expect(slugs).toEqual(
      [
        "nettoyage-automobile",
        "polissage-automobile",
        "protection-ceramique",
        "protection-ppf",
        "renovation-phares",
        "detailing-moto",
      ].sort(),
    )
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

describe("SEO — sitemap tenant-aware", () => {
  const urls = sitemap().map((e) => e.url)

  it("inclut l'accueil, avis, contact Spirit avec l'URL tenant correcte", () => {
    expect(urls).toContain("https://www.detailflow.fr/?tenant=spirit-acs")
    expect(urls).toContain("https://www.detailflow.fr/avis?tenant=spirit-acs")
    expect(urls).toContain("https://www.detailflow.fr/contact?tenant=spirit-acs")
  })

  it("inclut les 6 pages de prestations Spirit", () => {
    for (const s of SPIRIT_SERVICES) {
      expect(urls).toContain(`https://www.detailflow.fr/prestations/${s.slug}?tenant=spirit-acs`)
    }
  })

  it("n'inclut aucune page admin, API, réservation, ni page légale noindex", () => {
    for (const u of urls) {
      expect(u).not.toMatch(/\/admin|\/super-admin|\/api\/|\/reservation|\/mentions-legales|\/cgv|\/confidentialite/)
    }
  })

  it("ne contient aucune variante dupliquée sans tenant (hors accueil marketing)", () => {
    const nonRoot = urls.filter((u) => u !== "https://www.detailflow.fr")
    for (const u of nonRoot) {
      expect(u, `URL sans tenant: ${u}`).toMatch(/tenant=spirit-acs/)
    }
  })
})
