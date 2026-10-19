import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"
import { tenantCanonicalUrl, tenantSeoIdentity } from "@/lib/seo/tenant-url"
import { buildServiceJsonLd, buildLocalBusinessJsonLd } from "@/lib/seo/structured-data"
import {
  tenantCanonicalHost,
  tenantCanonicalPathPrefix,
  TENANT_PATH_CANONICAL,
  TENANT_CANONICAL_HOST,
  parsePublicPagePath,
  resolveHost,
} from "@/lib/tenant-shared"
import { CLZ_BOOKING_HREF, CLZ_DEMANDE_HREF, CLZ_HOME_HREF, clzPath } from "@/components/custom-sites/cleanyzer/tokens"
import { getPublicSiteCatalog, listSitemapPaths } from "@/lib/public-site/provider"
import sitemap from "@/app/sitemap"
import {
  CLZ_HOME_META,
  CLZ_PRICES,
  CLZ_PRICE_RANGE,
  CLZ_SERVICE_PAGES,
  CLZ_ZONE_PAGE,
  getClzServicePage,
  isClzZoneSlug,
} from "@/components/custom-sites/cleanyzer/seo-content"
import { CLZ_FAQ } from "@/components/custom-sites/cleanyzer/faq-content"
import {
  INTERIEUR_FORMULAS,
  EXTERIEUR_FORMULAS,
  INTERIEUR_OPTIONS,
  TEXTILE_ITEMS,
  TEXTILE_SUPPLEMENTS,
} from "@/components/custom-sites/cleanyzer/content"
import { SERVICES, OPTIONS, TEXTILE_REQUEST_TYPE } from "../scripts/cleanyzer-catalog-import.mjs"

const root = process.cwd()
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8")
const CLZ = "components/custom-sites/cleanyzer"
const BASE = "https://www.detailflow.fr/p/cleanyzer"

const identity = tenantSeoIdentity({
  slug: "cleanyzer",
  publicDomain: tenantCanonicalHost("cleanyzer"),
  publicPathPrefix: tenantCanonicalPathPrefix("cleanyzer"),
})

describe("Cleanyzer — URL canoniques sous /p/cleanyzer", () => {
  it("préfixe canonique réservé aux tenants de la table fermée", () => {
    expect(TENANT_PATH_CANONICAL.has("cleanyzer")).toBe(true)
    expect(tenantCanonicalPathPrefix("cleanyzer")).toBe("/p/cleanyzer")
    expect(tenantCanonicalPathPrefix("rozancleaningservice")).toBeNull()
    expect(tenantCanonicalPathPrefix("spirit-acs")).toBeNull()
  })

  it("accueil et sous-pages : une seule URL, sans ?tenant=", () => {
    expect(tenantCanonicalUrl("/", identity)).toBe(BASE)
    expect(tenantCanonicalUrl("/prestations/nettoyage-interieur-voiture-annecy", identity)).toBe(
      `${BASE}/prestations/nettoyage-interieur-voiture-annecy`,
    )
    expect(tenantCanonicalUrl("/zone-intervention-annecy?x=1#y", identity)).toBe(`${BASE}/zone-intervention-annecy`)
  })

  it("un domaine vérifié reste prioritaire sur le préfixe", () => {
    const withDomain = tenantSeoIdentity({ slug: "cleanyzer", publicDomain: "www.exemple.fr", publicPathPrefix: "/p/cleanyzer" })
    expect(tenantCanonicalUrl("/", withDomain)).toBe("https://www.exemple.fr/")
  })

  it("les autres tenants gardent exactement la forme historique", () => {
    expect(tenantCanonicalUrl("/avis", tenantSeoIdentity({ slug: "autre" }))).toBe("https://www.detailflow.fr/avis?tenant=autre")
    expect(tenantCanonicalUrl("/", tenantSeoIdentity({ slug: "autre", publicPathPrefix: null }))).toBe(
      "https://www.detailflow.fr/?tenant=autre",
    )
  })
})

