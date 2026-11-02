import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  compareWithKnown,
  runCheck,
  tscExitCode,
  tscKeys,
  unhandledErrorCount,
  vitestKeys,
} from "../scripts/ci-check.mjs"

/**
 * L34 — `scripts/ci-check.mjs` : la CI n'échoue que pour un échec ABSENT de
 * `tests/known-failures.json`. Clés identiques au kit (lot.mjs / lib.mjs).
 */

const CWD = "/home/runner/work/detail-flow/detail-flow"

describe("clés TypeScript (même logique que le kit)", () => {
  it("chemin absolu retiré, ligne/colonne retirées, espaces normalisés, erreur globale", () => {
    const out = [
      `${CWD}/lib/a.ts(12,5): error TS2345: Argument   of type 'x' is not assignable.`,
      `components/b.tsx(1,1): error TS2322: Type 'y'    is wrong.`,
      "error TS5023: Unknown compiler option 'foo'.",
      "Found 3 errors.",
    ].join("\n")
    expect(tscKeys(out, CWD)).toEqual([
      "lib/a.ts: TS2345: Argument of type 'x' is not assignable.",
      "components/b.tsx: TS2322: Type 'y' is wrong.",
      "(global): TS5023: Unknown compiler option 'foo'.",
    ])
  })
})

describe("clés des tests (même logique que le kit)", () => {
  it("assertion en échec et fichier qui ne charge pas", () => {
    const json = {
      testResults: [
        {
          name: `${CWD}/tests/a.test.ts`,
          status: "failed",
          assertionResults: [
            { status: "passed", fullName: "ok" },
            { status: "failed", fullName: "groupe cas en échec", title: "cas en échec" },
          ],
        },
        { name: `${CWD}/tests/b.test.ts`, status: "failed", assertionResults: [] },
        { name: `${CWD}/tests/c.test.ts`, status: "passed", assertionResults: [{ status: "passed", fullName: "x" }] },
      ],
    }
    expect(vitestKeys(json, CWD)).toEqual([
      "tests/a.test.ts › groupe cas en échec",
      "tests/b.test.ts › (erreur de chargement du fichier)",
    ])
  })
})

describe("comparaison avec la liste des échecs connus", () => {
  const known = { tests: ["tests/a.test.ts › connu"], typescript: ["lib/a.ts: TS1: connue", "lib/a.ts: TS1: connue"] }

  it("seulement des échecs connus → 0", () => {
    const r = runCheck({ tests: ["tests/a.test.ts › connu"], typescript: ["lib/a.ts: TS1: connue", "lib/a.ts: TS1: connue"] }, known)
    expect(r.code).toBe(0)
    expect(r.lines.some((l) => l.startsWith("::warning::"))).toBe(false)
  })

  it("nouveau test en échec → 1", () => {
    const r = runCheck({ tests: ["tests/a.test.ts › connu", "tests/n.test.ts › nouveau"], typescript: known.typescript }, known)
    expect(r.code).toBe(1)
    expect(r.lines.join("\n")).toContain("tests/n.test.ts › nouveau")
  })

  it("nouvelle erreur TypeScript → 1", () => {
    expect(runCheck({ tests: known.tests, typescript: [...known.typescript, "lib/b.ts: TS2: neuve"] }, known).code).toBe(1)
  })

  it("erreur connue répétée une fois de plus → 1 (multiensemble)", () => {
    const r = compareWithKnown({ tests: known.tests, typescript: [...known.typescript, "lib/a.ts: TS1: connue"] }, known)
    expect(r.newTypescript).toEqual(["lib/a.ts: TS1: connue"])
  })

  it("échec connu disparu → 0 + avertissement pour le retirer de la liste", () => {
    const r = runCheck({ tests: [], typescript: ["lib/a.ts: TS1: connue"] }, known)
    expect(r.code).toBe(0)
    const warnings = r.lines.filter((l) => l.startsWith("::warning::"))
    expect(warnings.join("\n")).toContain("tests/a.test.ts › connu")
    expect(warnings.join("\n")).toContain("lib/a.ts: TS1: connue")
    expect(warnings.join("\n")).toContain("tests/known-failures.json")
  })

  it("résultat des tests absent ou illisible → 1", () => {
    expect(runCheck(null, known).code).toBe(1)
  })
})

describe("revue sécurité 1 — typecheck qui plante sans écrire d'erreur", () => {
  const known = { tests: [], typescript: ["lib/a.ts: TS1: connue"] }

  it("code de sortie de tsc lu dans sa sortie (absent → 0)", () => {
    expect(tscExitCode("lib/a.ts(1,1): error TS1: connue\ntsc-exit=2\n")).toBe(2)
    expect(tscExitCode("")).toBe(0)
  })

  it("tsc en erreur sans aucune erreur lue → 1 (pas de coche verte sur un typecheck qui n'a pas tourné)", () => {
    const r = runCheck({ tests: [], typescript: [], tscExit: 137 }, known)
    expect(r.code).toBe(1)
    expect(r.lines.join("\n")).toMatch(/typecheck n'a pas abouti/)
  })

  it("tsc en erreur avec ses erreurs connues → 0 (cas normal tant que la dette existe)", () => {
    expect(runCheck({ tests: [], typescript: ["lib/a.ts: TS1: connue"], tscExit: 2 }, known).code).toBe(0)
  })
})

describe("revue sécurité 2 — erreurs vitest hors test", () => {
  const known = { tests: ["tests/a.test.ts › connu"], typescript: [] }

  it("nombre d'erreurs non gérées lu dans la sortie de vitest", () => {
    expect(unhandledErrorCount("…\nVitest caught 2 unhandled errors during the test run.\n")).toBe(2)
    expect(unhandledErrorCount("Vitest caught 1 unhandled error during the test run.")).toBe(1)
    expect(unhandledErrorCount("Test Files  3 passed (3)")).toBe(0)
  })

  it("erreur non gérée, même avec seulement des échecs connus → 1", () => {
    const r = runCheck({ tests: ["tests/a.test.ts › connu"], typescript: [], unhandled: 1 }, known)
    expect(r.code).toBe(1)
    expect(r.lines.join("\n")).toMatch(/erreur\(s\) non gérée\(s\)/)
  })

  it("vitest en échec sans aucun test identifiable → 1", () => {
    expect(runCheck({ tests: [], typescript: [], vitestFailed: true }, { tests: [], typescript: [] }).code).toBe(1)
  })
})

describe("tests/known-failures.json", () => {
  const known = JSON.parse(readFileSync(path.join(process.cwd(), "tests/known-failures.json"), "utf8"))

  it("baseline de main (0785dc6) : 11 tests et 44 erreurs TypeScript, tests sans doublon", () => {
    expect(known.tests).toHaveLength(11)
    expect(new Set(known.tests).size).toBe(11)
    expect(known.typescript).toHaveLength(44)
    for (const k of known.tests) expect(k).toMatch(/^tests\/.+\.test\.ts › .+/)
    for (const k of known.typescript) expect(k).toMatch(/^[^\s:]+\.(ts|tsx): TS\d+: .+/)
  })
})
