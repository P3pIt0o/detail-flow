import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

/** L60 — Cleanyzer : liens natifs décidés par l'hôte, partenaires, avis Google, RS3, prix Excellence SUV. */

vi.mock("next/font/google", () => ({
  Fraunces: () => ({ className: "f", variable: "--font-clz-display" }),
  Inter: () => ({ className: "i", variable: "--font-clz-sans" }),
}))
vi.mock("next/navigation", () => ({ usePathname: () => "/p/cleanyzer" }))

import { ClzBaseProvider, ClzLink } from "@/components/custom-sites/cleanyzer/clz-link"
import { CLZ_PARTNERS, CLZ_TESTIMONIALS, EXTERIEUR_FORMULAS, INTERIEUR_FORMULAS, partnerHref } from "@/components/custom-sites/cleanyzer/content"
import { AvisSection, TemoignagesSection } from "@/components/custom-sites/cleanyzer/home-sections"
import { AVANT_APRES_PAIRS, PAIRS, RS3_PAIR, TOM_PAIRS } from "@/components/custom-sites/cleanyzer/realisations-tom"
import { clzBaseForHost, clzHref } from "@/components/custom-sites/cleanyzer/tokens"

const ROOT = process.cwd()
const CLZ = "components/custom-sites/cleanyzer"
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8")
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el).replace(/&amp;/g, "&").replace(/&#x27;/g, "'")

describe("L60 — liens natifs et base décidée par l'hôte (point A)", () => {
  it("un cas par hôte", () => {
    const cases: [string | null | undefined, string][] = [
      ["www.cleanyzer.fr", ""],
      ["cleanyzer.fr", ""],
      ["CLEANYZER.FR:443", ""],
      ["detail-flow-abc.vercel.app", "/p/cleanyzer"],
      ["localhost:3000", "/p/cleanyzer"],
      ["www.cleanyzer.fr.evil.com", "/p/cleanyzer"],
      ["autre-tenant.fr", "/p/cleanyzer"],
      [null, "/p/cleanyzer"],
    ]
    for (const [host, base] of cases) expect(clzBaseForHost(host), String(host)).toBe(base)
  })

  it("clzHref : préfixe retiré à la racine seulement, /p/cleanyzer-autre intact, ancres et requêtes conservées", () => {
    expect(clzHref("/p/cleanyzer", "")).toBe("/")
    expect(clzHref("/p/cleanyzer/reservation?service=145", "")).toBe("/reservation?service=145")
    expect(clzHref("/p/cleanyzer#faq", "")).toBe("/#faq")
    expect(clzHref("/p/cleanyzer-autre", "")).toBe("/p/cleanyzer-autre")
    expect(clzHref("/p/cleanyzer/reservation")).toBe("/p/cleanyzer/reservation")
  })

  it("ClzLink rend un <a href> natif dans les deux modes (insensible à la navigation client de Next)", () => {
    const root = html(createElement(ClzBaseProvider, { value: "" }, createElement(ClzLink, { href: "/p/cleanyzer/reservation" }, "Réserver")))
    const other = html(createElement(ClzLink, { href: "/p/cleanyzer/reservation" }, "Réserver"))
    expect(root).toMatch(/<a [^>]*href="\/reservation"/)
    expect(other).toMatch(/<a [^>]*href="\/p\/cleanyzer\/reservation"/)
  })

  it("plus aucun lien next/link ni NEXT_PUBLIC_VERCEL_ENV dans le site Cleanyzer", () => {
    for (const f of ["home-sections.tsx", "hero.tsx", "nav.tsx", "site-shell.tsx", "service-page.tsx", "prestations.tsx", "tokens.ts"]) {
      const src = read(`${CLZ}/${f}`)
      expect(src, f).not.toMatch(/from "next\/link"/)
      expect(src, f).not.toContain("NEXT_PUBLIC_VERCEL_ENV")
    }
  })

  it("aucune couche plein écran cliquable hors lightbox ; les gestionnaires visite/films n'annulent pas les clics", () => {
    for (const f of ["visit-video.tsx", "prestations-film.tsx"]) expect(read(`${CLZ}/${f}`), f).not.toContain("preventDefault")
  })
})

/** Règles CSS (sélecteur → corps) d'un fichier, sans les @media imbriqués : suffisant pour repérer les couches. */
const cssRules = (file: string) =>
  [...read(`${CLZ}/${file}`).replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }))

