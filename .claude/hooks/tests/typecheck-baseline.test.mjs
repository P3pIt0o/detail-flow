// Tests du kit 2.1.3 (baseline TypeScript de lot.mjs). Aucune dépendance npm :
//   node --test .claude/hooks/tests/*.test.mjs
// Les scénarios d'intégration créent un dépôt git jetable avec un faux tsc et un faux vitest.
import { test } from "node:test"
import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, chmodSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { TYPECHECK_BASELINE_VERSION, isValidTypecheckBaseline, newTypecheckErrors, tscErrorKeys, typecheckVerdict } from "../lib.mjs"

const HOOKS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

// ------------------------------------------------------------------ unitaires
test("normalisation : lignes, colonnes, chemins absolus, \\r et espaces ignorés", () => {
  const a = tscErrorKeys("lib/a.ts(3,7): error TS2322: Type 'string'  is not assignable.\r\n", "/repo")
  const b = tscErrorKeys("/tmp/df-tsc-x/wt/lib/a.ts(10,1): error TS2322: Type 'string' is not assignable.", "/tmp/df-tsc-x/wt", ["/repo"])
  assert.deepEqual(a, ["lib/a.ts: TS2322: Type 'string' is not assignable."])
  assert.deepEqual(b, a)
})

test("normalisation : node_modules résolu vers le dépôt et chemins dans le message", () => {
  const out = [
    "../../../repo/node_modules/x/index.d.ts(1,1): error TS2300: Duplicate identifier 'X'.",
    "lib/b.ts(1,1): error TS2307: Cannot find module '/tmp/df-tsc-y/wt/lib/zz'.",
    "error TS6053: File '/tmp/df-tsc-y/wt/.next/types/routes.d.ts' not found.",
    "  Ligne de détail indentée ignorée",
  ].join("\n")
  const k = tscErrorKeys(out, "/tmp/df-tsc-y/wt", ["/repo"])
  assert.deepEqual(k, [
    "node_modules/x/index.d.ts: TS2300: Duplicate identifier 'X'.",
    "lib/b.ts: TS2307: Cannot find module 'lib/zz'.",
    "(global): TS6053: File '.next/types/routes.d.ts' not found.",
  ])
  assert.deepEqual(tscErrorKeys(out.replaceAll("/tmp/df-tsc-y/wt", "/repo").replace("../../../repo/", ""), "/repo"), k)
})

test("anciennes erreurs seules : aucune nouvelle", () => {
  const base = ["a: TS1: x", "a: TS1: x", "b: TS2: y"]
  assert.deepEqual(newTypecheckErrors(["b: TS2: y", "a: TS1: x", "a: TS1: x"], base), [])
  const v = typecheckVerdict({ errors: ["b: TS2: y"] }, { v: TYPECHECK_BASELINE_VERSION, head: "h", errors: base })
  assert.equal(v.block, null); assert.equal(v.old, 1)
})

test("nouvelles erreurs : différente, ou identique en plus (multiensemble)", () => {
  const bl = { v: TYPECHECK_BASELINE_VERSION, head: "h", errors: ["a: TS1: x"] }
  assert.deepEqual(typecheckVerdict({ errors: ["a: TS1: x", "c: TS3: z"] }, bl).fresh, ["c: TS3: z"])
  const v = typecheckVerdict({ errors: ["a: TS1: x", "a: TS1: x"] }, bl)
  assert.match(v.block, /1 NOUVELLE/); assert.deepEqual(v.fresh, ["a: TS1: x"])
})

test("baseline absente, invalide ou d'une ancienne version : BLOQUANT", () => {
  for (const b of [undefined, null, {}, { v: 1, head: "h", errors: [] }, { v: TYPECHECK_BASELINE_VERSION, head: "h", errors: null }, { v: TYPECHECK_BASELINE_VERSION, head: "h", errors: [3] }, { v: TYPECHECK_BASELINE_VERSION, errors: [] }]) {
    assert.equal(isValidTypecheckBaseline(b), false)
    assert.match(typecheckVerdict({ errors: ["a: TS1: x"] }, b).block, /baseline TypeScript indisponible ou invalide/)
  }
  assert.match(typecheckVerdict({ errors: null, summary: "tsc a échoué" }, { v: TYPECHECK_BASELINE_VERSION, head: "h", errors: [] }).block, /tsc a échoué/)
})

