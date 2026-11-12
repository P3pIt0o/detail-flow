import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { clzBookingNeon } from "@/components/custom-sites/cleanyzer/tokens"

/** L55 — /reservation aux couleurs néon : Cleanyzer seulement, jamais en widget. */

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8")

describe("L55 — thème néon de la réservation", () => {
  it("appliqué seulement au site Cleanyzer publié, hors widget", () => {
    expect(clzBookingNeon("cleanyzer", false)).toBe(true)
    expect(clzBookingNeon(" cleanyzer ", false)).toBe(true)
    expect(clzBookingNeon("cleanyzer", true)).toBe(false)
    expect(clzBookingNeon("spirit-acs", false)).toBe(false)
    expect(clzBookingNeon("rozan", false)).toBe(false)
    expect(clzBookingNeon(null, false)).toBe(false)
    expect(clzBookingNeon(undefined, false)).toBe(false)
    expect(clzBookingNeon("", false)).toBe(false)
  })

  it("la page décide à partir du customSiteKey du tenant résolu côté serveur, pas d'un paramètre client", () => {
    const page = read("app/(site)/reservation/page.tsx")
    expect(page).toContain("clzBookingNeon(requestTenant?.customSiteKey, isEmbed)")
    expect(page).toContain('<div className="clz-booking-neon">{booking}</div>')
    // Les autres tenants reçoivent exactement le même rendu qu'avant.
    expect(page).toMatch(/return booking\n/)
  })

  it("variables du thème néon de la fiche, portées par le seul conteneur .clz-booking-neon", () => {
    const css = read("components/custom-sites/cleanyzer/cleanyzer.css")
    const block = css.slice(css.indexOf(".cleanyzer .clz-booking-neon {"), css.indexOf("}", css.indexOf(".cleanyzer .clz-booking-neon {")))
    for (const v of ["--background: var(--clz-neon-ink)", "--foreground: var(--clz-neon-fg)", "--primary: var(--clz-neon-blue)", "--border: var(--clz-neon-line)", "--muted-foreground: var(--clz-neon-muted)", "--destructive: var(--clz-neon-red)"])
      expect(block).toContain(v)
    expect(css).toMatch(/--clz-neon-ink: #04050a/)
    expect(css).toMatch(/--clz-neon-blue: #1f7bff/)
  })

  it("contraste AA du texte des boutons bleus (texte sombre sur #1f7bff)", () => {
    const lum = (hex: string) => {
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    }
    const ratio = (a: string, b: string) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
      return (x + 0.05) / (y + 0.05)
    }
    expect(ratio("#04050a", "#1f7bff")).toBeGreaterThanOrEqual(4.5)
    expect(ratio("#f2f4fa", "#04050a")).toBeGreaterThanOrEqual(4.5)
    expect(ratio("#1f7bff", "#04050a")).toBeGreaterThanOrEqual(4.5)
    // Étape active rouge : chiffre sombre sur #ff2b45.
    expect(ratio("#04050a", "#ff2b45")).toBeGreaterThanOrEqual(4.5)
  })

  it("néon accentué (ajout 3) : halos, progression bleue/rouge, lueurs de fond, liseré — limité à .clz-booking-neon, coupé si mouvement réduit", () => {
    const css = read("components/custom-sites/cleanyzer/cleanyzer.css")
    const start = css.indexOf("/* ---------- Réservation : néon accentué")
    const end = css.indexOf("/* ---------- Pilule de contact")
    expect(start).toBeGreaterThan(-1)
    const accent = css.slice(start, end)
    // Toute règle du bloc reste dans le conteneur Cleanyzer.
    for (const rule of accent.match(/^[^/@\s}][^{]*\{/gm) ?? []) expect(rule).toContain(".clz-booking-neon")
    expect(accent).toMatch(/\[aria-pressed="true"\]/) // carte sélectionnée
    expect(accent).toMatch(/\[aria-checked="true"\]/)
    expect(accent).toMatch(/--success: var\(--clz-neon-blue\)/) // progression bleue
    expect(accent).toMatch(/span\.bg-primary[^{]*\{[^}]*var\(--clz-neon-red\)/) // étape active rouge
    expect(accent).toMatch(/::before[^{]*\{[^}]*filter: blur/) // lueurs floues
    expect(accent).toMatch(/::after/)
    expect(accent).toMatch(/@media \(prefers-reduced-motion: reduce\)[^@]*clz-booking-neon[^}]*animation: none/)
  })
})
