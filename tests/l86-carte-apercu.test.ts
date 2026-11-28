import { describe, it, expect } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { TiltCard } from "@/components/digital-card/tilt-card"

/** L86 — La face de la carte suit la maquette approuvée : ni trame diagonale, ni barre d'accent. */
describe("L86 face de la carte", () => {
  const props = { name: "Brillance Auto", line: "Lyon", logoSrc: null, background: "#0F172A", accent: "#2563EB" }

  it("aucune trame diagonale ni barre d'accent", () => {
    const html = renderToStaticMarkup(createElement(TiltCard, { ...props, cardStyle: "solid" }))

    expect(html).not.toContain("repeating-linear-gradient")
    // En style uni, la couleur d'accent n'apparaît nulle part sur la carte.
    expect(html).not.toContain("#2563EB")
  })
})
