import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

/**
 * L34 — structure de `.github/workflows/ci.yml` (contrôle du fichier, sans
 * dépendance YAML). L'exécution réelle (C1) se vérifie sur la PR.
 */

const yml = readFileSync(path.join(process.cwd(), ".github/workflows/ci.yml"), "utf8")
const steps = yml.split(/\n\s+- name: /).slice(1)
const step = (name: string) => steps.find((s) => s.startsWith(name)) ?? ""

describe("ci.yml", () => {
  it("déclencheurs : PR vers main et push sur main", () => {
    expect(yml).toMatch(/pull_request:\s*\n\s+branches: \[main\]/)
    expect(yml).toMatch(/push:\s*\n\s+branches: \[main\]/)
  })

  it("droits en lecture seule, délai maximal ; annulation des exécutions en cours pour les PR seulement (jamais sur main)", () => {
    expect(yml).toMatch(/permissions:\s*\n\s+contents: read/)
    expect(yml).toMatch(/timeout-minutes: 15/)
    expect(yml).toContain("cancel-in-progress: ${{ github.event_name == 'pull_request' }}")
    expect(yml).not.toMatch(/cancel-in-progress: true/)
  })

  it("option (a) — chaque secret n'est fourni que sur un push (vers main), jamais à une PR", () => {
    const lines = yml.split("\n").filter((l) => l.includes("secrets."))
    expect(lines.length).toBe(4)
    for (const l of lines) expect(l).toMatch(/\$\{\{ github\.event_name == 'push' && secrets\.[A-Z0-9_]+ \|\| '' \}\}/)
  })

  it("revue sécurité 1 — le code de sortie de tsc est conservé pour le verdict", () => {
    expect(step("Typecheck")).toContain('> tsc-output.txt || echo "tsc-exit=$?" >> tsc-output.txt')
  })

  it("revue métier (C4) — la sortie détaillée de vitest va dans un fichier, pas dans le journal", () => {
    const run = step("Tests")
    expect(run).toContain("> vitest-output.txt 2>&1")
    expect(steps[steps.length - 1]).toContain("vitest-output.txt")
  })

  it("Node 24 (comme Vercel), pnpm 10.34.7, installation figée", () => {
    expect(yml).toMatch(/node-version: 24\b/)
    expect(yml).toMatch(/version: 10\.34\.7/)
    expect(yml).toContain("pnpm install --frozen-lockfile")
  })

  it("seuls les deux secrets prévus, uniquement dans le garde-fou et les tests", () => {
    const secrets = [...yml.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1])
    expect(new Set(secrets)).toEqual(new Set(["CI_DATABASE_URL", "CI_CUSTOMER_SUBSCRIPTIONS_TEST_DATABASE_URL"]))
    const withSecrets = steps.filter((s) => s.includes("secrets.")).map((s) => s.split("\n")[0])
    expect(withSecrets).toEqual(["Garde-fou des bases de test", "Tests"])
  })

  it("C4 — aucune commande n'affiche un secret", () => {
    expect(yml).not.toMatch(/(echo|printf|cat)[^\n]*(secrets\.|DATABASE_URL)/)
    expect(yml).not.toMatch(/run:[^\n]*\$\{\{\s*secrets\./)
  })

  it("le verdict final est rendu par scripts/ci-check.mjs, en dernière étape", () => {
    expect(steps[steps.length - 1]).toMatch(/node scripts\/ci-check\.mjs/)
    expect(step("Garde-fou des bases de test")).toMatch(/node scripts\/ci-db-guard\.mjs/)
    expect(yml.indexOf("Garde-fou des bases de test")).toBeLessThan(yml.indexOf("- name: Tests"))
  })
})
