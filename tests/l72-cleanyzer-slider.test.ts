/**
 * L72 — Cleanyzer : slider « Avant / Après » de l'accueil = RS3 puis les 5 vraies paires de Tom.
 */
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  AVANT_APRES_PAIRS,
  PAIRS,
  RS3_PAIR,
  TOM_PAIRS,
  pairSrc,
} from "@/components/custom-sites/cleanyzer/realisations-tom"

const ROOT = process.cwd()
const SRC = readFileSync(path.join(ROOT, "components/custom-sites/cleanyzer/realisations-tom.tsx"), "utf8")

describe("L72 — slider avant / après de l'accueil Cleanyzer", () => {
  it("6 diapositives : RS3 en premier puis les 5 paires de Tom dans l'ordre de la fiche", () => {
    expect(AVANT_APRES_PAIRS).toHaveLength(6)
    expect(AVANT_APRES_PAIRS[0]).toBe(RS3_PAIR)
    expect(AVANT_APRES_PAIRS.slice(1)).toEqual(TOM_PAIRS)
    expect(TOM_PAIRS.map((p) => p.title)).toEqual([
      "Compartiment moteur",
      "Sièges en tissu : taches",
      "Rénovation des optiques",
      "Habitacle complet",
      "Utilitaire professionnel",
    ])
  })

  it("chaque paire de Tom a une image avant ET après .webp présentes sur disque", () => {
    const names = ["moteur", "sieges-tissu", "optiques", "habitacle-beige", "utilitaire"]
    TOM_PAIRS.forEach((p, i) => {
      expect(pairSrc(p.before)).toBe(`/custom-sites/cleanyzer/avant-apres/${names[i]}-avant.webp`)
      expect(pairSrc(p.after)).toBe(`/custom-sites/cleanyzer/avant-apres/${names[i]}-apres.webp`)
      for (const f of [p.before, p.after]) expect(existsSync(path.join(ROOT, "public", pairSrc(f)))).toBe(true)
    })
  })

  it("textes alternatifs non vides et tous distincts", () => {
    const alts = AVANT_APRES_PAIRS.flatMap((p) => [p.altBefore, p.altAfter])
    for (const a of alts) expect(a.trim().length).toBeGreaterThan(10)
    expect(new Set(alts).size).toBe(alts.length)
  })

  it("aucun prix, aucune marque, aucune mention d'IA dans les paires de Tom", () => {
    const text = TOM_PAIRS.flatMap((p) => [p.title, p.detail, p.altBefore, p.altAfter]).join(" ")
    expect(text).not.toMatch(/€|\d+\s*euros?/i)
    expect(text).not.toMatch(/peugeot|bmw|ford|mustang|renault|kangoo|audi|porsche|mercedes/i)
    expect(text).not.toMatch(/\bIA\b|claude|intelligence artificielle/i)
    for (const p of TOM_PAIRS) {
      expect(p.detail).toBe("")
      expect(p.link).toBeUndefined()
    }
  })

  it("le paragraphe de détail n'est pas rendu quand il est vide", () => {
    expect(SRC).toMatch(/\{pair\.detail && <p/)
  })

  it("pages prestations : PAIRS inchangé ; ISUZU et anciennes paires absentes de l'accueil", () => {
    expect(PAIRS.map((p) => p.before)).toEqual(["phare-avant-1", "phare-avant-2", "siege-avant"])
    const befores = AVANT_APRES_PAIRS.map((p) => p.before)
    for (const old of ["phare-avant-1", "phare-avant-2", "siege-avant", "/custom-sites/cleanyzer/isuzu-avant.webp"]) {
      expect(befores).not.toContain(old)
    }
  })
})
