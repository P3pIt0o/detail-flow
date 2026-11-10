import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

/**
 * L38 — Cleanyzer : la visite 3D devient une visite en 6 chapitres vidéo. Rendu serveur réel ;
 * seules les polices next/font et la navigation sont simulées.
 */

vi.mock("next/font/google", () => ({
  Fraunces: () => ({ className: "f", variable: "--font-clz-display" }),
  Inter: () => ({ className: "i", variable: "--font-clz-sans" }),
}))
vi.mock("next/navigation", () => ({ usePathname: () => "/p/cleanyzer" }))

import {
  CLZ_VISIT_CHAPTERS,
  ClzVisitVideo,
  chapterForZone,
  playingChapter,
  visitVideoSrc,
} from "@/components/custom-sites/cleanyzer/visit-video"
import { PrestationsFilm } from "@/components/custom-sites/cleanyzer/prestations-film"
import { JOURNEY_FORMULAS, JOURNEY_ZONES, ZONE_KEYS, zoneAction, type FormulaRef } from "@/components/custom-sites/cleanyzer/journey"
import { VEHICLES } from "@/components/custom-sites/cleanyzer/content"

const ROOT = process.cwd()
const CLZ = "components/custom-sites/cleanyzer"
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8")
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(el).replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"')
const text = (h: string) => h.replace(/<[^>]+>/g, " ")
const publicFile = (src: string) => existsSync(path.join(ROOT, "public", src))
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const h = html(createElement(ClzVisitVideo))

