import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

/**
 * L59 — Cleanyzer : une seule DA néon partout + corrections après L55 (visite 310 images, panneaux
 * compacts, note Google unique, retour au site en réservation, pied de page, liens sans /p/cleanyzer).
 */

const nav = vi.hoisted(() => ({ pathname: "/p/cleanyzer" }))
vi.mock("next/font/google", () => ({
  Fraunces: () => ({ className: "f", variable: "--font-clz-display" }),
  Inter: () => ({ className: "i", variable: "--font-clz-sans" }),
}))
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }))

import { CleanyzerHero } from "@/components/custom-sites/cleanyzer/hero"
import { ClzPresentation } from "@/components/custom-sites/cleanyzer/presentation"
import { PrestationsFilm } from "@/components/custom-sites/cleanyzer/prestations-film"
import { CleanyzerShell } from "@/components/custom-sites/cleanyzer/site-shell"
import { CLZ_SITE_NAV_ITEMS } from "@/components/custom-sites/cleanyzer/nav"
import { FILM_SEQUENCES } from "@/components/custom-sites/cleanyzer/journey"
import { VISIT_FRAME_COUNT, VISIT_STOPS, visitFrameSrc } from "@/components/custom-sites/cleanyzer/visit-video"
import { clzBackHref } from "@/components/custom-sites/cleanyzer/booking-back-link"
import {
  CLZ_BOOKING_HREF,
  CLZ_HOME_HREF,
  clzBookingNeon,
  clzPath,
  clzBaseForHost,
  clzHref,
} from "@/components/custom-sites/cleanyzer/tokens"

