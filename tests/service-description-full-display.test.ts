import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const SURFACES = [
  { file: "components/service-card.tsx", expr: "{service.description}" },
  { file: "components/booking-v2/step-service.tsx", expr: "{s.description}" },
  { file: "components/booking/step-vehicles.tsx", expr: "{s.description}" },
] as const

const LONG_DESCRIPTION = [
  "Aspiration complète",
  "Dépoussiérage",
  "Nettoyage des plastiques",
  "Nettoyage des vitres",
  "Shampoing des sièges",
  "Nettoyage des tapis",
  "Finition",
].join("\n")

function descriptionBlock(source: string, expr: string): string {
  const idx = source.indexOf(expr)
  expect(idx, `description non rendue (${expr})`).toBeGreaterThan(-1)
  const openTag = source.lastIndexOf("<", source.lastIndexOf("className=", idx))
  return source.slice(openTag, idx + expr.length)
}

describe("descriptions de prestations affichées en entier", () => {
  for (const { file, expr } of SURFACES) {
    describe(file, () => {
      const source = read(file)
      const block = descriptionBlock(source, expr)

      it("conserve les retours à la ligne (whitespace-pre-line)", () => {
        expect(block).toContain("whitespace-pre-line")
      })

      it("n'applique aucune troncature CSS", () => {
        expect(block).not.toMatch(/line-clamp|truncate|max-h-|text-ellipsis|overflow-hidden/)
      })

      it("rend la valeur brute sans slice/substring/truncate JS", () => {
        expect(source).not.toMatch(
          /description[^\n]*\.(slice|substring|substr)\(|(slice|substring|substr|truncate)\([^\n]*description/,
        )
      })
    })
  }

  it("ServiceCard ne contient plus line-clamp-3", () => {
    expect(read("components/service-card.tsx")).not.toContain("line-clamp-3")
  })

  it("une description multi-lignes est restituée intégralement (aucune transformation)", () => {
    const rendered = String(LONG_DESCRIPTION)
    expect(rendered.split("\n")).toHaveLength(7)
    expect(rendered).toBe(LONG_DESCRIPTION)
    expect(rendered.endsWith("Finition")).toBe(true)
  })
})