describe("L60 — pas de couche qui intercepte les clics (point A, test statique)", () => {
  // L'elementFromPoint en 390×844 sur téléphone reste à faire par Clément : ce test ne couvre que le CSS.
  for (const file of ["cleanyzer.css", "visit-video.css"]) {
    it(`${file} : tout pseudo-élément ou voile couvrant (inset:0) est pointer-events:none`, () => {
      const bad = cssRules(file).filter(
        ({ sel, body }) =>
          /::(before|after)|vig|veil|overlay|scrim/i.test(sel) && /inset:\s*0(?!\s*0?\s*auto)/.test(body) && !/pointer-events:\s*none/.test(body),
      )
      expect(bad.map((r) => r.sel)).toEqual([])
    })

    it(`${file} : toute couche fixed masquée (opacity:0) est pointer-events:none`, () => {
      const bad = cssRules(file).filter(({ body }) => /position:\s*fixed/.test(body) && /opacity:\s*0\b/.test(body) && !/pointer-events:\s*none/.test(body))
      expect(bad.map((r) => r.sel)).toEqual([])
    })
  }

  it("le dock fixe est inerte tant qu'il n'est pas affiché", () => {
    const dock = cssRules("cleanyzer.css").find((r) => /\.clz-neon-dock$/.test(r.sel))
    expect(dock?.body).toMatch(/pointer-events:\s*none/)
  })

  it("les états .off de la visite ne captent pas les clics", () => {
    const off = cssRules("visit-video.css").filter((r) => /\.off$/.test(r.sel))
    expect(off.length).toBeGreaterThan(0)
    for (const r of off) expect(r.body, r.sel).toMatch(/pointer-events:\s*none/)
  })
})

describe("L60 — la base des liens suit l'hôte sans cache partagé (point 4)", () => {
  it("elle est lue dans headers() à chaque requête, jamais dans un module statique", () => {
    const src = read(`${CLZ}/site-base.ts`)
    expect(src).toMatch(/\(await headers\(\)\)\.get\("host"\)/)
    expect(src).not.toMatch(/unstable_cache|"use cache"|generateStaticParams|revalidate/)
  })

  it("chaque page qui rend ClzHostShell résout d'abord le tenant par en-tête (donc déjà dynamique avant L60)", () => {
    const pages = ["app/(site)/page.tsx", "app/(site)/prestations/[service]/page.tsx", "app/(site)/[localSlug]/page.tsx", "app/(site)/reservation/page.tsx"]
    for (const p of pages) expect(read(p), p).toMatch(/getCurrentTenant|resolveCustomSite|getCustomSitePublicData|resolvePublicRequestTenant/)
    // getCurrentTenant lit x-tenant-slug via headers() : rendu dynamique par construction.
    expect(read("lib/tenant.ts")).toMatch(/await headers\(\)[\s\S]*x-tenant-slug/)
    for (const p of pages) expect(read(p), p).not.toMatch(/export const (dynamic\s*=\s*"force-static"|revalidate)/)
  })
})

