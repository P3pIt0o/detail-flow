import { existsSync, readFileSync } from "node:fs"
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
import { AVANT_APRES_PAIRS, PAIRS, RS3_PAIR } from "@/components/custom-sites/cleanyzer/realisations-tom"
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
    expect(partnerHref("Flèche Taxis 74")).toBe("https://www.google.com/maps/search/?api=1&query=Fl%C3%A8che%20Taxis%2074%20Annecy")
    const anchors = out.match(/<a [^>]*>/g) ?? []
    expect(anchors.length).toBe(CLZ_PARTNERS.length * 2) // copie du défilement incluse
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
    expect(out).not.toMatch(/5,0|\/ 5|92 avis|Basé sur|<svg/)
  })
})

describe("L60 — avant / après RS3 (point B)", () => {
  it("RS3 première, textes alternatifs exacts, autres paires dans le même ordre", () => {
    expect(AVANT_APRES_PAIRS[0]).toBe(RS3_PAIR)
    expect(RS3_PAIR.altBefore).toBe("Audi RS3 pendant le lavage")
    expect(RS3_PAIR.altAfter).toBe("Audi RS3 après le lavage")
    for (const f of [RS3_PAIR.before, RS3_PAIR.after]) expect(existsSync(path.join(ROOT, "public", f))).toBe(true)
    expect(AVANT_APRES_PAIRS.slice(2)).toEqual(PAIRS)
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
