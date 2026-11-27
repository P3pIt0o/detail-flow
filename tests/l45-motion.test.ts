import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, it, expect } from "vitest"
import {
  MAX_TILT,
  DEAD_ZONE,
  FLOAT_AMPLITUDE,
  FLOAT_PERIOD_S,
  applyDeadZone,
  floatOffset,
  layersFor,
  orientationTarget,
  pointerTarget,
  shadowTransform,
  specularOffset,
  stepSpring,
} from "@/lib/digital-card-motion"
import { TiltCard } from "@/components/digital-card/tilt-card"

/** L45 — C4 : moteur de mouvement de la carte 3D (pur) + rendu serveur du composant. */

describe("orientation : calibrage et bornes", () => {
  it("le premier évènement est la position neutre (angle relatif)", () => {
    const neutral = { beta: 40, gamma: 3 }
    expect(orientationTarget(neutral, neutral)).toEqual({ x: 0, y: 0 })
    const t = orientationTarget({ beta: 45, gamma: 8 }, neutral)
    expect(t.x).toBeCloseTo(-5)
    expect(t.y).toBeCloseTo(5)
  })

  it("angle limité à ±18° (beta/gamma extrêmes)", () => {
    const n = { beta: 0, gamma: 0 }
    expect(orientationTarget({ beta: 170, gamma: 80 }, n)).toEqual({ x: -MAX_TILT, y: MAX_TILT })
    expect(orientationTarget({ beta: -170, gamma: -80 }, n)).toEqual({ x: MAX_TILT, y: -MAX_TILT })
  })

  it("passage gamma ±90° : pas de saut d'un bord à l'autre", () => {
    const t = orientationTarget({ beta: 0, gamma: -88 }, { beta: 0, gamma: 85 })
    expect(Math.abs(t.y)).toBeLessThanOrEqual(MAX_TILT)
    expect(t.y).toBeCloseTo(7)
  })

  it("souris : coordonnées normalisées → inclinaison bornée", () => {
    expect(pointerTarget(1, -1)).toEqual({ x: MAX_TILT, y: MAX_TILT })
    expect(pointerTarget(0, 0)).toEqual({ x: 0, y: 0 })
    expect(pointerTarget(5, 5)).toEqual({ x: -MAX_TILT, y: MAX_TILT })
  })
})

describe("ressort amorti et zone morte", () => {
  it("zone morte : une variation ≤ 0,4° ne change pas la cible", () => {
    expect(applyDeadZone(5, 5 + DEAD_ZONE * 0.9)).toBe(5)
    expect(applyDeadZone(5, 5 - DEAD_ZONE * 0.9)).toBe(5)
    expect(applyDeadZone(5, 6)).toBe(6)
  })

  it("converge vers la cible sans dépasser la borne, puis s'arrête (aucun tremblement)", () => {
    let s = { value: 0, velocity: 0 }
    const seen: number[] = []
    for (let i = 0; i < 600; i++) {
      s = stepSpring(s, MAX_TILT)
      seen.push(s.value)
    }
    expect(Math.max(...seen.map(Math.abs))).toBeLessThanOrEqual(MAX_TILT)
    expect(s).toEqual({ value: MAX_TILT, velocity: 0 })
    // Au repos : valeur strictement stable.
    const rest = stepSpring(s, MAX_TILT)
    expect(rest).toEqual(s)
  })

  it("valeurs arrondies à 0,01°", () => {
    const s = stepSpring({ value: 0, velocity: 0 }, 7.777)
    expect(Math.round(s.value * 100) / 100).toBe(s.value)
  })
})