// ------------------------------------------------------------------ intégration (dépôt jetable)
const FAKE_TSC = `#!/usr/bin/env node
// Faux tsc : lit tsc.json (versionné) dans le dossier analysé.
const fs = require("fs"), cwd = process.cwd()
const c = JSON.parse(fs.readFileSync("tsc.json", "utf8"))
if (c.crash) { console.error("Segmentation fault"); process.exit(134) }
const lines = c.errors.map((e) => (c.absolute ? cwd + "/" : "") + e)
if (fs.existsSync(".next")) lines.push(".next/types/page.ts(1,1): error TS2344: cache .next partagé")
if (fs.existsSync("tsconfig.tsbuildinfo")) lines.push("tsconfig.tsbuildinfo(1,1): error TS9999: cache tsbuildinfo partagé")
if (!process.argv.includes("--pretty") || !process.argv.includes("--incremental")) lines.push("x(1,1): error TS9998: options manquantes")
console.log(lines.join("\\n")); process.exit(lines.length ? 2 : 0)
`
const FAKE_VITEST = `#!/usr/bin/env node
const o = process.argv.find((a) => a.startsWith("--outputFile=")).slice(13)
require("fs").writeFileSync(o, JSON.stringify({ testResults: [] }))
`

function setup({ base, withBaselineCmd = false }) {
  const root = mkdtempSync(path.join(tmpdir(), "df-kit-test-"))
  const repo = path.join(root, "repo"), home = path.join(root, "home")
  mkdirSync(home); mkdirSync(path.join(repo, ".claude"), { recursive: true })
  const env = { ...process.env, HOME: home, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" }
  const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: repo, env, encoding: "utf8", ...opts })
  const git = (...a) => { const r = sh("git", a); if (r.status) throw new Error(`git ${a.join(" ")} : ${r.stderr}`); return r.stdout }
  const lot = (...a) => { const r = sh("node", [".claude/hooks/lot.mjs", ...a]); return { code: r.status, out: `${r.stdout}${r.stderr}` } }
  cpSync(HOOKS, path.join(repo, ".claude", "hooks"), { recursive: true, filter: (p) => !p.includes(`${path.sep}tests`) })
  mkdirSync(path.join(repo, "node_modules", ".bin"), { recursive: true })
  for (const [n, c] of [["tsc", FAKE_TSC], ["vitest", FAKE_VITEST]]) { const f = path.join(repo, "node_modules", ".bin", n); writeFileSync(f, c); chmodSync(f, 0o755) }
  mkdirSync(path.join(repo, "lib")); mkdirSync(path.join(repo, "tests"))
  writeFileSync(path.join(repo, ".gitignore"), "node_modules\n.lot-state\n.next\ntsconfig.tsbuildinfo\n")
  writeFileSync(path.join(repo, "tsconfig.json"), "{}\n"); writeFileSync(path.join(repo, "vitest.config.ts"), "export default {}\n")
  writeFileSync(path.join(repo, "lib", "a.ts"), "export const a = 1\n")
  writeFileSync(path.join(repo, "tsc.json"), JSON.stringify(base))
  git("init", "-q", "-b", "main"); git("add", "-A"); git("commit", "-qm", "base")
  git("switch", "-q", "-c", "lot/L1-test")
  assert.equal(lot("start", "L1").code, 0)
  if (withBaselineCmd) assert.equal(lot("baseline", "L1").code, 0)
  writeFileSync(path.join(repo, ".lot-state", "L1.plan.md"), "# Plan\n## Objectif\nx\n## Décisions\n- [x] ok\n## Fichiers\n- `lib/a.ts`\n- `tests/a.test.ts`\n- `tsc.json`\n## Tests\nx\n## Risque : faible\n")
  assert.equal(lot("plan-ready", "L1").code, 0)
  sh("node", [".claude/hooks/dfguard.mjs", "init"])
  const ap = sh("node", [".claude/hooks/dfguard.mjs", "approve", "L1", "--confirm", "oui"])
  assert.equal(lot("begin", "L1").code, 0, ap.stdout + ap.stderr)
  const change = (head, extra = {}) => {
    writeFileSync(path.join(repo, "tsc.json"), JSON.stringify(head))
    writeFileSync(path.join(repo, "lib", "a.ts"), "// déplacement\nexport const a = 2\n")
    writeFileSync(path.join(repo, "tests", "a.test.ts"), "export const t = 1\n")
    if (extra.next) { mkdirSync(path.join(repo, ".next", "types"), { recursive: true }); writeFileSync(path.join(repo, "tsconfig.tsbuildinfo"), "{}") }
    git("add", "-A"); git("commit", "-qm", "lot")
  }
  const state = () => JSON.parse(readFileSync(path.join(repo, ".lot-state", "L1.json"), "utf8"))
  const setState = (f) => { const s = state(); f(s); writeFileSync(path.join(repo, ".lot-state", "L1.json"), JSON.stringify(s)) }
  const cleanup = () => {
    const wts = git("worktree", "list").trim().split("\n").length
    const left = readdirSync(tmpdir()).filter((d) => d.startsWith("df-tsc-")).length
    rmSync(root, { recursive: true, force: true })
    return { wts, left }
  }
  return { repo, lot, change, state, setState, cleanup, sh }
}