describe("Cleanyzer — sitemap et catalogue", () => {
  const urls = sitemap().map((e) => e.url)

  it("prépublication V1 : aucune URL Cleanyzer dans le sitemap", () => {
    for (const u of urls) {
      expect(u.startsWith(BASE)).toBe(false)
      expect(u).not.toContain("tenant=cleanyzer")
    }
  })

  it("le catalogue reste prêt : accueil, 3 prestations et page zone", () => {
    const paths = listSitemapPaths(getPublicSiteCatalog("cleanyzer")!).map((e) => e.path)
    expect(paths).toContain("/")
    for (const p of CLZ_SERVICE_PAGES) expect(paths).toContain(`/prestations/${p.slug}`)
    expect(paths).toContain(`/${CLZ_ZONE_PAGE.slug}`)
    for (const p of paths) expect(p).not.toMatch(/\/reservation|\/demande|cleanyzer-preview/)
  })

  it("Spirit ACS et Rozan restent dans le sitemap", () => {
    for (const key of ["spirit-acs", "rozan"] as const) {
      const catalog = getPublicSiteCatalog(key)!
      const id = tenantSeoIdentity({
        slug: catalog.tenantSlug,
        publicDomain: tenantCanonicalHost(catalog.tenantSlug),
        publicPathPrefix: tenantCanonicalPathPrefix(catalog.tenantSlug),
      })
      for (const { path: p } of listSitemapPaths(catalog)) expect(urls).toContain(tenantCanonicalUrl(p, id))
    }
  })

  it("noindex, follow appliqué à Cleanyzer seul dans les deux points d'entrée", () => {
    const src = read("lib/seo/tenant-seo.server.ts")
    expect(src).toContain('const PREPUBLICATION_NOINDEX_SITE_KEYS = new Set(["cleanyzer"])')
    expect(src).toContain("{ index: false, follow: true }")
    expect(src).toContain("if (isPrepublicationSite(tenant.customSiteKey)) return PREPUBLICATION_ROBOTS")
    expect(src).toContain("robots: isPrepublicationSite(seo.customSiteKey) ? PREPUBLICATION_ROBOTS : args.robots")
  })

  it("chaque chemin du catalogue est servi par une route", () => {
    const catalog = getPublicSiteCatalog("cleanyzer")
    expect(catalog?.tenantSlug).toBe("cleanyzer")
    for (const { path: p } of listSitemapPaths(catalog!)) {
      if (p === "/") continue
      const m = p.match(/^\/prestations\/(.+)$/)
      if (m) expect(getClzServicePage(m[1])).not.toBeNull()
      else expect(isClzZoneSlug(p.slice(1))).toBe(true)
    }
  })
})

describe("Cleanyzer — contenu SEO fidèle au barème", () => {
  const texts = [
    CLZ_HOME_META.title,
    CLZ_HOME_META.description,
    ...CLZ_SERVICE_PAGES.flatMap((p) => [p.metaTitle, p.metaDescription, p.h1, p.intro, p.answer.a, ...p.faq.map((f) => f.a)]),
    CLZ_ZONE_PAGE.metaDescription,
    CLZ_ZONE_PAGE.intro,
    ...CLZ_ZONE_PAGE.faq.map((f) => f.a),
  ]

  it("aucune valeur manquante dans les textes générés", () => {
    for (const t of texts) expect(t).not.toMatch(/undefined|NaN|null|Infinity/)
  })

  it("titres ≤ 60 caractères, descriptions ≤ 160", () => {
    for (const t of [CLZ_HOME_META.title, ...CLZ_SERVICE_PAGES.map((p) => p.metaTitle), CLZ_ZONE_PAGE.metaTitle]) {
      expect(t.length).toBeLessThan(61)
    }
    for (const d of [CLZ_HOME_META.description, ...CLZ_SERVICE_PAGES.map((p) => p.metaDescription), CLZ_ZONE_PAGE.metaDescription]) {
      expect(d.length).toBeLessThan(161)
    }
  })

  it("titres et H1 uniques (une intention par page)", () => {
    const titles = [CLZ_HOME_META.title, ...CLZ_SERVICE_PAGES.map((p) => p.metaTitle), CLZ_ZONE_PAGE.metaTitle]
    expect(new Set(titles).size).toBe(titles.length)
    const h1 = [...CLZ_SERVICE_PAGES.map((p) => p.h1), CLZ_ZONE_PAGE.h1]
    expect(new Set(h1).size).toBe(h1.length)
  })

  it("prix « à partir de » calculés depuis content.ts", () => {
    const fixed = (fs: typeof INTERIEUR_FORMULAS) => fs.flatMap((f) => Object.values(f.prices).filter((p): p is number => p != null))
    expect(CLZ_PRICES.interieurMin).toBe(Math.min(...fixed(INTERIEUR_FORMULAS)))
    expect(CLZ_PRICES.exterieurMin).toBe(Math.min(...fixed(EXTERIEUR_FORMULAS)))
    expect(CLZ_PRICES.textileMin).toBe(Math.min(...TEXTILE_ITEMS.flatMap((t) => (t.price == null ? [] : [t.price]))))
    expect(CLZ_PRICE_RANGE).toMatch(/^\d+ € – \d+ €$/)
  })
})

