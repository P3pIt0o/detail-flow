import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Le moteur de promotions reste PUR : importable côté client, sans base de
 * données, Stripe, Next, React ni accès réseau.
 */
const DIR = join(process.cwd(), "lib/booking/promotions")

describe("moteur de promotions — pureté", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".ts"))
  it("fichiers présents", () => expect(files.length >= 6).toBe(true))
  for (const f of files) {
    it(`${f} : aucune dépendance interdite`, () => {
      const src = readFileSync(join(DIR, f), "utf8")
      const imports = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1])
      for (const i of imports) expect(i.startsWith("./")).toBe(true)
      expect(src).not.toMatch(/server-only|process\.env|fetch\(|Math\.random|Date\.now\(\)/)
    })
  }
})