describe("L60 — partenaires et avis Google (point C)", () => {
  it("Trofeo absent ; les 5 ajoutés présents ; Morel et Brin gardés", () => {
    const names = CLZ_PARTNERS.map((p) => p.name)
    expect(names.join("|")).not.toMatch(/trofeo/i)
    for (const n of ["Exutoire Nettoyage", "Accord Immobilier", "Prestige Drive", "Peugeot Mouthon", "Flèche Taxis 74", "Morel Piscine", "Brin de Verdure"]) {
      expect(names).toContain(n)
    }
    expect(JSON.stringify(CLZ_TESTIMONIALS)).not.toMatch(/trofeo/i)
  })

  it("logo seulement pour les fichiers fournis (et existants) ; les autres en texte", () => {
    const withLogo = CLZ_PARTNERS.filter((p) => p.logo).map((p) => p.name)
    expect(withLogo).toEqual(["Perrin Electric", "Pinto Maçonnerie", "Morel Piscine", "Brin de Verdure", "Peugeot Mouthon", "Flèche Taxis 74"])
    for (const p of CLZ_PARTNERS.filter((x) => x.logo)) expect(existsSync(path.join(ROOT, "public", p.logo!)), p.name).toBe(true)
  })

  it("chaque partenaire : lien nouvel onglet, noopener noreferrer, libellé accessible, URL Maps encodée", () => {
    const out = html(createElement(TemoignagesSection))
    for (const p of CLZ_PARTNERS) {
      expect(out).toContain(`aria-label="${p.name} — ouvrir dans un nouvel onglet"`)
      expect(out).toContain(`href="${partnerHref(p.name)}"`)
    }
    expect(partnerHref("Flèche Taxis 74")).toBe("https://www.google.com/maps/search/?api=1&query=Fl%C3%A8che%20Taxis%2074")
    const anchors = out.match(/<a [^>]*>/g) ?? []
    expect(anchors.length).toBe(CLZ_PARTNERS.length * 2 + CLZ_TESTIMONIALS.length) // copie du défilement + liens des avis
    for (const a of anchors) {
      expect(a).toContain('target="_blank"')
      expect(a).toContain('rel="noopener noreferrer"')
    }
  })

  it("logo Mouthon jamais agrandi (200×75, hauteur affichée ≤ 75)", () => {
    expect(read(`${CLZ}/home-sections.tsx`)).toMatch(/height: 32/)
  })

  it("3 avis Google recopiés mot pour mot, mention « Avis Google », aucun JSON-LD Review", () => {
    expect(CLZ_TESTIMONIALS.map((t) => [t.company, t.quote])).toEqual([
      ["Magasin Perrin", "Travail de pro. Je recommande fortement"],
      ["Brin de Verdure", "Un nettoyage parfait à la hauteur de mes attentes"],
      [
        "Prestige Drive",
        "Excellent professionnel, travail sérieux et toujours soigné. Nous avons la chance de collaborer avec Cleanyzer dans le cadre de notre activité chez Prestige Drive, et nous sommes pleinement satisfaits de ce partenariat. Les véhicules sont toujours préparés avec soin, le résultat est impeccable et le service est vraiment à la hauteur. C'est un partenaire de confiance, professionnel, réactif et appliqué. Nous recommandons sans hésitation",
      ],
    ])
    const out = html(createElement(TemoignagesSection))
    expect((out.match(/Avis Google<span/g) ?? []).length).toBe(3)
    for (const f of ["seo-content.ts", "content.ts", "pages.tsx", "home-page.tsx"]) expect(read(`${CLZ}/${f}`), f).not.toMatch(/"@type":\s*"Review"/)
  })
})

describe("L60 — note Google une seule fois (point D)", () => {
  it("« Avis clients » sans note, étoiles ni nombre d'avis ; titre et bouton conservés", () => {
    const out = html(createElement(AvisSection))
    expect(out).toContain("Ils ont adoré le résultat")
    expect(out).toContain("Voir les avis Google")
    expect(out).not.toMatch(/5,0|\/ 5|96 avis|Basé sur|<svg/)
  })
})

