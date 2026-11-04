import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

/**
 * L37 — DA nuit néon sur tout le site Cleanyzer, en-tête de la maquette, habillage réservation/devis
 * (sans toucher à BookingV2), pilule de contact, correctif `intro.pause()`, barre MAQUETTE réservée
 * à /cleanyzer-preview.
 */

vi.mock("next/font/google", () => ({
  Fraunces: () => ({ className: "f", variable: "--font-clz-display" }),
  Inter: () => ({ className: "i", variable: "--font-clz-sans" }),
}))
vi.mock("next/navigation", () => ({ usePathname: () => "/p/cleanyzer" }))

import { CleanyzerShell } from "@/components/custom-sites/cleanyzer/site-shell"
import { CLZ_SITE_NAV_ITEMS } from "@/components/custom-sites/cleanyzer/nav"
import { CLZ_BOOKING_HREF, CLZ_DEMANDE_HREF, CLZ_HOME_HREF } from "@/components/custom-sites/cleanyzer/tokens"
import { clzAppThemeClass } from "@/components/custom-sites/cleanyzer/app-theme"
import { runHeroSequence } from "@/components/custom-sites/cleanyzer/hero"

const ROOT = process.cwd()
const CLZ = "components/custom-sites/cleanyzer"
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8")
const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of readdirSync(path.join(ROOT, dir))) {
    const f = path.join(dir, e)
    if (statSync(path.join(ROOT, f)).isDirectory()) walk(f, out)
    else out.push(f)
  }
  return out
}

