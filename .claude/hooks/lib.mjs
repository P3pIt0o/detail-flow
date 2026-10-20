// Bibliothèque partagée du kit DetailFlow (garde, workflow /lot, outil humain dfguard).
// Aucune dépendance npm : Node >= 20 uniquement.
import { execFileSync } from "node:child_process"
import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const HOOKS_DIR = path.dirname(fileURLToPath(import.meta.url))
export const POLICY = JSON.parse(readFileSync(path.join(HOOKS_DIR, "policy.json"), "utf8"))
export const STATE_DIR_NAME = ".lot-state"

export function expandHome(p) {
  if (p === "~") return homedir()
  if (p.startsWith("~/")) return path.join(homedir(), p.slice(2))
  return p
}

export const GUARD_DIR = expandHome(POLICY.guardDir)

export function sha256(data) {
  return createHash("sha256").update(data).digest("hex")
}

export function sha256File(file) {
  return existsSync(file) ? sha256(readFileSync(file)) : null
}

// ---------------------------------------------------------------- glob
const globCache = new Map()
export function globToRegExp(glob) {
  if (globCache.has(glob)) return globCache.get(glob)
  let re = ""
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === "*") {
      if (glob[i + 1] === "*") {
        if (glob[i + 2] === "/") { re += "(?:.*/)?"; i += 2 } else { re += ".*"; i += 1 }
      } else re += "[^/]*"
    } else if (c === "?") re += "[^/]"
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&")
  }
  const rx = new RegExp(`^${re}$`)
  globCache.set(glob, rx)
  return rx
}
export const matchesAny = (rel, globs) => globs.some((g) => globToRegExp(g).test(rel))

/** Niveau de risque d'un chemin relatif au dépôt : "critique" | "moyen" | "faible". */
export function riskOf(rel) {
  if (matchesAny(rel, POLICY.risk.critical)) return "critique"
  if (matchesAny(rel, POLICY.risk.medium)) return "moyen"
  return "faible"
}
const RANK = { faible: 0, moyen: 1, critique: 2 }
export const maxRisk = (levels) => levels.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), "faible")
export const riskRank = (r) => RANK[r] ?? 0

// ---------------------------------------------------------------- git
export function git(dir, args, { allowFail = true } = {}) {
  try {
    return execFileSync("git", ["-C", dir, ...args], {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 8000,
    }).trim()
  } catch (e) {
    if (allowFail) return null
    throw e
  }
}

export function repoInfo(dir) {
  const top = git(dir, ["rev-parse", "--show-toplevel"])
  if (!top) return { top: null, branch: null }
  const branch = git(top, ["symbolic-ref", "--quiet", "--short", "HEAD"]) // null si HEAD détachée
  return { top, branch }
}

export function lotIdFromBranch(branch) {
  if (!branch) return null
  const m = new RegExp(POLICY.lotBranchPattern).exec(branch)
  return m ? m[1] : null
}

export const isProtectedBranch = (branch) => !branch || POLICY.protectedBranches.includes(branch)

// ---------------------------------------------------------------- plan & approbation
export const stateDir = (top) => path.join(top, STATE_DIR_NAME)
export const planPath = (top, lot) => path.join(stateDir(top), `${lot}.plan.md`)
export const approvalPath = (top, lot) => path.join(stateDir(top), `${lot}.approved`)
export const statePath = (top, lot) => path.join(stateDir(top), `${lot}.json`)