describe("Cleanyzer — données structurées", () => {
  it("Service : offres uniquement à prix publiés, résumé min/max", () => {
    const ld = buildServiceJsonLd({
      name: "Test",
      url: `${BASE}/prestations/x`,
      provider: { name: "CLEANYZER", url: BASE },
      areaServed: ["Annecy"],
      offers: [
        { name: "A", price: 30 },
        { name: "B", price: 80 },
        { name: "Sur devis", price: Number.NaN },
      ],
    }) as any
    expect(ld["@type"]).toBe("Service")
    expect(ld.offers).toMatchObject({ "@type": "AggregateOffer", lowPrice: 30, highPrice: 80, offerCount: 2, priceCurrency: "EUR" })
    expect(ld.hasOfferCatalog.itemListElement).toHaveLength(2)
    expect(ld.areaServed).toEqual([{ "@type": "City", name: "Annecy" }])
  })

  it("Service sans prix publié : aucune offre émise", () => {
    const ld = buildServiceJsonLd({ name: "T", url: BASE, provider: { name: "C", url: BASE }, offers: [] }) as any
    expect(ld.offers).toBeUndefined()
    expect(ld.hasOfferCatalog).toBeUndefined()
  })

  it("priceRange émis seulement s'il est fourni", () => {
    expect((buildLocalBusinessJsonLd({ name: "C", priceRange: "30 € – 160 €" }) as any).priceRange).toBe("30 € – 160 €")
    expect((buildLocalBusinessJsonLd({ name: "C" }) as any).priceRange).toBeUndefined()
  })

  it("FAQPage de l'accueil = FAQ affichée (même source)", () => {
    const home = read(`${CLZ}/home-page.tsx`)
    expect(home).toContain("buildFaqJsonLd(CLZ_FAQ.map(")
    expect(read(`${CLZ}/faq.tsx`)).toContain('from "./faq-content"')
    expect(CLZ_FAQ.length).toBeGreaterThan(0)
  })
})