describe("L60 — avant / après RS3 (point B)", () => {
  it("RS3 première, textes alternatifs exacts, autres paires dans le même ordre", () => {
    expect(AVANT_APRES_PAIRS[0]).toBe(RS3_PAIR)
    expect(RS3_PAIR.altBefore).toBe("Audi RS3 pendant le lavage")
    expect(RS3_PAIR.altAfter).toBe("Audi RS3 après le lavage")
    for (const f of [RS3_PAIR.before, RS3_PAIR.after]) expect(existsSync(path.join(ROOT, "public", f))).toBe(true)
    expect(AVANT_APRES_PAIRS.slice(1)).toEqual(TOM_PAIRS)
    expect(PAIRS.map((p) => p.before)).toEqual(["phare-avant-1", "phare-avant-2", "siege-avant"])
  })
})

describe("L60 — prix Excellence intérieur SUV (point E)", () => {
  it("165 € ; citadine 115 et berline 135 inchangés ; autres formules inchangées", () => {
    const ex = INTERIEUR_FORMULAS.find((f) => f.key === "excellence")!
    expect(ex.prices).toEqual({ citadine: 115, berline: 135, suv: 165 })
    expect(INTERIEUR_FORMULAS.find((f) => f.key === "premium")!.prices).toEqual({ citadine: 80, berline: 95, suv: 120 })
    expect(EXTERIEUR_FORMULAS.flatMap((f) => Object.values(f.prices)).filter((v) => v === 165)).toHaveLength(0)
  })

  it("fourchette publiée dérivée du barème : « 30 € – 165 € »", () => {
    const all = [...INTERIEUR_FORMULAS, ...EXTERIEUR_FORMULAS].flatMap((f) => Object.values(f.prices)).filter((v): v is number => typeof v === "number")
    expect(Math.max(...all)).toBeLessThanOrEqual(165)
    expect(read(`${CLZ}/content.ts`)).not.toMatch(/suv: 160/)
  })
})

/* ───────────── L60 (17/11/2026) : accueil entier et pages non migrées ───────────── */

const mode = vi.hoisted(() => ({ base: "" }))
const tenantKey = vi.hoisted(() => ({ value: "cleanyzer" }))
vi.mock("@/components/custom-sites/cleanyzer/site-base", async () => {
  const { createElement: h } = await import("react")
  const { CleanyzerShell } = await import("@/components/custom-sites/cleanyzer/site-shell")
  return { ClzHostShell: (p: Record<string, unknown>) => h(CleanyzerShell as never, { ...p, base: mode.base }) }
})

import { CleanyzerHome } from "@/components/custom-sites/cleanyzer/home-page"
import { publicPageDomainRedirect, parsePublicPagePath } from "@/lib/tenant-shared"

const renderHome = async (base: string) => {
  mode.base = base
  return html(await CleanyzerHome({}))
}
const hrefs = (out: string) => [...out.matchAll(/<a [^>]*?href="([^"]*)"/g)].map((m) => m[1])
const isInternal = (h: string) => h.startsWith("/") && !h.startsWith("//")

describe("L60 — accueil entier, C1 : chaque lien mène à sa cible dans les deux modes", () => {
  it("racine (www.cleanyzer.fr) : aucun lien interne en /p/cleanyzer ; sinon mêmes cibles, préfixées", async () => {
    const root = hrefs(await renderHome(""))
    const other = hrefs(await renderHome("/p/cleanyzer"))
    expect(root.length).toBeGreaterThan(10)
    expect(root.filter((h) => h.startsWith("/p/cleanyzer"))).toEqual([])
    expect(root).toEqual(other.map((h) => clzHref(h, "")))
    expect(other.filter(isInternal).every((h) => h.startsWith("/p/cleanyzer"))).toBe(true)
    // Liens externes (Maps, WhatsApp, tel:) identiques dans les deux modes.
    expect(root.filter((h) => !isInternal(h))).toEqual(other.filter((h) => !isInternal(h)))
  })

  it("aucun href vide ou « # » seul : pas de bouton mort", async () => {
    for (const b of ["", "/p/cleanyzer"]) expect((await renderHome(b)).match(/href=""|href="#"/g) ?? []).toEqual([])
  })
})

