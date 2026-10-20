import { describe, expect, it } from "vitest"
import { allocate, percentOf } from "@/lib/booking/promotions"

const sum = (r: Record<string, number>) => Object.values(r).reduce((s, v) => s + v, 0)

describe("percentOf — points de base, arrondi à l'inférieur", () => {
  it("10 % de 145 € = 14,50 €", () => expect(percentOf(14500, 1000)).toBe(1450))
  it("arrondi inférieur au centime", () => expect(percentOf(1999, 1000)).toBe(199))
  it("0,01 % minimum", () => expect(percentOf(100000, 1)).toBe(10))
  it("montant nul ou négatif → 0", () => {
    expect(percentOf(0, 1000)).toBe(0)
    expect(percentOf(-500, 1000)).toBe(0)
  })
})

describe("allocate — ventilation exacte au centime", () => {
  it("somme exacte, proportionnelle", () => {
    const r = allocate(1500, [{ key: "a", cents: 8000 }, { key: "b", cents: 3000 }])
    expect(sum(r)).toBe(1500)
    expect(r.a).toBe(1091)
    expect(r.b).toBe(409)
  })
  it("jamais plus que le poids d'un élément ni que la somme des poids", () => {
    const r = allocate(99999, [{ key: "a", cents: 100 }, { key: "b", cents: 50 }])
    expect(r).toEqual({ a: 100, b: 50 })
  })
  it("total nul ou poids nuls → rien", () => {
    expect(allocate(0, [{ key: "a", cents: 100 }])).toEqual({})
    expect(allocate(100, [{ key: "a", cents: 0 }])).toEqual({})
  })
  it("déterministe et somme exacte sur des parts égales", () => {
    const w = [{ key: "a", cents: 1 }, { key: "b", cents: 1 }, { key: "c", cents: 1 }]
    expect(allocate(2, w)).toEqual({ a: 1, b: 1, c: 0 })
    expect(allocate(2, w)).toEqual(allocate(2, w))
  })
  it("cas aléatoires : somme = min(total, Σ poids), chaque part ≤ poids", () => {
    let seed = 42
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed % n)
    for (let i = 0; i < 300; i++) {
      const w = Array.from({ length: 1 + rnd(6) }, (_, k) => ({ key: `k${k}`, cents: rnd(20000) }))
      const total = rnd(60000)
      const r = allocate(total, w)
      expect(sum(r)).toBe(Math.min(total, w.reduce((s, x) => s + x.cents, 0)))
      for (const x of w) expect((r[x.key] ?? 0) <= x.cents).toBe(true)
    }
  })
})