describe("flottement, ombre, reflets", () => {
  it("flottement borné à 2–3 px, période 5 s", () => {
    expect(FLOAT_AMPLITUDE).toBeGreaterThanOrEqual(2)
    expect(FLOAT_AMPLITUDE).toBeLessThanOrEqual(3)
    expect(FLOAT_PERIOD_S).toBe(5)
    let max = 0
    for (let t = 0; t < 10; t += 0.05) max = Math.max(max, Math.abs(floatOffset(t, false)))
    expect(max).toBeLessThanOrEqual(3)
    expect(max).toBeGreaterThanOrEqual(2)
    expect(floatOffset(1.3, false)).toBeCloseTo(floatOffset(1.3 + FLOAT_PERIOD_S, false))
  })

  it("ombre décalée à l'opposé de l'inclinaison, plus petite quand la carte monte", () => {
    const sh = shadowTransform({ x: 10, y: 10 }, 0)
    expect(sh.x).toBeLessThan(0)
    expect(sh.y).toBeLessThan(0)
    const sh2 = shadowTransform({ x: -10, y: -10 }, 0)
    expect(sh2.x).toBeGreaterThan(0)
    expect(sh2.y).toBeGreaterThan(0)
    // translateY négatif = la carte monte → ombre resserrée et plus légère.
    expect(shadowTransform({ x: 0, y: 0 }, -2.5).scale).toBeLessThan(shadowTransform({ x: 0, y: 0 }, 2.5).scale)
    expect(shadowTransform({ x: 0, y: 0 }, -2.5).opacity).toBeLessThan(shadowTransform({ x: 0, y: 0 }, 2.5).opacity)
  })

  it("reflet spéculaire pour les 3 styles ; holographique seulement en « holographic »", () => {
    expect(layersFor("solid")).toEqual({ specular: true, holographic: false })
    expect(layersFor("gradient")).toEqual({ specular: true, holographic: false })
    expect(layersFor("holographic")).toEqual({ specular: true, holographic: true })
  })

  it("mouvement réduit / refus : flottement 0, reflet statique", () => {
    expect(floatOffset(1.25, true)).toBe(0)
    expect(specularOffset({ x: 12, y: -9 }, true)).toEqual(specularOffset({ x: 0, y: 0 }, true))
    expect(specularOffset({ x: 12, y: -9 }, false)).not.toEqual(specularOffset({ x: 0, y: 0 }, false))
  })
})

describe("TiltCard — rendu serveur", () => {
  const props = { name: "Brillance Auto", line: "Lyon", logoSrc: null, background: "#0F172A", accent: "#2563EB" }
  const html = (style: "solid" | "gradient" | "holographic") =>
    renderToStaticMarkup(createElement(TiltCard, { ...props, cardStyle: style }))

  it("état initial à plat, format 85,6 × 54", () => {
    const h = html("holographic")
    expect(h).toContain("aspect-ratio:85.6 / 54")
    expect(h).not.toMatch(/rotate[XY]\(/)
    expect(h).toContain("Brillance Auto")
  })

  it("calque holographique absent hors style holographique, reflet spéculaire toujours présent", () => {
    expect(html("holographic")).toContain('data-layer="holo"')
    expect(html("solid")).not.toContain('data-layer="holo"')
    expect(html("gradient")).not.toContain('data-layer="holo"')
    for (const s of ["solid", "gradient", "holographic"] as const) expect(html(s)).toContain('data-layer="specular"')
  })

  it("bouton « Toucher pour animer la carte » non rendu côté serveur", () => {
    expect(html("holographic")).not.toContain("Toucher pour animer la carte")
  })

  it("contrôle source : seules transform/opacity sont écrites dans la boucle, aucune librairie 3D", () => {
    const src = readFileSync(join(process.cwd(), "components/digital-card/tilt-card.tsx"), "utf8")
    const writes = [...src.matchAll(/\.style\.([a-zA-Z]+)\s*=/g)].map((m) => m[1])
    expect(writes.length).toBeGreaterThan(0)
    for (const w of writes) expect(["transform", "opacity"]).toContain(w)
    expect(src).not.toContain("setProperty")
    expect(src).not.toMatch(/from "three"|@react-three/)
    expect(src).not.toMatch(/overflow:\s*"hidden"[^\n]*preserve-3d/)
    expect(src).toContain("visibilitychange")
    expect(src).toContain("requestPermission")
    expect(src).toContain("prefers-reduced-motion")
  })
})