describe("Cleanyzer — rendu public sans mentions de maquette", () => {
  it("un seul H1 dans le hero, avec les mots-clés", () => {
    const hero = read(`${CLZ}/hero.tsx`)
    expect(hero.match(/<h1[\s>]/g)?.length).toBe(1)
    expect(hero).toMatch(/<h1[\s\S]*Nettoyage automobile à domicile à Annecy[\s\S]*<\/h1>/)
  })

  it("le pied de page n'affiche plus « à confirmer » et réserve la mention maquette à l'aperçu", () => {
    const shell = read(`${CLZ}/site-shell.tsx`)
    expect(shell).not.toContain("à confirmer</li>")
    expect(shell).toMatch(/preview \? \(\s*<span>Maquette de validation/)
  })

  it("la note de développement a disparu de la section réalisations", () => {
    expect(read(`${CLZ}/home-sections.tsx`)).not.toContain("indexables et localisées")
  })

  it("les cartes de l'accueil mènent aux pages de prestations", () => {
    const s = read(`${CLZ}/home-sections.tsx`)
    expect(s.match(/href: servicePath\(/g)?.length).toBe(3)
  })

  it("routes : branches Cleanyzer présentes, autres tenants inchangés", () => {
    const svc = read("app/(site)/prestations/[service]/page.tsx")
    expect(svc).toContain('customSite?.key === "cleanyzer"')
    expect(svc).toContain('customSite?.key === "rozan"')
    const loc = read("app/(site)/[localSlug]/page.tsx")
    expect(loc).toContain("isClzZoneSlug(localSlug)")
    expect(loc).toContain('if (customSite?.key !== "rozan") notFound()')
  })
})

describe("Cleanyzer — parcours textile = demande personnalisée", () => {
  it("le catalogue public déclare le textile en demande, l'automobile en réservation", () => {
    const catalog = getPublicSiteCatalog("cleanyzer")!
    for (const p of catalog.servicePages) {
      const page = getClzServicePage(p.slug)!
      expect(p.conversionMode).toBe(page.kind === "textile" ? "quote_request" : "booking")
    }
  })

  it("aucun texte n'annonce une réservation en ligne pour le textile", () => {
    const textile = CLZ_SERVICE_PAGES.find((p) => p.kind === "textile")!
    const all = [textile.intro, textile.answer.a, ...textile.faq.map((f) => f.q + " " + f.a)].join(" ")
    expect(all).not.toMatch(/réserv/i)
    expect(all).toMatch(/demande personnalisée/)
    expect(CLZ_FAQ.find((f) => /canapé/i.test(f.q))!.a).toContain("demande personnalisée")
  })
})

describe("Cleanyzer — cohérence des tarifs (barème du site ↔ catalogue d'import DetailFlow)", () => {
  const svc = (slug: string) => SERVICES.find((s: { slug: string }) => s.slug === slug) as any
  const opt = (slug: string) => OPTIONS.find((o: { slug: string }) => o.slug === slug) as any
  const byVehicle = (prices: Record<string, number | null>) => [prices.citadine, prices.berline, prices.suv]

  it("formules intérieur et extérieur : mêmes prix par gabarit", () => {
    for (const [formulas, prefix] of [[INTERIEUR_FORMULAS, "interieur"], [EXTERIEUR_FORMULAS, "exterieur"]] as const) {
      for (const f of formulas) {
        if (f.key === "diamond") {
          expect(svc(`${prefix}-diamond`)).toBeUndefined()
          continue
        }
        expect(svc(`${prefix}-${f.key}`).prices).toEqual(byVehicle(f.prices))
      }
    }
  })

  it("canapés : mêmes prix fixes", () => {
    expect(svc("canape-2-3-places").flatPrice).toBe(TEXTILE_ITEMS.find((t) => t.key === "canape-2-3")!.price)
    expect(svc("canape-3-4-places").flatPrice).toBe(TEXTILE_ITEMS.find((t) => t.key === "canape-3-4")!.price)
    expect(svc("canape-5-places-et-plus").flatPrice).toBe(TEXTILE_ITEMS.find((t) => t.key === "canape-5")!.price)
  })

  it("options intérieures et suppléments textile : mêmes montants", () => {
    const map: Record<string, string> = {
      ozone: "ozone", vapeur: "vapeur", "duo-ozone-vapeur": "duo-ozone-vapeur", desinfection: "desinfection",
      vitres: "vitres", "shampoing-moquettes": "shampoing-moquettes", "imper-tapis": "tapis", "imper-coffre": "coffre",
      "imper-sieges": "sieges", "imper-complete": "complete", vomi: "vomi", rails: "rails-regraissage",
    }
    for (const o of INTERIEUR_OPTIONS) {
      if (!map[o.key]) continue
      expect(opt(map[o.key]).price).toBe(o.price)
    }
    expect(`+${opt("textile-cuir").price} € / place`).toBe(TEXTILE_SUPPLEMENTS[0].priceLabel)
    expect(`+${opt("textile-impermeabilisation").price} € / place`).toBe(TEXTILE_SUPPLEMENTS[1].priceLabel)
  })

  it("le type de demande « textile » annonce les mêmes prix que le site", () => {
    expect(TEXTILE_REQUEST_TYPE.description).toContain(`${TEXTILE_ITEMS[0].price} €`)
    expect(TEXTILE_REQUEST_TYPE.description).toContain(`${TEXTILE_ITEMS[1].price} €`)
    expect(TEXTILE_REQUEST_TYPE.description).toContain(`${TEXTILE_ITEMS[2].price} €`)
  })
})

describe("Cleanyzer — URL de réservation et de demande (detailflow.fr/p/cleanyzer et futur domaine)", () => {
  it("liens internes toujours sous /p/cleanyzer (indépendants de l'hôte)", () => {
    expect(CLZ_HOME_HREF).toBe("/p/cleanyzer")
    expect(CLZ_BOOKING_HREF).toBe("/p/cleanyzer/reservation")
    expect(CLZ_DEMANDE_HREF).toBe("/p/cleanyzer/demande")
    expect(clzPath("/prestations/x")).toBe("/p/cleanyzer/prestations/x")
  })

  it("le middleware résout ces chemins vers le tenant cleanyzer, quel que soit l'hôte", () => {
    expect(parsePublicPagePath(CLZ_BOOKING_HREF)).toEqual({ slug: "cleanyzer", rest: "/reservation" })
    expect(parsePublicPagePath(CLZ_DEMANDE_HREF)).toEqual({ slug: "cleanyzer", rest: "/demande" })
    expect(parsePublicPagePath(CLZ_HOME_HREF)).toEqual({ slug: "cleanyzer", rest: "/" })
    // Sans préfixe, un chemin racine sur www.detailflow.fr n'est PAS un chemin tenant
    // (il serait réécrit vers la vitrine) : d'où des liens toujours préfixés.
    expect(parsePublicPagePath("/reservation")).toBeNull()
    expect(resolveHost("www.detailflow.fr", "detailflow.fr").kind).toBe("root")
  })

  it("domaine futur : la canonique bascule, les liens /p/cleanyzer restent valides", () => {
    const withDomain = tenantSeoIdentity({ slug: "cleanyzer", publicDomain: "www.exemple-cleanyzer.fr", publicPathPrefix: null })
    expect(tenantCanonicalUrl("/prestations/x", withDomain)).toBe("https://www.exemple-cleanyzer.fr/prestations/x")
    expect(parsePublicPagePath("/p/cleanyzer/demande")?.rest).toBe("/demande")
  })

  it("tout hôte canonique déclaré est routé vers son tenant (les deux tables restent cohérentes)", () => {
    for (const [slug, host] of Object.entries(TENANT_CANONICAL_HOST)) {
      expect(resolveHost(host, "detailflow.fr")).toEqual({ kind: "tenant", slug })
    }
  })
})

describe("Cleanyzer — FAQ de l'accueil dérivée du barème (texte inchangé)", () => {
  it("les réponses chiffrées sont identiques au texte validé", () => {
    expect(CLZ_FAQ[0].a).toBe(
      "La formule Éco démarre à 50 € pour une citadine (60 € berline, 75 € SUV). La formule Premium débute à 80 € et l'Excellence à 115 €. La formule Diamond est entièrement sur mesure.",
    )
    expect(CLZ_FAQ[1].a).toBe("Oui. CLEANYZER se déplace chez vous à Annecy et alentours, du lundi au dimanche, de 7 h 30 à 20 h 30.")
    expect(CLZ_FAQ[2].a).toBe(
      "20 km à l'aller depuis Choisy, près d'Annecy, sont inclus (soit 40 km aller-retour). Au-delà, le déplacement est facturé 1 € par kilomètre supplémentaire parcouru. Par exemple, 5 km de plus à l'aller représentent 10 € aller-retour.",
    )
    expect(CLZ_FAQ[3].a).toBe(
      "Oui. Le nettoyage textile comprend aspiration complète, shampoing, désinfection et traitement des odeurs. Un canapé 2/3 places est à 80 €, un canapé 3/4 places à 110 €, et un canapé 5 places et plus à partir de 150 €. Le textile passe par une demande personnalisée.",
    )
  })

  it("aucun montant ni horaire écrit en dur dans faq-content.ts", () => {
    const src = read(`${CLZ}/faq-content.ts`)
    expect(src).not.toMatch(/\d+ €/)
    expect(src).not.toMatch(/\d+ h \d+/)
    expect(src).not.toMatch(/\d+ km/)
  })
})
