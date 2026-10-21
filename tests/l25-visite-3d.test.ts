import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * L25 — visite 3D Cleanyzer : scripts du CDN vérifiés (SRI), échec = version
 * légère sans erreur bloquante, modèle lourd seulement en repli, et marque du
 * modèle 3D jamais mise en avant dans les textes visibles.
 */
const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8")
const src = read("components/custom-sites/cleanyzer/visit-3d.tsx")

describe("Scripts du CDN : intégrité et version figée", () => {
  const scripts = [...src.matchAll(/src: `\$\{THREE_CDN\}([^`]+)`,\s*integrity: "([^"]+)"/g)]
  it("three.min.js et GLTFLoader.js portent chacun un hash sha384 valide", () => {
    expect(scripts.map((m) => m[1])).toEqual(["/build/three.min.js", "/examples/js/loaders/GLTFLoader.js"])
    // Un hash mal formé est IGNORÉ par le navigateur (script exécuté sans contrôle).
    for (const [, , h] of scripts) expect(h).toMatch(/^sha384-[A-Za-z0-9+/]{64}$/)
  })
  it("version exacte, jamais une étiquette mobile", () => {
    expect(src).toContain('const THREE_CDN = "https://cdn.jsdelivr.net/npm/three@0.147.0"')
  })
  it("integrity et crossOrigin anonyme appliqués à la balise injectée", () => {
    expect(src).toMatch(/s\.integrity = integrity\s*\n\s*s\.crossOrigin = "anonymous"/)
    expect(src).not.toMatch(/addScript\(`\$\{THREE_CDN\}/)
  })
})

describe("Échec de chargement : version légère, jamais bloquant", () => {
  it("toute erreur (script, hash, modèle) passe par fail3d, qui active la version légère", () => {
    expect(src).toMatch(/const fail3d = \(\) => \{\s*if \(disposed\) return\s*setFailed\(true\)\s*setLite\(true\)/)
    expect(src).not.toContain("n’a pas pu se charger")
    expect(src.match(/fail3d\(\)/g)?.length).toBeGreaterThanOrEqual(3)
  })
  it("après un échec, plus de bouton « Lancer la visite 3D »", () => {
    expect(src).toMatch(/\{!failed && \(\s*<button[\s\S]{0,300}Lancer la visite 3D/)
  })
})

describe("Modèle de 13,4 Mo : repli séquentiel uniquement", () => {
  it("demandé seulement dans le rappel d'échec du modèle compressé ou sans décodeur", () => {
    const raw = [...src.matchAll(/tryLoad\(`\$\{BASE\}porsche-911-raw-glb\.wasm`, false\)/g)]
    expect(raw.length).toBe(3) // échec du 5,8 Mo, décodeur en échec, décodeur absent
    expect(src).toMatch(/\(\) => \{\s*if \(useMeshopt\) tryLoad\(`\$\{BASE\}porsche-911-raw-glb\.wasm`, false\)/)
  })
  it("mode léger : aucun démarrage automatique", () => {
    expect(src).toContain("if (e[0].isIntersecting && !isLite) bootOnce()")
    expect(src).toContain("if (!isLite) io.observe(section)")
  })
})

describe("Marque du modèle 3D non mise en avant", () => {
  it("aucun « Porsche » dans les textes visibles liés à la 3D (hors attribution CC BY)", () => {
    const visible = (s: string) => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "").replace(/<a href="https:\/\/sketchfab\.com[\s\S]*?<\/a>/g, "")
    expect(read("components/custom-sites/cleanyzer/service-page.tsx")).not.toMatch(/Porsche 3D/)
    expect(visible(src).replace(/porsche-911(-raw)?-glb\.wasm/g, "")).not.toMatch(/porsche/i)
  })
  it("attribution CC BY 4.0 conservée", () => {
    expect(src).toContain("sketchfab.com/3d-models/porsche-911-with-interior-877b1bc1739f4a2bb65d62fd7ffd9f75")
    expect(src).toContain("CC BY 4.0")
  })
})