const OLD = ["lib/a.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'.", "lib/b.ts(4,1): error TS2304: Cannot find name 'zz'."]
const SHIFTED = ["lib/a.ts(2,7): error TS2322: Type 'string' is not assignable to type 'number'.", "lib/b.ts(9,1): error TS2304: Cannot find name 'zz'."]

test("intégration : anciennes erreurs déplacées, chemins absolus, caches .next/tsbuildinfo locaux → OK", () => {
  const t = setup({ base: { errors: OLD } })
  t.change({ errors: SHIFTED, absolute: true }, { next: true })
  const r = t.lot("verify", "L1")
  assert.equal(r.code, 0, r.out)
  assert.match(r.out, /RÉSULTAT : OK/); assert.match(r.out, /2 erreur\(s\) TypeScript déjà présente/)
  assert.equal(t.state().typecheckBaseline.v, TYPECHECK_BASELINE_VERSION)
  assert.equal(t.state().phase, "IMPLEMENTED")
  const c = t.cleanup(); assert.equal(c.wts, 1); assert.equal(c.left, 0)
})

test("intégration : baseline prise par « baseline » puis nouvelle erreur → ECHEC avec l'erreur", () => {
  const t = setup({ base: { errors: OLD }, withBaselineCmd: true })
  assert.ok(isValidTypecheckBaseline(t.state().typecheckBaseline))
  t.change({ errors: [...SHIFTED, "lib/a.ts(5,1): error TS7006: Parameter 'p' implicitly has an 'any' type."] })
  const r = t.lot("verify", "L1")
  assert.equal(r.code, 1)
  assert.match(r.out, /BLOQUANT typecheck : 1 NOUVELLE\(S\) erreur/)
  assert.match(r.out, /erreur TS : lib\/a\.ts: TS7006/)
  t.cleanup()
})

test("intégration : même erreur ancienne une fois de plus → ECHEC", () => {
  const t = setup({ base: { errors: OLD } })
  t.change({ errors: [...SHIFTED, "lib/a.ts(8,7): error TS2322: Type 'string' is not assignable to type 'number'."] })
  assert.match(t.lot("verify", "L1").out, /BLOQUANT typecheck : 1 NOUVELLE/)
  t.cleanup()
})

test("intégration : calcul de la baseline impossible → ECHEC, jamais un avertissement", () => {
  const t = setup({ base: { crash: true }, withBaselineCmd: true })
  assert.equal(t.state().typecheckBaseline, undefined)
  t.change({ errors: SHIFTED })
  const r = t.lot("verify", "L1")
  assert.equal(r.code, 1)
  assert.match(r.out, /BLOQUANT typecheck : baseline TypeScript indisponible \(tsc a échoué sans erreur exploitable/)
  assert.doesNotMatch(r.out, /RÉSULTAT : OK/)
  assert.equal(t.state().phase, "IMPLEMENTING")
  const c = t.cleanup(); assert.equal(c.left, 0)
})

test("intégration : baseline mémorisée invalide → recalculée ; si le recalcul échoue → ECHEC", () => {
  const ok = setup({ base: { errors: OLD } })
  ok.change({ errors: SHIFTED })
  ok.setState((s) => { s.typecheckBaseline = { head: "x", errors: "corrompu" } })
  assert.match(ok.lot("verify", "L1").out, /RÉSULTAT : OK/)
  assert.ok(isValidTypecheckBaseline(ok.state().typecheckBaseline))
  ok.cleanup()
  const ko = setup({ base: { crash: true } })
  ko.change({ errors: SHIFTED })
  ko.setState((s) => { s.typecheckBaseline = { v: 1, head: "x", errors: [] } }) // format du brouillon 2.1.3 / ancienne version
  const r = ko.lot("verify", "L1")
  assert.equal(r.code, 1); assert.match(r.out, /baseline TypeScript indisponible/)
  ko.cleanup()
})

test("intégration : tsc de la branche en échec sans erreur lisible → ECHEC", () => {
  const t = setup({ base: { errors: OLD } })
  t.change({ crash: true })
  const r = t.lot("verify", "L1")
  assert.equal(r.code, 1); assert.match(r.out, /BLOQUANT typecheck : tsc a échoué sans erreur exploitable/)
  t.cleanup()
})