/** Liste des chemins/globs déclarés dans la section « ## Fichiers » du plan. */
export function planFiles(planText) {
  const lines = planText.split(/\r?\n/)
  const out = []
  let inSection = false
  for (const line of lines) {
    if (/^##\s+/.test(line)) { inSection = /^##\s+Fichiers\b/i.test(line); continue }
    if (!inSection) continue
    const ticks = [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim())
    if (ticks.length) out.push(...ticks.filter((t) => /^[\w.@()[\]\-/*]+$/.test(t)))
    else {
      const m = /^\s*[-*]\s+([\w.@()[\]\-/*]+)\s*$/.exec(line)
      if (m) out.push(m[1])
    }
  }
  return [...new Set(out)]
}

export function planDeclaredRisk(planText) {
  const m = /^##\s+Risque\s*:?\s*(faible|moyen|critique)\b/im.exec(planText) ||
    /^\s*Risque\s*:\s*(faible|moyen|critique)\b/im.exec(planText)
  return m ? m[1].toLowerCase() : null
}

function readKey() {
  const f = path.join(GUARD_DIR, "approval.key")
  if (!existsSync(f)) return null
  const k = readFileSync(f, "utf8").trim()
  return /^[0-9a-f]{64}$/.test(k) ? Buffer.from(k, "hex") : null
}
export const hasApprovalKey = () => readKey() !== null

const canonical = (a) => JSON.stringify({
  lot: a.lot, branch: a.branch, planSha256: a.planSha256, risk: a.risk,
  files: a.files, approvedAt: a.approvedAt, kitVersion: a.kitVersion,
})

export function signApproval(a) {
  const key = readKey()
  if (!key) throw new Error(`Clé d'approbation absente : lance d'abord « node .claude/hooks/dfguard.mjs init ».`)
  return { ...a, mac: createHmac("sha256", key).update(canonical(a)).digest("hex") }
}

/**
 * Vérifie l'approbation humaine d'un lot. Seul un processus qui peut lire la clé
 * (~/.config/detailflow-guard/approval.key) peut produire une approbation valide.
 * Les commandes Bash de Claude tournent dans le sandbox, où ce dossier est illisible.
 */
export function verifyApproval(top, lot, branch) {
  const file = approvalPath(top, lot)
  if (!existsSync(file)) return { ok: false, reason: "aucune approbation" }
  let a
  try { a = JSON.parse(readFileSync(file, "utf8")) } catch { return { ok: false, reason: "approbation illisible" } }
  const key = readKey()
  if (!key) return { ok: false, reason: "clé d'approbation absente sur ce poste" }
  const expected = createHmac("sha256", key).update(canonical(a)).digest()
  let given
  try { given = Buffer.from(String(a.mac || ""), "hex") } catch { given = Buffer.alloc(0) }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: "signature d'approbation invalide (fichier modifié ou forgé)" }
  }
  if (a.lot !== lot) return { ok: false, reason: "approbation d'un autre lot" }
  if (a.branch !== branch) return { ok: false, reason: `approbation donnée pour la branche ${a.branch}` }
  const planSha = sha256File(planPath(top, lot))
  if (!planSha || planSha !== a.planSha256) {
    return { ok: false, reason: "le plan a changé depuis l'approbation : nouvelle approbation requise" }
  }
  return { ok: true, approval: a }
}

/** Le chemin relatif est-il couvert par la liste de fichiers approuvée ? */
export function coveredByApproval(rel, approval) {
  return matchesAny(rel, approval.files || [])
}

// ---------------------------------------------------------------- secrets & chemins protégés
const SECRET_PATHS_ABS = POLICY.secretPaths.map(expandHome)

export function isEnvFile(p) {
  const base = path.basename(p)
  return (base === ".env" || base.startsWith(".env.")) && base !== ".env.example"
}

export function isSecretPath(absPath) {
  const p = path.resolve(absPath)
  if (isEnvFile(p)) return true
  if (/\.(pem|p12|pfx|key)$/i.test(p) && !p.includes(`${path.sep}node_modules${path.sep}`)) return true
  if (/(^|\/)id_(rsa|ed25519|ecdsa|dsa)(\.pub)?$/.test(p)) return true
  if (/(^|\/)\.vercel(\/|$)/.test(p)) return true
  if (/(^|\/)\.git\/config$/.test(p)) return true
  if (p === path.resolve(GUARD_DIR) || p.startsWith(path.resolve(GUARD_DIR) + path.sep)) return true
  return SECRET_PATHS_ABS.some((s) => p === s || p.startsWith(s + path.sep))
}

/** Fichiers du kit et de l'état que Claude ne doit jamais modifier lui-même. */
export function isKitProtected(rel) {
  if (rel === "CLAUDE.md" || rel === ".mcp.json") return true
  if (rel === ".claude" || rel.startsWith(".claude/")) return true
  if (rel.startsWith(".git/") || rel === ".git") return true
  if (rel.startsWith(`${STATE_DIR_NAME}/`)) {
    // Seuls le plan et les notes de travail sont rédigés par Claude.
    return !/^\.lot-state\/L[0-9]+\.(plan|notes)\.md$/.test(rel)
  }
  return false
}

// ---------------------------------------------------------------- divers
export function readJson(file, fallback = null) {
  try { return JSON.parse(readFileSync(file, "utf8")) } catch { return fallback }
}

export function hostOfDbUrl(url) {
  try {
    const u = new URL(String(url).trim().replace(/^["']|["']$/g, ""))
    return u.hostname ? u.hostname.toLowerCase() : null
  } catch { return null }
}

// ------------------------------------------------------------------ baseline TypeScript (kit 2.1.3)
export const TYPECHECK_BASELINE_VERSION = 2

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// Clé stable d'une erreur tsc : « chemin/relatif: TSxxxx: message », sans numéro de ligne ni de colonne,
// sans chemin absolu (copie de référence, copie de travail, liens symboliques résolus), espaces normalisés.
// `cwd` : dossier où tsc a tourné ; `roots` : racines équivalentes (dossier analysé, dépôt, et leurs chemins réels).
export function tscErrorKeys(output, cwd, roots = []) {
  const rs = [...new Set([cwd, ...roots].filter(Boolean))].sort((a, b) => b.length - a.length)
  const strip = (s) => rs.reduce((acc, r) => acc.replace(new RegExp(`${escapeRe(r)}[\\\\/]?`, "g"), ""), s)
  const rel = (p) => strip(path.isAbsolute(p) ? p : path.join(cwd, p)).split(path.sep).join("/").replace(/^\.\//, "")
  const keys = []
  for (const raw of String(output).split(/\r?\n/)) {
    const l = raw.trim()
    let m = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/.exec(l)
    if (m) { keys.push(`${rel(m[1])}: ${m[4]}: ${strip(m[5]).replace(/\s+/g, " ").trim()}`); continue }
    m = /^error (TS\d+): (.*)$/.exec(l)
    if (m) keys.push(`(global): ${m[1]}: ${strip(m[2]).replace(/\s+/g, " ").trim()}`)
  }
  return keys
}

// Erreurs présentes dans `current` et absentes de `base`, en multiensemble (une erreur répétée en plus est nouvelle).
export function newTypecheckErrors(current, base) {
  const left = new Map()
  for (const k of base) left.set(k, (left.get(k) || 0) + 1)
  const fresh = []
  for (const k of current) { const n = left.get(k) || 0; if (n > 0) left.set(k, n - 1); else fresh.push(k) }
  return fresh
}

export const isValidTypecheckBaseline = (b) =>
  !!b && b.v === TYPECHECK_BASELINE_VERSION && typeof b.head === "string" && Array.isArray(b.errors) && b.errors.every((e) => typeof e === "string")

// Verdict de typecheck pour verify. Toute baseline absente ou invalide est BLOQUANTE.
export function typecheckVerdict(tc, baseline) {
  if (!tc.errors) return { block: `typecheck : ${tc.summary}`, fresh: [], old: 0 }
  if (!isValidTypecheckBaseline(baseline)) return { block: "typecheck : baseline TypeScript indisponible ou invalide, comparaison impossible", fresh: [], old: 0 }
  const fresh = newTypecheckErrors(tc.errors, baseline.errors)
  return { block: fresh.length ? `typecheck : ${fresh.length} NOUVELLE(S) erreur(s)` : null, fresh, old: tc.errors.length - fresh.length }
}