/** Valeur d'un jeton CSS dans le premier bloc `selector { … }` qui le définit. */
function token(css: string, selector: string, name: string): string {
  const re = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`, "g")
  for (const m of css.matchAll(re)) {
    const v = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(m[1])
    if (v) return v[1].trim()
  }
  throw new Error(`jeton ${name} absent de ${selector}`)
}

/** Couleur CSS (#rgb, #rrggbb, rgba()) → [r, g, b, a]. */
function parseColor(c: string): [number, number, number, number] {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c)
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((x) => x + x).join("") : hex[1]
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(1) as [number, number, number, number]
  }
  const rgba = /^rgba?\(([^)]+)\)$/.exec(c)
  if (rgba) {
    const [r, g, b, a = "1"] = rgba[1].split(/[,\s/]+/).filter(Boolean)
    return [Number(r), Number(g), Number(b), Number(a)]
  }
  throw new Error(`couleur illisible : ${c}`)
}
const over = (fg: string, bg: string): [number, number, number] => {
  const [r, g, b, a] = parseColor(fg)
  const [R, G, B] = parseColor(bg)
  return [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a)]
}
const lum = ([r, g, b]: number[]) => {
  const lin = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
const contrast = (fg: string, bg: string) => {
  const L1 = lum(over(fg, bg))
  const L2 = lum(parseColor(bg).slice(0, 3))
  return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)
}

const css = read(`${CLZ}/cleanyzer.css`)
const appCss = read(`${CLZ}/app-theme.css`)

describe("C1 — DA nuit sur tout le site", () => {
  it("jetons de base de .cleanyzer aux valeurs sombres de la maquette", () => {
    expect(token(css, ".cleanyzer", "--clz-bg")).toBe("#04050a")
    expect(token(css, ".cleanyzer", "--clz-surface")).toBe("#0a0c14")
    expect(token(css, ".cleanyzer", "--clz-surface-2")).toBe("#0a0c14")
    expect(token(css, ".cleanyzer", "--clz-fg")).toBe("#f2f4fa")
    expect(token(css, ".cleanyzer", "--clz-muted")).toBe("rgba(226, 232, 245, 0.66)")
    expect(token(css, ".cleanyzer", "--clz-line")).toBe("rgba(160, 180, 255, 0.14)")
    expect(token(css, ".cleanyzer", "color-scheme")).toBe("dark")
  })

  it("plus aucun fond clair en dur dans les composants du site (hors barre MAQUETTE)", () => {
    const files = walk(CLZ).filter((f) => /\.(tsx|ts)$/.test(f) && !f.endsWith("preview-nav.tsx"))
    const offenders = files.flatMap((f) =>
      [...read(f).matchAll(/\bbg-(white|gray-\d+|slate-\d+|neutral-\d+|zinc-\d+)(?![\w/-]*\/(?:[1-3]?\d)\b)/g)].map((m) => `${f}: ${m[0]}`),
    )
    expect(offenders).toEqual([])
    for (const f of walk(CLZ).filter((x) => x.endsWith(".css"))) {
      expect(read(f), f).not.toMatch(/background(?:-color)?\s*:\s*(#fff\b|#ffffff\b|white\b)/i)
    }
  })
})

describe("C4 — contraste AA (≥ 4,5:1) sur les jetons", () => {
  const bg = token(css, ".cleanyzer", "--clz-bg")
  const surface = token(css, ".cleanyzer", "--clz-surface")
  it.each([
    ["texte / fond", "--clz-fg", bg],
    ["texte / surface", "--clz-fg", surface],
    ["texte secondaire / fond", "--clz-muted", bg],
    ["texte secondaire / surface", "--clz-muted", surface],
  ])("%s", (_l, name, back) => {
    expect(contrast(token(css, ".cleanyzer", name), back)).toBeGreaterThanOrEqual(4.5)
  })

  it("texte blanc sur les boutons principaux (fond bleu des boutons, dégradé de la pilule)", () => {
    expect(contrast("#ffffff", token(css, ".cleanyzer", "--clz-btn-blue"))).toBeGreaterThanOrEqual(4.5)
    const dock = /\.clz-neon-dock-book\s*\{[^}]*linear-gradient\(([^)]*)\)/.exec(css)![1]
    const stops = [...dock.matchAll(/#[0-9a-f]{6}/gi)].map((m) => m[0])
    expect(stops.length).toBeGreaterThanOrEqual(3)
    for (const s of stops) expect(contrast("#ffffff", s), s).toBeGreaterThanOrEqual(4.5)
  })

  it("réservation / devis : jetons standard redéfinis lisibles", () => {
    const b = token(appCss, ".clz-app-theme", "--background")
    expect(contrast(token(appCss, ".clz-app-theme", "--foreground"), b)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(token(appCss, ".clz-app-theme", "--muted-foreground"), b)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(token(appCss, ".clz-app-theme", "--card-foreground"), token(appCss, ".clz-app-theme", "--card"))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(token(appCss, ".clz-app-theme", "--primary-foreground"), token(appCss, ".clz-app-theme", "--primary"))).toBeGreaterThanOrEqual(4.5)
  })
})

describe("C2 — en-tête de la maquette", () => {
  const h = renderToStaticMarkup(createElement(CleanyzerShell, { navItems: CLZ_SITE_NAV_ITEMS, immersive: true, contact: null, children: null }))
  const header = h.slice(h.indexOf("<header"), h.indexOf("</header>"))
  const desktopNav = /<nav[^>]*aria-label="Navigation principale"[^>]*>([\s\S]*?)<\/nav>/.exec(header)![1]
  const text = (s: string) => s.replace(/<[^>]+>/g, "|").split("|").map((x) => x.trim()).filter(Boolean)

  it("liens : Prestations · Réalisations · À propos · Zone (FAQ hors en-tête)", () => {
    expect(text(desktopNav)).toEqual(["Prestations", "Réalisations", "À propos", "Zone"])
  })

  it("à droite : « Devis » → demande personnalisée, « Réserver » → BookingV2", () => {
    expect(header).toMatch(new RegExp(`href="${CLZ_DEMANDE_HREF}"[^>]*>Devis<`))
    expect(header).toMatch(new RegExp(`href="${CLZ_BOOKING_HREF}"[^>]*>Réserver<`))
  })

  it("une seule ligne dès 1100 px, burger en dessous", () => {
    expect(header).toMatch(/whitespace-nowrap/)
    expect(header).toMatch(/min-\[1100px\]:flex/)
    expect(header).toMatch(/min-\[1100px\]:hidden/)
    expect(header).not.toMatch(/\blg:(flex|hidden)\b/)
  })

  it("FAQ reste dans le pied de page", () => {
    const footer = h.slice(h.indexOf("<footer"))
    expect(footer).toContain("Questions fréquentes")
  })

  it("burger : tous les liens dont FAQ et Devis (source du menu mobile)", () => {
    const shell = read(`${CLZ}/site-shell.tsx`)
    const mobile = shell.slice(shell.indexOf('aria-label="Navigation mobile"'))
    expect(mobile).toMatch(/navItems\.map/)
    expect(mobile).toMatch(/>\s*Devis\s*</)
  })
})

describe("liens de navigation publique", () => {
  it("chaque lien vise une section réellement présente sur l'accueil (plus de #apropos cassé)", () => {
    const sources = walk(CLZ).filter((f) => f.endsWith(".tsx")).map(read).join("\n")
    for (const item of CLZ_SITE_NAV_ITEMS) {
      const href = item.href ?? ""
      expect(href.startsWith(`${CLZ_HOME_HREF}#`), item.label).toBe(true)
      const anchor = href.split("#")[1]
      expect(sources, `#${anchor}`).toMatch(new RegExp(`id=(?:"${anchor}"|\\{[^}]*"${anchor}"[^}]*\\})|id: "${anchor}"`))
    }
    expect(CLZ_SITE_NAV_ITEMS.find((i) => i.label === "À propos")?.href).toBe(`${CLZ_HOME_HREF}#presentation`)
  })
})