describe("C1 — rendu de la visite en vidéo", () => {
  it("section à l'ancre inchangée, textes exacts", () => {
    expect(h).toMatch(/<section[^>]*id="visite-3d"/)
    expect(h).toContain(">Visite en vidéo<")
    expect(text(h).replace(/\s+/g, " ")).toContain("Choisissez votre formule, zone par zone.")
    expect(h).toMatch(/<em>zone par zone\.<\/em>/)
    expect(h).toContain("Regardez le travail sur chaque zone et découvrez ce que comprend chaque prestation.")
  })

  it("6 chapitres dans l'ordre, en onglets accessibles", () => {
    const labels = ["Habitacle", "Carrosserie", "Jantes", "Optiques", "Moteur", "Choisir ma formule"]
    expect(CLZ_VISIT_CHAPTERS.map((c) => c.label)).toEqual(labels)
    expect(CLZ_VISIT_CHAPTERS.map((c) => c.zones)).toEqual([["vents", "seats", "leather", "mats"], ["body"], ["rims"], ["optics"], ["engine"], []])
    expect(h).toMatch(/role="tablist"/)
    const tabs = [...h.matchAll(/<button[^>]*role="tab"[^>]*>([^<]*)</g)].map((m) => m[1])
    expect(tabs).toEqual(labels)
    expect((h.match(/aria-selected="true"/g) ?? []).length).toBe(1)
    expect((h.match(/role="tabpanel"/g) ?? []).length).toBe(6)
  })

  it("les 8 zones sont couvertes, chacune une seule fois", () => {
    const all = CLZ_VISIT_CHAPTERS.flatMap((c) => c.zones)
    expect([...all].sort()).toEqual([...ZONE_KEYS].sort())
  })

  it("panneaux : textes de JOURNEY_ZONES (formules, options et prix)", () => {
    for (const k of ZONE_KEYS) {
      const z = JOURNEY_ZONES[k]
      expect(h).toContain(z.title)
      for (const t of Object.values(z.formulas)) expect(h).toContain(t)
      for (const o of z.options) expect(h).toContain(`${o.label} · ${o.price}`)
      if (z.description) expect(h).toContain(z.description)
    }
  })

  it("boutons : zoneAction (optiques → page rénovation, moteur → demande, habitacle → réserver)", () => {
    for (const k of ["optics", "engine", "body", "rims", "vents"] as const) {
      const a = zoneAction(k)
      expect(h).toMatch(new RegExp(`href="${esc(a.href)}"[^>]*>${a.label}`))
    }
    expect(zoneAction("optics").label).toBe("Découvrir la rénovation des phares")
    expect(zoneAction("engine").label).toBe("Faire une demande")
  })

  it("Choisir ma formule : formules groupées, prix de JOURNEY_FORMULAS (1er véhicule), Diamond sur devis", () => {
    for (const g of ["Intérieur", "Extérieur", "Sur mesure"]) expect(h).toContain(`>${g}<`)
    const veh = VEHICLES[0].key
    for (const k of Object.keys(JOURNEY_FORMULAS) as FormulaRef[]) {
      const F = JOURNEY_FORMULAS[k]
      const p = F.formula.prices[veh]
      expect(h).toContain(p == null ? "Sur devis" : `${p} €`)
      expect(h).toMatch(new RegExp(`href="${esc(F.action.href)}"[^>]*>${F.action.label}`))
      if (F.note) expect(h).toContain(F.note)
    }
    for (const v of VEHICLES) expect(h).toContain(`>${v.label}<`)
  })

  it("aucun prix en dur dans le composant", () => {
    const src = read(`${CLZ}/visit-video.tsx`)
    expect(src).not.toMatch(/\d+\s*€/)
    expect(src).not.toMatch(/prices:\s*\{/)
  })
})

describe("C2 — parcours (goVisit)", () => {
  it("chaque zone ouvre le chapitre qui la contient ; final → Choisir ma formule", () => {
    for (const k of ZONE_KEYS) expect(CLZ_VISIT_CHAPTERS[chapterForZone(k)].zones).toContain(k)
    expect(chapterForZone("seats")).toBe(0)
    expect(chapterForZone("body")).toBe(1)
    expect(chapterForZone("engine")).toBe(4)
    expect(CLZ_VISIT_CHAPTERS[chapterForZone("final")].label).toBe("Choisir ma formule")
  })

  it("le composant s'enregistre auprès de la navigation et garde le retour au film", () => {
    const src = read(`${CLZ}/visit-video.tsx`)
    expect(src).toMatch(/registerVisit\(/)
    expect(src).toContain("Retour à la vidéo")
    expect(src).toMatch(/goFilm\(/)
  })

  it("le lien profond #zone= reste géré par le film", () => {
    expect(read(`${CLZ}/prestations-film.tsx`)).toMatch(/goVisit\(zoneParam, origin\)/)
  })
})

describe("C3 — lecture des vidéos", () => {
  it("une seule vidéo joue : le chapitre actif, et seulement à l'écran et si autorisé", () => {
    expect(playingChapter(2, true, true)).toBe(2)
    expect(playingChapter(2, false, true)).toBeNull()
    expect(playingChapter(2, true, false)).toBeNull()
    // Chapitres sans vidéo (moteur, formule) : rien ne joue.
    expect(playingChapter(4, true, true)).toBeNull()
    expect(playingChapter(5, true, true)).toBeNull()
  })

  it("source pc / tel selon la largeur, aucune si mouvement réduit ou économie de données", () => {
    const habitacle = CLZ_VISIT_CHAPTERS[0]
    expect(visitVideoSrc(habitacle, 390)).toBe("/custom-sites/cleanyzer/visite/interieur-tel.mp4")
    expect(visitVideoSrc(habitacle, 1280)).toBe("/custom-sites/cleanyzer/visite/interieur-pc.mp4")
    expect(visitVideoSrc(CLZ_VISIT_CHAPTERS[1], 390)).toBe("/custom-sites/cleanyzer/neon/hero-arrivee-720.mp4")
    expect(visitVideoSrc(CLZ_VISIT_CHAPTERS[1], 1280)).toBe("/custom-sites/cleanyzer/neon/hero-arrivee-1080.mp4")
    expect(visitVideoSrc(habitacle, 1280, true)).toBeNull()
    expect(visitVideoSrc(habitacle, 1280, false, true)).toBeNull()
    expect(visitVideoSrc(CLZ_VISIT_CHAPTERS[4], 1280)).toBeNull()
  })

  it("vidéos rendues : muettes, en ligne, en boucle, preload none, affiche, sans source ni autoplay", () => {
    const videos = h.match(/<video[^>]*>/g) ?? []
    expect(videos).toHaveLength(4)
    for (const v of videos) {
      expect(v).toMatch(/\bmuted\b/)
      expect(v).toMatch(/playsinline/i)
      expect(v).toMatch(/\bloop\b/)
      expect(v).toMatch(/preload="none"/)
      expect(v).toMatch(/poster="[^"]+"/)
      expect(v).not.toMatch(/\bsrc="/)
      expect(v).not.toMatch(/autoplay/i)
      expect(publicFile(/poster="([^"]+)"/.exec(v)![1])).toBe(true)
    }
    expect(h).not.toMatch(/<source/)
  })

  it("moteur : 1re image de la bande moteur_3, affichée par le composant", () => {
    expect(h).toMatch(/<img[^>]*src="\/custom-sites\/cleanyzer\/film\/moteur_3\.webp"/)
  })
})

describe("C4 — plus de 3D", () => {
  it("fichiers 3D supprimés", () => {
    for (const f of ["visit-3d.tsx", "visit-3d.css", "visit-3d-lazy.tsx", "visit-3d-swipe.ts"]) expect(existsSync(path.join(ROOT, CLZ, f))).toBe(false)
    expect(existsSync(path.join(ROOT, "public/custom-sites/cleanyzer/3d"))).toBe(false)
  })

  it("aucun import 3D / three / jsdelivr-three dans le dossier cleanyzer", () => {
    for (const f of readdirSync(path.join(ROOT, CLZ))) {
      const src = read(`${CLZ}/${f}`)
      expect(src, f).not.toMatch(/visit-3d/)
      expect(src, f).not.toMatch(/npm\/three@|from\s+["']three["']/)
    }
    expect(read(`${CLZ}/home-page.tsx`)).toMatch(/<ClzVisitVideo \/>/)
  })

  it("aucun « 3D » visible : visite, film, page de prestation", () => {
    expect(text(h)).not.toMatch(/3D/)
    expect(text(html(createElement(PrestationsFilm)))).not.toMatch(/3D/)
    const sp = read(`${CLZ}/service-page.tsx`)
    expect(sp).toContain("Zone par zone, en vidéo<")
    expect(sp).toContain("Voir la zone dans la visite")
    expect(sp).not.toMatch(/>[^<{]*3D/)
  })

  it("styles morts de l'ancienne carte retirés", () => {
    expect(read(`${CLZ}/cleanyzer.css`)).not.toMatch(/clz-neon-v(card|copy|note)/)
  })
})

describe("médias", () => {
  it("les 6 vidéos et 6 affiches de visite/ existent", () => {
    for (const n of ["interieur", "jantes", "optiques"])
      for (const q of ["pc", "tel"]) {
        expect(publicFile(`/custom-sites/cleanyzer/visite/${n}-${q}.mp4`)).toBe(true)
        expect(publicFile(`/custom-sites/cleanyzer/visite/${n}-${q}-poster.webp`)).toBe(true)
      }
    expect(publicFile("/custom-sites/cleanyzer/film/moteur_3.webp")).toBe(true)
    expect(publicFile("/custom-sites/cleanyzer/neon/hero-arrivee-poster.webp")).toBe(true)
  })
})