describe("L60 — accueil entier, D : note Google une seule fois", () => {
  it("« 5,0 » et « 96 avis » (repli, L79) apparaissent une seule fois sur toute la page", async () => {
    const text = (await renderHome("")).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")
    expect((text.match(/5,0/g) ?? []).length).toBe(1)
    expect((text.match(/96 avis/g) ?? []).length).toBe(1)
  })

  it("logo Mouthon jamais affiché au-delà de sa taille réelle (75 px de haut)", async () => {
    const out = await renderHome("")
    const tag = out.match(/<img[^>]*garage-mouthon-peugeot\.webp[^>]*>/)?.[0] ?? ""
    expect(tag).not.toBe("")
    expect(Number(tag.match(/height:\s*(\d+)px/)?.[1] ?? tag.match(/height="(\d+)"/)?.[1])).toBeLessThanOrEqual(75)
  })
})

describe("L60 — bande partenaires = même mécanique que la bande fournisseurs", () => {
  it("mêmes classes de bande, une seule animation CSS, mouvement réduit couvert, liens nouvel onglet", () => {
    for (const f of ["home-sections.tsx", "fournisseurs.tsx"]) {
      const src = read(`${CLZ}/${f}`)
      expect(src).toContain('className="clz-neon-band"')
      expect(src).toContain('className="clz-neon-marquee"')
      expect(src).toContain('className="clz-neon-track"')
      expect(src).toContain('"clz-neon-sup"')
    }
    const css = read(`${CLZ}/cleanyzer.css`)
    // aucune animation propre aux partenaires : la piste est partagée
    expect((css.match(/animation:\s*clz-neon-marq/g) ?? []).length).toBe(1)
    expect(css).not.toMatch(/partner[^{]*\{[^}]*animation/)
    const out = html(createElement(TemoignagesSection))
    expect(out).toContain('class="clz-neon-track"')
    expect(out.match(/class="clz-neon-sup"[^>]*target="_blank"/g)?.length).toBe(CLZ_PARTNERS.length * 2) // liste + copie masquée
  })
})

describe("L60 — avis : logo et lien partenaire sur chaque carte", () => {
  it("chaque avis a un lien Maps nouvel onglet (noopener noreferrer) ; logo quand il existe", () => {
    const out = html(createElement(TemoignagesSection))
    for (const t of CLZ_TESTIMONIALS) {
      expect(out).toContain(`href="${partnerHref(t.mapsName ?? t.company)}"`)
      expect(out).toContain(`aria-label="${t.company} — ouvrir dans un nouvel onglet"`)
      if (t.logo) expect(out).toContain(`src="${t.logo}"`)
    }
  })
})

describe("L60 — pages encore en /p/cleanyzer : leurs liens fonctionnent sur www.cleanyzer.fr", () => {
  it("chaque lien /p/cleanyzer… est redirigé en une fois vers www.cleanyzer.fr, sans boucle, vers un chemin sans préfixe", async () => {
    const { RealisationsPage, AProposPage, TarifsPage, FaqPage } = await import("@/components/custom-sites/cleanyzer/pages")
    const { AutoPrestationView, TextilePrestationView } = await import("@/components/custom-sites/cleanyzer/prestations")
    const { LocalPageAnnecy } = await import("@/components/custom-sites/cleanyzer/local-page")
    const { CleanyzerConfigurator } = await import("@/components/custom-sites/cleanyzer/configurator")
    mode.base = "/p/cleanyzer"
    const pages = [RealisationsPage, AProposPage, TarifsPage, FaqPage, TextilePrestationView, LocalPageAnnecy, CleanyzerConfigurator]
    const els = [...pages.map((P) => createElement(P as never)), createElement(AutoPrestationView, { kind: "interieur" } as never), createElement(AutoPrestationView, { kind: "exterieur" } as never)]
    const links = new Set<string>()
    for (const el of els) for (const h of hrefs(html(el))) if (h.startsWith("/p/cleanyzer")) links.add(h)
    expect(links.size).toBeGreaterThan(0)
    for (const link of links) {
      const url = new URL(link, "https://www.cleanyzer.fr")
      const target = publicPageDomainRedirect(url.pathname, url.searchParams, "tenant")
      expect(target, link).not.toBeNull()
      const dest = new URL(target!)
      expect(dest.origin, link).toBe("https://www.cleanyzer.fr")
      expect(parsePublicPagePath(dest.pathname), `${link} → boucle`).toBeNull()
      // Page finale : pas de second saut.
      expect(publicPageDomainRedirect(dest.pathname, dest.searchParams, "tenant"), link).toBeNull()
      expect(dest.pathname, link).toBe(clzHref(url.pathname, "") === "/" ? "/" : clzHref(url.pathname, ""))
    }
  })
})

vi.mock("@/lib/custom-sites/server", () => ({ resolveCustomSite: async () => ({ key: tenantKey.value }) }))
vi.mock("@/lib/public-contact", () => ({ getPublicContact: async () => ({ phone: null, phoneRaw: null, email: null }) }))

describe("L60 — autres pages servies sur www.cleanyzer.fr : liens directs à la racine, /p/cleanyzer ailleurs", () => {
  it("prestations, zone d'intervention et pages communes (neon) : racine sans préfixe, autres hôtes inchangés", async () => {
    const { CleanyzerServicePage, CleanyzerZonePage } = await import("@/components/custom-sites/cleanyzer/service-page")
    const { clzNeonPage } = await import("@/components/custom-sites/cleanyzer/neon-page")
    const { CLZ_SERVICE_PAGES } = await import("@/components/custom-sites/cleanyzer/seo-content")
    tenantKey.value = "cleanyzer"
    const render = async (base: string) => {
      mode.base = base
      const els = [...CLZ_SERVICE_PAGES.map((page) => createElement(CleanyzerServicePage, { page })), createElement(CleanyzerZonePage, {})]
      const out = els.map((el) => html(el))
      out.push(html((await clzNeonPage(createElement("p", null, "x"))) as never))
      return out.flatMap(hrefs)
    }
    const root = await render("")
    const other = await render("/p/cleanyzer")
    expect(root.length).toBeGreaterThan(10)
    expect(root.filter((h) => h.startsWith("/p/cleanyzer"))).toEqual([])
    expect(root).toEqual(other.map((h) => clzHref(h, "")))
    expect(other.filter(isInternal).every((h) => h.startsWith("/p/cleanyzer"))).toBe(true)
  })

  it("autre tenant : la page commune est rendue telle quelle, sans coquille Cleanyzer", async () => {
    const { clzNeonPage } = await import("@/components/custom-sites/cleanyzer/neon-page")
    tenantKey.value = "autre"
    const page = createElement("p", null, "x")
    expect(await clzNeonPage(page)).toBe(page)
  })
})

describe("L60 — les maquettes (/cleanyzer-preview) ne sont pas servies sur www.cleanyzer.fr", () => {
  const walk = (dir: string): string[] =>
    readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.tsx?$/.test(e.name) ? [`${dir}/${e.name}`] : [],
    )
  it("local-page, prestations, pages et configurator ne sont importés que depuis app/cleanyzer-preview ou entre eux", () => {
    const re = /cleanyzer\/(local-page|prestations|pages|configurator)["']/
    const users = [...walk("app"), ...walk("components"), ...walk("lib")].filter((f) => re.test(read(f)))
    expect(users.filter((f) => !f.startsWith("app/cleanyzer-preview/"))).toEqual([])
  })
  it("le middleware sert /cleanyzer-preview tel quel, sans réécriture vers la vitrine", () => {
    expect(read("middleware.ts")).toMatch(/!path\.startsWith\("\/cleanyzer-preview"\)/)
  })
})
