// Verdict de la CI (L34) : échec seulement si un test ou une erreur TypeScript n'est PAS dans
// tests/known-failures.json. Clés identiques au kit (.claude/hooks/lib.mjs tscErrorKeys,
// .claude/hooks/lot.mjs runTests) : logique recopiée, le kit n'est ni importé ni modifié.
//
// Usage : node scripts/ci-check.mjs <sortie-tsc.txt> <resultat-vitest.json> [tests/known-failures.json]
import { readFileSync, realpathSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const realOr = (p) => {
  try {
    return realpathSync(p)
  } catch {
    return p
  }
}

/** Clés « chemin/relatif: TSxxxx: message » (sans ligne ni colonne) ou « (global): TSxxxx: message ». */
export function tscKeys(output, cwd) {
  const roots = [...new Set([cwd, realOr(cwd)])].sort((a, b) => b.length - a.length)
  const strip = (s) => roots.reduce((acc, r) => acc.replace(new RegExp(`${escapeRe(r)}[\\\\/]?`, "g"), ""), s)
  const rel = (p) => strip(path.isAbsolute(p) ? p : path.join(cwd, p)).split(path.sep).join("/").replace(/^\.\//, "")
  const keys = []
  for (const raw of String(output).split(/\r?\n/)) {
    const l = raw.trim()
    let m = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/.exec(l)
    if (m) {
      keys.push(`${rel(m[1])}: ${m[4]}: ${strip(m[5]).replace(/\s+/g, " ").trim()}`)
      continue
    }
    m = /^error (TS\d+): (.*)$/.exec(l)
    if (m) keys.push(`(global): ${m[1]}: ${strip(m[2]).replace(/\s+/g, " ").trim()}`)
  }
  return keys
}

/** Clés « tests/x.test.ts › nom complet », ou « … › (erreur de chargement du fichier) ». */
export function vitestKeys(json, cwd) {
  const keys = []
  for (const tr of json?.testResults || []) {
    const file = path.relative(realOr(cwd), realOr(tr.name || "")).split(path.sep).join("/")
    const bad = (tr.assertionResults || []).filter((a) => a.status === "failed").map((a) => `${file} › ${a.fullName || a.title}`)
    if (bad.length) keys.push(...bad)
    else if (tr.status === "failed") keys.push(`${file} › (erreur de chargement du fichier)`)
  }
  return keys
}

/** Écarts en multiensemble : une clé répétée plus souvent que dans la liste est nouvelle. */
function diff(current, known) {
  const left = new Map()
  for (const k of known) left.set(k, (left.get(k) || 0) + 1)
  const fresh = []
  for (const k of current) {
    const n = left.get(k) || 0
    if (n > 0) left.set(k, n - 1)
    else fresh.push(k)
  }
  const gone = [...left].flatMap(([k, n]) => Array(n).fill(k))
  return { fresh, gone }
}

export function compareWithKnown(current, known) {
  const t = diff(current.tests, known.tests || [])
  const ts = diff(current.typescript, known.typescript || [])
  return { newTests: t.fresh, newTypescript: ts.fresh, fixedTests: t.gone, fixedTypescript: ts.gone }
}

/** `current` = { tests, typescript } ou null si le résultat des tests est absent/illisible. */
export function runCheck(current, known) {
  if (!current) return { code: 1, lines: ["::error::Résultat des tests absent ou illisible : verdict impossible."] }
  const r = compareWithKnown(current, known)
  const lines = []
  for (const k of r.newTests) lines.push(`::error::Nouveau test en échec : ${k}`)
  for (const k of r.newTypescript) lines.push(`::error::Nouvelle erreur TypeScript : ${k}`)
  for (const k of [...r.fixedTests, ...r.fixedTypescript]) {
    lines.push(`::warning::Échec connu qui ne se produit plus (à retirer de tests/known-failures.json) : ${k}`)
  }
  const nNew = r.newTests.length + r.newTypescript.length
  lines.push(
    `Tests en échec : ${current.tests.length} (dont ${r.newTests.length} nouveau(x)) · ` +
      `Erreurs TypeScript : ${current.typescript.length} (dont ${r.newTypescript.length} nouvelle(s))`,
  )
  lines.push(nNew ? "RÉSULTAT : ÉCHEC (échecs nouveaux, absents de tests/known-failures.json)" : "RÉSULTAT : OK")
  return { code: nNew ? 1 : 0, lines }
}

function main([tscFile, vitestFile, knownFile = "tests/known-failures.json"]) {
  const cwd = process.cwd()
  const known = JSON.parse(readFileSync(knownFile, "utf8"))
  let current = null
  try {
    const json = JSON.parse(readFileSync(vitestFile, "utf8"))
    current = { tests: vitestKeys(json, cwd), typescript: tscKeys(readFileSync(tscFile, "utf8"), cwd) }
  } catch {
    current = null
  }
  const { code, lines } = runCheck(current, known)
  for (const l of lines) console.log(l)
  process.exitCode = code
}

if (process.argv[1] && realOr(path.resolve(process.argv[1])) === realOr(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2))
}
