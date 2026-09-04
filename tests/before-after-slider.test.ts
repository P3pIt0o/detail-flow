import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

/**
 * Comparateur Avant/Après — invariants de performance et d'accessibilité
 * (fluidité Safari iOS), vérifiables sur la source sans rendu DOM :
 *  1. Aucun setState React pour l'affichage pendant le geste (variable CSS).
 *  2. Throttling requestAnimationFrame + annulation au démontage.
 *  3. transform / clip-path (pas d'animation de width/left qui reflow).
 *  4. Pointer Events + capture + gestion pointerup/cancel/lostcapture.
 *  5. touch-action: pan-y (scroll vertical préservé, pas de touch-none).
 *  6. Pas de backdrop-blur/backdrop-filter (coûteux pendant le drag).
 *  7. Accessibilité : input range + aria-label ; images decoding async + lazy.
 */

function read(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8")
}

const SRC = read("components/before-after-slider.tsx")

describe("BeforeAfterSlider — fluidité Safari iOS", () => {
  it("pilote l'affichage par variable CSS --compare-position, sans setState pendant le geste", () => {
    expect(SRC).toMatch(/setProperty\("--compare-position"/)
    // La variable porte une unité en pourcentage.
    expect(SRC).toMatch(/`\$\{pending\.current\}%`/)
    // Le geste n'appelle pas de setter d'état pour l'affichage : applyPosition
    // écrit uniquement le DOM. Les seuls setState servent la valeur ARIA.
    expect(SRC).toMatch(/const applyPosition/)
    // Aucun setState de position visuelle nommé (l'ancien setPosition a disparu).
    expect(SRC).not.toMatch(/setPosition/)
  })

  it("throttle via requestAnimationFrame et annule la frame au démontage", () => {
    expect(SRC).toMatch(/requestAnimationFrame/)
    expect(SRC).toMatch(/cancelAnimationFrame/)
    // Nettoyage dans un effet de démontage.
    expect(SRC).toMatch(/useEffect\(/)
  })

  it("découpe, ligne et poignée lisent la MÊME variable --compare-position", () => {
    // Découpe (clip-path) relative au conteneur.
    expect(SRC).toMatch(/clipPath/)
    expect(SRC).toMatch(/calc\(100% - var\(--compare-position\)\)/)
    // Ligne + poignée positionnées par `left` (relatif au conteneur), pas par
    // translateX(%) sur un wrapper de largeur nulle (cause de la régression).
    expect(SRC).toMatch(/left: "var\(--compare-position\)"/)
    expect(SRC).not.toMatch(/translateX\(calc\(var\(--compare-position\)/)
    // La racine déclare la variable par défaut à 50 %.
    expect(SRC).toMatch(/\[--compare-position:50%\]/)
  })

  it("centre la poignée sur la séparation avec translateX(-50%)", () => {
    // -translate-x-1/2 sur l'élément ligne/poignée le recentre exactement.
    expect(SRC).toMatch(/-translate-x-1\/2/)
  })

  it("gère les Pointer Events avec capture et tous les cas de fin de geste", () => {
    expect(SRC).toMatch(/setPointerCapture/)
    expect(SRC).toMatch(/onPointerDown/)
    expect(SRC).toMatch(/onPointerMove/)
    expect(SRC).toMatch(/onPointerUp/)
    expect(SRC).toMatch(/onPointerCancel/)
    expect(SRC).toMatch(/onLostPointerCapture/)
  })

  it("préserve le défilement vertical (touch-action pan-y, pas de touch-none)", () => {
    expect(SRC).toMatch(/touch-action:pan-y/)
    expect(SRC).not.toMatch(/touch-none/)
    // Pas de preventDefault global sur la section.
    expect(SRC).not.toMatch(/preventDefault/)
  })

  it("retire les effets coûteux (backdrop-blur/backdrop-filter) pendant le drag", () => {
    expect(SRC).not.toMatch(/backdrop-blur/)
    expect(SRC).not.toMatch(/backdrop-filter/)
  })

  it("borne la position entre 0 et 100 %", () => {
    expect(SRC).toMatch(/Math\.min\(100, Math\.max\(0,/)
  })

  it("conserve un contrôle accessible et optimise le décodage d'image", () => {
    expect(SRC).toMatch(/type="range"/)
    expect(SRC).toMatch(/aria-label=/)
    // Décodage asynchrone des images du comparateur.
    expect((SRC.match(/decoding="async"/g) ?? []).length).toBe(2)
  })
})