const ROOT = process.cwd()
const CLZ = "components/custom-sites/cleanyzer"
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8")
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el).replace(/&amp;/g, "&").replace(/&#x27;/g, "'")
const files = readdirSync(path.join(ROOT, CLZ)).filter((f) => /\.(tsx|ts|css)$/.test(f))
const allCss = files.filter((f) => f.endsWith(".css")).map((f) => read(`${CLZ}/${f}`)).join("\n")

// Contraste WCAG ; `over` = fond sous une couleur translucide.
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const lum = (c: number[]) => {
  const [r, g, b] = c.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a: number[], b: number[]) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
const blend = (fg: number[], alpha: number, bg: number[]) => fg.map((v, i) => v * alpha + bg[i] * (1 - alpha))
const INK = rgb("#04050a")

describe("C1 — une seule DA néon : aucun fond clair", () => {
  it("aucun fichier du site Cleanyzer ne pose de fond clair (hors pastille de logo des témoignages)", () => {
    const light = [
      /\bbg-white(?!\/(?:5|10|20|25)\b)/,
      /\bbg-(?:neutral|gray|slate|zinc)-(?:50|100|200)\b/,
      /background(?:-color)?:\s*(?:#fff\b|#ffffff|white\b|#f[0-9a-f]{5}\b)/i,
      /--clz-(?:bg|surface|surface-2):\s*#[ef]/i,
      /color-scheme:\s*light/,
    ]
    for (const f of files) {
      const src = read(`${CLZ}/${f}`).split("\n").filter((l) => !l.includes("clz-logo-chip")).join("\n")
      for (const re of light) expect(src, `${f} ${re}`).not.toMatch(re)
    }
  })

  it("jetons clairs basculés sur les jetons néon, chacun défini une seule fois", () => {
    for (const t of ["--clz-neon-ink", "--clz-neon-ink-2", "--clz-neon-fg", "--clz-neon-muted", "--clz-neon-blue", "--clz-neon-red", "--clz-neon-grad", "--clz-bg", "--clz-fg"])
      expect(allCss.split(`${t}:`).length - 1, t).toBe(1)
    expect(allCss).toMatch(/--clz-bg: var\(--clz-neon-ink\)/)
    expect(allCss).toMatch(/--clz-fg: var\(--clz-neon-fg\)/)
    expect(allCss).toMatch(/--clz-muted: var\(--clz-neon-muted\)/)
    expect(allCss).toMatch(/--clz-line: var\(--clz-neon-line\)/)
    expect(allCss).toMatch(/--clz-blue: var\(--clz-neon-blue\)/)
    expect(allCss).toMatch(/color-scheme: dark/)
  })

  it("contrastes AA : texte, texte secondaire, sur-titres, bouton en dégradé aux 3 arrêts", () => {
    expect(ratio(rgb("#f2f4fa"), INK)).toBeGreaterThanOrEqual(4.5)
    expect(ratio(blend([226, 232, 245], 0.66, INK), INK)).toBeGreaterThanOrEqual(4.5)
    expect(ratio(rgb("#1f7bff"), INK)).toBeGreaterThanOrEqual(4.5)
    const grad = allCss.match(/--clz-neon-grad:\s*([^;]+);/)?.[1] ?? ""
    const stops = grad.match(/#[0-9a-f]{6}/gi) ?? []
    expect(stops).toHaveLength(3)
    for (const s of stops) expect(ratio([255, 255, 255], rgb(s)), s).toBeGreaterThanOrEqual(4.5)
  })

  it("un seul bouton principal : même dégradé pour le site, le haut de page, la barre flottante et la réservation", () => {
    for (const sel of [".cleanyzer .clz-btn-primary {", ".cleanyzer .clz-neon-btn-primary {", ".cleanyzer .clz-neon-dock-book {", ".cleanyzer .clz-booking-neon :is(button, a).bg-primary {"]) {
      const i = allCss.indexOf(sel)
      expect(i, sel).toBeGreaterThan(-1)
      expect(allCss.slice(i, allCss.indexOf("}", i)), sel).toContain("var(--clz-neon-grad)")
    }
  })

  it("barre du haut et menu mobile toujours sombres ; logo du pied contenu dans le pied", () => {
    const shell = read(`${CLZ}/site-shell.tsx`)
    expect(shell).not.toMatch(/bg-white\/(?:50|80)/)
    expect(shell).toMatch(/clz-watermark[^"]*h-\[calc\(100%-2rem\)\]/)
    expect(shell).not.toContain("w-[min(70%,720px)]")
  })
})

describe("C2 — visite : volant unique (310 images), panneau compact et lisible", () => {
  it("310 images, arrêts 7…279 inchangés, volant et choix final sur l'image 310", () => {
    expect(VISIT_FRAME_COUNT).toBe(310)
    expect(VISIT_STOPS.map((s) => s.frame)).toEqual([7, 31, 61, 91, 133, 168, 217, 257, 279, 310, 310])
    expect(VISIT_STOPS[9].zone).toBe("leather")
    expect(VISIT_STOPS[10].zone).toBeNull()
  })

  it("les 310 fichiers pc/tel existent, pas d'image 311", () => {
    for (const set of ["pc", "tel"] as const) {
      for (let n = 1; n <= 310; n++) expect(existsSync(path.join(ROOT, "public", visitFrameSrc(set, n))), `${set} ${n}`).toBe(true)
      expect(existsSync(path.join(ROOT, "public", visitFrameSrc(set, 311)))).toBe(false)
    }
  })

  it("téléphone : panneau ≤ 30 % de la hauteur, formules sur une ligne tronquée ; plus d'apparition en fondu", () => {
    const css = read(`${CLZ}/visit-video.css`)
    const mobile = css.slice(css.indexOf("@media (max-width:760px){"))
    expect(mobile).toMatch(/\.v3-card\{[^}]*max-height:30svh[^}]*overflow-y:auto/)
    expect(mobile).toMatch(/\.v3-list li span\{[^}]*text-overflow:ellipsis/)
    expect(css).not.toMatch(/v3in/)
  })

  it("un seul bouton par zone ; « Voir la formule » et « Voir la prestation en vidéo » en liens discrets", () => {
    const src = read(`${CLZ}/visit-video.tsx`)
    const card = src.slice(src.indexOf('<article key={zone ?? "none"}'), src.indexOf("</article>"))
    expect(card.match(/clz-btn/g)).toEqual(["clz-btn", "clz-btn"]) // « clz-btn clz-btn-primary », une seule fois
    expect(card).toMatch(/className="v3-link"[^>]*>\s*▶ Voir la prestation en vidéo/)
    expect(card).toMatch(/className="v3-link" href=\{JOURNEY_FORMULAS\[best\]\.href\}/)
  })
})

describe("C2b — films : bloc compact sur téléphone, mêmes textes, prix et liens", () => {
  it("téléphone : le bloc texte occupe au plus 40 % de la hauteur", () => {
    const css = read(`${CLZ}/prestations-film.css`)
    const mobile = css.slice(css.indexOf("@media (max-width: 860px)"))
    expect(mobile).toMatch(/\.clz-film-cards \{[^}]*height: 40%/)
    expect(mobile).toMatch(/\.clz-film-text \{[^}]*-webkit-line-clamp: 2/)
  })

  it("rendu : chaque étape garde son titre, son bouton, ses formules avec détail et prix", () => {
    const h = html(createElement(PrestationsFilm))
    for (const s of FILM_SEQUENCES) expect(h).toContain(`href="${s.action.href}"`)
    expect(h.match(/class="clz-film-card[ "]/g)).toHaveLength(FILM_SEQUENCES.length)
    const rows = h.match(/class="clz-film-row"/g)?.length ?? 0
    expect(rows).toBeGreaterThan(0)
    expect(h.match(/<small>/g)).toHaveLength(rows)
    expect(h).toMatch(/class="clz-film-price">\d+ €/)
  })
})

describe("C3 — note Google une seule fois dans le haut de page", () => {
  it("retirée de la 2e section, présente dans le header", () => {
    expect(html(createElement(ClzPresentation))).not.toMatch(/avis Google/)
    expect(html(createElement(CleanyzerHero)).match(/avis Google/g)).toHaveLength(1)
  })
})

describe("C4 — réservation : retour au site, barre flottante absente", () => {
  const shell = (pathname: string) => {
    nav.pathname = pathname
    return html(createElement(CleanyzerShell, { navItems: CLZ_SITE_NAV_ITEMS, contact: { phone: "06", phoneRaw: "+33600000000", email: null }, children: "x" }))
  }

  it("barre flottante absente sur /reservation, présente ailleurs", () => {
    expect(shell("/p/cleanyzer/reservation")).not.toContain("clz-neon-dock")
    expect(shell("/reservation")).not.toContain("clz-neon-dock")
    expect(shell("/p/cleanyzer")).toContain("clz-neon-dock")
    expect(shell("/prestations/nettoyage-interieur-voiture-annecy")).toContain("clz-neon-dock")
  })

  it("lien retour : page d'origine si elle est sur le site, sinon l'accueil (pas de redirection ouverte)", () => {
    const o = "https://www.cleanyzer.fr"
    expect(clzBackHref(`${o}/prestations/x?a=1#b`, o, "")).toBe("/prestations/x?a=1#b")
    expect(clzBackHref(`${o}/`, o, "")).toBe("/")
    expect(clzBackHref("https://evil.example/prestations/x", o, "")).toBe("/")
    expect(clzBackHref(`${o}/reservation?service=144`, o, "")).toBe("/")
    expect(clzBackHref("", o, "")).toBe("/")
    expect(clzBackHref("pas une url", o, "")).toBe("/")
    expect(clzBackHref("javascript:alert(1)", o, "")).toBe("/")
    // Preview / detailflow.fr : seules les pages sous /p/cleanyzer sont « le site ».
    const d = "https://www.detailflow.fr"
    expect(clzBackHref(`${d}/p/cleanyzer/prestations/x`, d, "/p/cleanyzer")).toBe("/p/cleanyzer/prestations/x")
    expect(clzBackHref(`${d}/p/cleanyzer`, d, "/p/cleanyzer")).toBe("/p/cleanyzer")
    expect(clzBackHref(`${d}/tarifs`, d, "/p/cleanyzer")).toBe("/p/cleanyzer")
    expect(clzBackHref(`${d}/p/cleanyzer-autre/x`, d, "/p/cleanyzer")).toBe("/p/cleanyzer")
    expect(clzBackHref(`${d}/p/cleanyzer/reservation`, d, "/p/cleanyzer")).toBe("/p/cleanyzer")
  })

  it("le lien n'est monté que pour Cleanyzer hors widget ; les autres tenants gardent le même rendu", () => {
    expect(clzBookingNeon("cleanyzer", true)).toBe(false)
    expect(clzBookingNeon("spirit-acs", false)).toBe(false)
    expect(clzBookingNeon(null, false)).toBe(false)
    const page = read("app/(site)/reservation/page.tsx")
    expect(page).toContain("{neon && <ClzBookingBackLink />}")
    expect(page).toContain("const neon = clzBookingNeon(requestTenant?.customSiteKey, isEmbed)")
    expect(page).toMatch(/return booking\n/)
  })

  it("demande et pages légales : coquille néon décidée côté serveur, rendu inchangé hors Cleanyzer", () => {
    const helper = read(`${CLZ}/neon-page.tsx`)
    expect(helper).toContain("if (!clzBookingNeon((await resolveCustomSite())?.key, false)) return page")
    for (const p of ["demande", "mentions-legales", "cgv", "confidentialite"]) {
      const src = read(`app/(site)/${p}/page.tsx`)
      expect(src.match(/return clzNeonPage\(/g), p).toHaveLength(1)
      expect(src, p).not.toMatch(/customSiteKey\?\.trim\(\) === "cleanyzer"/)
    }
  })
})

describe("C5 — liens internes sans /p/cleanyzer en production", () => {
  it("base décidée par l'hôte : racine sur le domaine Cleanyzer, /p/cleanyzer ailleurs", () => {
    for (const h of ["www.cleanyzer.fr", "cleanyzer.fr", "WWW.Cleanyzer.fr:443"]) expect(clzBaseForHost(h), h).toBe("")
    for (const h of ["x.vercel.app", "localhost:3000", "autre-tenant.fr", "", null, undefined]) {
      expect(clzBaseForHost(h), String(h)).toBe("/p/cleanyzer")
    }
    expect(clzHref("/p/cleanyzer/reservation", "")).toBe("/reservation")
    expect(clzHref("/p/cleanyzer", "")).toBe("/")
    expect(clzHref("/p/cleanyzer-autre/x", "")).toBe("/p/cleanyzer-autre/x")
  })

  it("chemins : accueil « / », pages à la racine, ancres « /#id »", () => {
    expect(clzPath("/", "")).toBe("/")
    expect(clzPath("/reservation", "")).toBe("/reservation")
    expect(clzPath("prestations/x", "")).toBe("/prestations/x")
    expect(`${clzPath("/", "")}#faq`).toBe("/#faq")
    // Hors production (tests) : comportement historique.
    expect(CLZ_HOME_HREF).toBe("/p/cleanyzer")
    expect(clzPath("/prestations/x")).toBe("/p/cleanyzer/prestations/x")
    expect(CLZ_BOOKING_HREF).toBe(clzPath("/reservation"))
  })
})
