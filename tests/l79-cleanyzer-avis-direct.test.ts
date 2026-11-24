import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { getClzGoogleProof, pickGoogleProof, CLZ_GOOGLE_PROOF_FALLBACK } from "@/components/custom-sites/cleanyzer/google-proof"
import { CleanyzerHero } from "@/components/custom-sites/cleanyzer/hero"

const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const FALLBACK = { rating: 5, reviewCount: 96 }

describe("L79 — preuve Google en direct", () => {
  it("le repli vaut 5,0 et 96", () => {
    expect(CLZ_GOOGLE_PROOF_FALLBACK).toEqual(FALLBACK)
  })

  it("Google disponible (note + nombre) → valeurs Google", async () => {
    const p = await getClzGoogleProof(7, async () => ({ rating: 4.9, reviewCount: 120 }))
    expect(p).toEqual({ rating: 4.9, reviewCount: 120 })
  })

  it("Google absent, null, établissement non relié ou exception → repli", async () => {
    expect(await getClzGoogleProof(7, async () => null)).toEqual(FALLBACK)
    expect(await getClzGoogleProof(7, async () => undefined)).toEqual(FALLBACK)
    expect(
      await getClzGoogleProof(7, async () => {
        throw new Error("Google HS")
      }),
    ).toEqual(FALLBACK)
    expect(await getClzGoogleProof(undefined, async () => ({ rating: 4, reviewCount: 10 }))).toEqual(FALLBACK)
  })

  it("note sans nombre (ou nombre invalide) → repli complet, jamais de mélange", () => {
    expect(pickGoogleProof({ rating: 4.8, reviewCount: null })).toEqual(FALLBACK)
    expect(pickGoogleProof({ rating: 4.8 })).toEqual(FALLBACK)
    expect(pickGoogleProof({ rating: 4.8, reviewCount: 0 })).toEqual(FALLBACK)
    expect(pickGoogleProof({ rating: Number.NaN, reviewCount: 50 })).toEqual(FALLBACK)
  })

  it("le hero affiche les valeurs reçues en props, et le repli par défaut", () => {
    const live = renderToStaticMarkup(createElement(CleanyzerHero as never, { rating: 4.9, reviewCount: 120 }))
    expect(live).toMatch(/4,9<\/b> · 120 avis Google/)
    expect(renderToStaticMarkup(createElement(CleanyzerHero))).toMatch(/5,0<\/b> · 96 avis Google/)
  })

  it("le hero ne fait aucun appel Google depuis le navigateur", () => {
    const hero = read("components/custom-sites/cleanyzer/hero.tsx")
    expect(hero).not.toMatch(/\bfetch\(/)
    expect(hero).not.toMatch(/lib\/reviews|google-proof/)
  })

  it("home-page lit la valeur côté serveur avec l'id du tenant résolu", () => {
    const home = read("components/custom-sites/cleanyzer/home-page.tsx")
    expect(home).toContain("getClzGoogleProof(data?.tenant.id)")
    expect(home).toMatch(/<CleanyzerHero rating=\{proof\.rating\} reviewCount=\{proof\.reviewCount\} \/>/)
  })

  it("getTenantGoogleRating expose reviewCount ; Spirit ACS non modifié", () => {
    const pub = read("lib/reviews/public.ts")
    expect(pub).toMatch(/reviewCount: number \| null/)
    expect(pub).toContain("userRatingCount")
    expect(read("components/custom-sites/spirit-acs/home-page.tsx")).toMatch(
      /getTenantGoogleRating\(data\.tenant\.id,\s*\{\s*languageCode:\s*"fr"\s*\}\)/,
    )
  })
})