describe("réservation et devis : habillage réservé à Cleanyzer, sans toucher à BookingV2", () => {
  it("classe seulement pour le site sur mesure Cleanyzer résolu côté serveur", () => {
    expect(clzAppThemeClass("cleanyzer")).toBe("clz-app-theme")
    for (const other of [null, undefined, "", "spirit-acs", "rozan", "CLEANYZER "]) expect(clzAppThemeClass(other)).toBeUndefined()
  })

  it("le layout la calcule depuis resolveCustomSite(), jamais depuis l'URL ou le navigateur", () => {
    const layout = read("app/(site)/layout.tsx")
    expect(layout).toContain("clzAppThemeClass(customSite?.key)")
    expect(layout).toMatch(/const customSite = await resolveCustomSite\(\)/)
    const line = layout.split("\n").find((l) => l.includes("clzAppThemeClass("))!
    expect(line).not.toMatch(/searchParams|headers\(|pathname|params/)
    expect(layout).toContain('import "@/components/custom-sites/cleanyzer/app-theme.css"')
  })
})

describe("pilule de contact (style de la maquette, L35)", () => {
  it("Réserver en dégradé bleu → violet → rouge, Appeler / WhatsApp en contour, fond nuit translucide flouté", () => {
    expect(css).toMatch(/\.clz-neon-dock\s*\{[^}]*background:\s*rgba\(4,\s*5,\s*10,\s*\.62\)[^}]*backdrop-filter:\s*blur\(10px\)/)
    expect(css).toMatch(/\.clz-neon-dock-book\s*\{[^}]*linear-gradient\(120deg,[^)]*#6a3cff 55%/)
    expect(css).toMatch(/\.clz-neon-dock-ghost\s*\{[^}]*border:\s*1px solid rgba\(255,\s*255,\s*255,\s*\.14\)[^}]*background:\s*transparent/)
  })
})

describe("correctif L35 : la boucle met l'arrivée en pause", () => {
  it("arrivée en erreur → mise en pause, plus de téléchargement inutile", async () => {
    class V extends EventTarget {
      currentTime = 0
      duration = NaN
      paused = 0
      play() {
        return Promise.resolve()
      }
      pause() {
        this.paused++
      }
    }
    const intro = new V(), loop = new V()
    runHeroSequence(intro as never, loop as never, () => {}, { raf: (cb) => (cb(0), 0) })
    intro.dispatchEvent(new Event("error"))
    await new Promise((r) => setTimeout(r, 0))
    expect(intro.paused).toBe(1)
    expect(loop.paused).toBe(0)
  })
})

describe("barre MAQUETTE réservée à /cleanyzer-preview", () => {
  it("preview-nav n'est importé que par app/cleanyzer-preview", () => {
    const importers = [...walk(CLZ), ...walk("app")]
      .filter((f) => /\.(tsx|ts)$/.test(f) && !f.endsWith("preview-nav.tsx"))
      .filter((f) => /from\s+["'](?:[^"']*cleanyzer\/|\.\/)preview-nav["']/.test(read(f)))
    expect(importers.length).toBeGreaterThan(0)
    for (const f of importers) expect(f.startsWith(path.join("app", "cleanyzer-preview")), f).toBe(true)
  })
})
