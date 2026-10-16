#!/usr/bin/env node
// Outil RÉSERVÉ AU DÉVELOPPEUR (bloqué pour Claude par le hook de garde).
//   node .claude/hooks/dfguard.mjs init [--dev-host H]... [--prod-host H]...
//   node .claude/hooks/dfguard.mjs doctor
//   node .claude/hooks/dfguard.mjs approve L1 [--confirm "<texte>"]
//   node .claude/hooks/dfguard.mjs revoke L1
//   node .claude/hooks/dfguard.mjs reset-loops L1
//   node .claude/hooks/dfguard.mjs test-db [fichiers de test…]
import { execFileSync, spawnSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { createInterface } from "node:readline/promises"
import {
  GUARD_DIR, POLICY, approvalPath, hostOfDbUrl, lotIdFromBranch, maxRisk, planDeclaredRisk, planFiles,
  planPath, readJson, repoInfo, riskOf, riskRank, sha256File, signApproval, statePath, verifyApproval,
} from "./lib.mjs"

const [cmd, ...rest] = process.argv.slice(2)
const say = (s = "") => process.stdout.write(s + "\n")
const die = (s, code = 1) => { process.stderr.write(`ERREUR : ${s}\n`); process.exit(code) }
const flagValues = (name) => rest.flatMap((a, i) => (a === name && rest[i + 1] ? [rest[i + 1]] : []))
const DB_FILE = path.join(GUARD_DIR, "db.json")
const KEY_FILE = path.join(GUARD_DIR, "approval.key")

function loadDb() { return readJson(DB_FILE, { devHosts: [], prodHosts: [] }) }

async function ask(question) {
  if (!process.stdin.isTTY) return null
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const a = await rl.question(question)
  rl.close()
  return a.trim()
}

// ------------------------------------------------------------------ init
function init() {
  mkdirSync(GUARD_DIR, { recursive: true, mode: 0o700 })
  chmodSync(GUARD_DIR, 0o700)
  if (!existsSync(KEY_FILE)) {
    writeFileSync(KEY_FILE, randomBytes(32).toString("hex") + "\n", { mode: 0o600, flag: "wx" })
    say(`Clé d'approbation créée : ${KEY_FILE} (lisible par toi seul, illisible pour les agents)`)
  } else say("Clé d'approbation déjà présente : conservée.")
  const db = loadDb()
  const norm = (h) => h.trim().toLowerCase()
  for (const h of flagValues("--dev-host").map(norm)) if (!db.devHosts.includes(h)) db.devHosts.push(h)
  for (const h of flagValues("--prod-host").map(norm)) if (!db.prodHosts.includes(h)) db.prodHosts.push(h)
  const both = db.devHosts.filter((h) => db.prodHosts.includes(h))
  if (both.length) die(`hôte déclaré à la fois dev et prod : ${both.join(", ")}`)
  writeFileSync(DB_FILE, JSON.stringify(db, null, 2) + "\n", { mode: 0o600 })
  say(`Hôtes Neon DEV autorisés pour test-db : ${db.devHosts.join(", ") || "(aucun)"}`)
  say(`Hôtes Neon PROD interdits : ${db.prodHosts.join(", ") || "(aucun — ajoute-le avec --prod-host)"}`)
}

// ------------------------------------------------------------------ doctor
function envFiles(top) {
  return readdirSync(top).filter((f) => (f === ".env" || f.startsWith(".env.")) && f !== ".env.example")
}

function parseEnv(file) {
  const res = {}
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line)
    if (m) res[m[1]] = m[2].replace(/^["']|["']$/g, "")
  }
  return res
}

function versionGte(v, min) {
  const a = v.split(".").map(Number), b = min.split(".").map(Number)
  for (let i = 0; i < 3; i++) { if ((a[i] || 0) > (b[i] || 0)) return true; if ((a[i] || 0) < (b[i] || 0)) return false }
  return true
}

function doctor() {
  const { top } = repoInfo(process.cwd())
  if (!top) die("lance doctor depuis le dépôt detail-flow")
  let bad = 0
  const ok = (m) => say(`  OK   ${m}`)
  const ko = (m) => { bad++; say(`  KO   ${m}`) }
  const warn = (m) => say(`  !!   ${m}`)
  say("Diagnostic du kit DetailFlow")
  const nodeMajor = Number(process.versions.node.split(".")[0])
  nodeMajor >= 20 ? ok(`Node ${process.versions.node}`) : ko(`Node ${process.versions.node} : version 20 minimum`)
  try {
    const v = execFileSync("claude", ["--version"], { encoding: "utf8" }).match(/\d+\.\d+\.\d+/)?.[0]
    if (!v) warn("version de Claude Code illisible")
    else if (versionGte(v, "2.1.295")) ok(`Claude Code ${v}`)
    else ko(`Claude Code ${v} : 2.1.295 minimum (hooks « onFailure: block »). Lance « claude update »`)
  } catch { warn("commande « claude » introuvable dans le PATH de ce terminal") }
  for (const b of ["bwrap", "socat"]) {
    try { execFileSync("sh", ["-c", `command -v ${b}`], { stdio: "ignore" }); ok(`${b} installé (sandbox)`) }
    catch { ko(`${b} absent : sudo apt-get install bubblewrap socat (sans lui, Claude Code refusera de démarrer : failIfUnavailable)`) }
  }
  existsSync(KEY_FILE) ? ok("clé d'approbation présente") : ko("clé d'approbation absente : node .claude/hooks/dfguard.mjs init")
  const db = loadDb()
  db.devHosts.length ? ok(`hôte(s) DEV déclaré(s) : ${db.devHosts.join(", ")}`) : warn("aucun hôte Neon DEV déclaré (nécessaire seulement pour test-db)")
  db.prodHosts.length ? ok(`hôte(s) PROD déclaré(s) : ${db.prodHosts.join(", ")}`) : warn("hôte Neon PROD non déclaré : déclare-le avec init --prod-host pour qu'il soit refusé partout")
  // Fichiers .env : on n'affiche JAMAIS les valeurs, seulement les hôtes et noms de variables.
  for (const f of envFiles(top)) {
    const env = parseEnv(path.join(top, f))
    for (const [k, v] of Object.entries(env)) {
      if (/^postgres(ql)?:\/\//.test(v)) {
        const h = hostOfDbUrl(v)
        if (db.prodHosts.includes(h)) ko(`${f} : ${k} pointe vers la PRODUCTION (${h}). Retire-le de ce poste.`)
        else if (db.devHosts.includes(h)) ok(`${f} : ${k} → dev (${h})`)
        else warn(`${f} : ${k} → hôte inconnu ${h} (déclare-le dev ou prod avec init)`)
      }
      if (/^(sk|rk)_live_/.test(v)) ko(`${f} : ${k} contient une clé Stripe LIVE. Elle n'a rien à faire sur un poste de dev.`)
      if (/^whsec_/.test(v) && /live|prod/i.test(k)) warn(`${f} : ${k} ressemble à un secret de webhook de production`)
    }
  }
  const gi = existsSync(path.join(top, ".gitignore")) ? readFileSync(path.join(top, ".gitignore"), "utf8") : ""
  gi.includes(".lot-state/") ? ok(".lot-state/ ignoré par git") : ko(".lot-state/ absent du .gitignore")
  const us = readJson(path.join(homedir(), ".claude", "settings.json"), {})
  us?.sandbox?.network?.strictAllowlist === true ? ok("strictAllowlist actif (réglages utilisateur)") : warn("recommandé : sandbox.network.strictAllowlist=true dans ~/.claude/settings.json (voir user-settings.recommended.json du kit)")
  us?.permissions?.disableBypassPermissionsMode === "disable" ? ok("mode bypass désactivé au niveau utilisateur") : warn("recommandé : permissions.disableBypassPermissionsMode=\"disable\" dans ~/.claude/settings.json")
  const vs = path.join(homedir(), ".config", "Code", "User", "settings.json")
  if (existsSync(vs) && /allowDangerouslySkipPermissions"\s*:\s*true/.test(readFileSync(vs, "utf8"))) ko("VS Code : claudeCode.allowDangerouslySkipPermissions est activé. Désactive-le.")
  say(bad ? `\n${bad} problème(s) bloquant(s).` : "\nAucun problème bloquant.")
  process.exit(bad ? 1 : 0)
}

// ------------------------------------------------------------------ approve
async function approve(lot) {
  if (!/^L[0-9]+$/.test(lot || "")) die("usage : approve L1")
  const { top, branch } = repoInfo(process.cwd())
  if (lotIdFromBranch(branch) !== lot) die(`place-toi sur la branche du lot (lot/${lot}-<slug>), actuelle : ${branch}`)
  const pp = planPath(top, lot)
  if (!existsSync(pp)) die(`plan absent : ${path.relative(top, pp)}`)
  const st = readJson(statePath(top, lot))
  if (!st || st.phase !== "PLAN_READY") die(`le lot doit être en phase PLAN_READY (actuelle : ${st?.phase ?? "aucune"}). Claude doit d'abord lancer « lot.mjs plan-ready ${lot} »`)
  const text = readFileSync(pp, "utf8")
  const files = planFiles(text)
  const computed = maxRisk(files.map(riskOf))
  const declared = planDeclaredRisk(text)
  const risk = declared && riskRank(declared) > riskRank(computed) ? declared : computed
  const crit = files.filter((f) => riskOf(f) === "critique")
  say(`\n===== PLAN ${lot} (${branch}) =====\n`)
  say(text)
  say(`\n===== RÉSUMÉ =====`)
  say(`Risque : ${risk.toUpperCase()}${declared && declared !== risk ? ` (déclaré ${declared})` : ""}`)
  say(`Fichiers autorisés (${files.length}) :`)
  for (const f of files) say(`  - ${f}  [${riskOf(f)}]`)
  if (crit.length) say(`\nFICHIERS CRITIQUES : ${crit.join(", ")}\nCes fichiers touchent l'argent, l'authentification, l'isolation des tenants, la base ou le déploiement.`)
  const expected = risk === "critique" ? `CRITIQUE ${lot}` : "oui"
  const given = flagValues("--confirm")[0] ?? await ask(`\nPour approuver, tape exactement « ${expected} » : `)
  if (given !== expected) die("approbation annulée (texte de confirmation différent)")
  const a = signApproval({
    lot, branch, planSha256: sha256File(pp), risk, files, approvedAt: new Date().toISOString(), kitVersion: POLICY.kitVersion,
  })
  writeFileSync(approvalPath(top, lot), JSON.stringify(a, null, 2) + "\n")
  const v = verifyApproval(top, lot, branch)
  if (!v.ok) die(`approbation écrite mais invalide : ${v.reason}`)
  say(`\nLot ${lot} APPROUVÉ (risque ${risk}). Claude peut maintenant lancer « lot.mjs begin ${lot} ».`)
  say("Toute modification du plan annulera automatiquement cette approbation.")
}

function revoke(lot) {
  const { top } = repoInfo(process.cwd())
  const f = approvalPath(top, lot)
  if (!existsSync(f)) return say("Aucune approbation à révoquer.")
  rmSync(f)
  say(`Approbation de ${lot} révoquée : Claude repasse en lecture seule sur ce lot.`)
}

function resetLoops(lot) {
  const { top } = repoInfo(process.cwd())
  const f = statePath(top, lot)
  const st = readJson(f)
  if (!st) die("aucun état pour ce lot")
  st.fixLoops = 0
  st.verifyFailsInRow = 0
  for (const r of Object.values(st.reviews || {})) r.count = 0
  if (st.phase === "BLOCKED") { st.phase = st.blockedFrom && st.blockedFrom !== "BLOCKED" ? st.blockedFrom : "FIXING"; delete st.blockedFrom }
  ;(st.history ||= []).push({ at: new Date().toISOString(), event: "reset-loops (humain)" })
  writeFileSync(f, JSON.stringify(st, null, 2) + "\n")
  say(`Compteurs de ${lot} remis à zéro, phase ${st.phase}.`)
}

// ------------------------------------------------------------------ test-db (humain, hors sandbox)
function testDb() {
  const { top } = repoInfo(process.cwd())
  if (!top) die("lance test-db depuis le dépôt")
  const db = loadDb()
  if (!db.devHosts.length) die("aucun hôte DEV déclaré : node .claude/hooks/dfguard.mjs init --dev-host <hôte-neon-de-dev>")
  const env = { ...process.env }
  // Même ordre de résolution que vitest.config.ts.
  if (!env.DATABASE_URL) {
    for (const f of [".env.development.local", ".env.local", ".env"]) {
      const p = path.join(top, f)
      if (existsSync(p)) { const e = parseEnv(p); if (e.DATABASE_URL) { env.DATABASE_URL = e.DATABASE_URL; break } }
    }
  }
  delete env.NEON_DATABASE_URL; delete env.NEON_DATABASE_URL_UNPOOLED
  for (const k of ["DATABASE_URL", "CUSTOMER_SUBSCRIPTIONS_TEST_DATABASE_URL"]) {
    if (!env[k]) continue
    const h = hostOfDbUrl(env[k])
    if (!h) die(`${k} illisible`)
    if (db.prodHosts.includes(h)) die(`${k} pointe vers la PRODUCTION (${h}) : refusé`)
    if (!db.devHosts.includes(h)) die(`${k} pointe vers ${h}, qui n'est pas un hôte DEV déclaré : refusé`)
    say(`${k} → ${h} (dev) : autorisé`)
  }
  if (!env.DATABASE_URL) die("DATABASE_URL introuvable (env ou .env.development.local/.env.local/.env)")
  for (const k of Object.keys(env)) if (/^(sk|rk)_live_/.test(env[k] || "")) die(`${k} contient une clé Stripe LIVE : refusé`)
  const vitest = path.join(top, "node_modules", ".bin", "vitest")
  if (!existsSync(vitest)) die("vitest introuvable : pnpm install")
  const files = rest.filter((a) => !a.startsWith("--"))
  const r = spawnSync(vitest, ["run", ...files], { cwd: top, env, stdio: "inherit" })
  process.exit(r.status ?? 1)
}

// ------------------------------------------------------------------ main
switch (cmd) {
  case "init": init(); break
  case "doctor": doctor(); break
  case "approve": await approve(rest[0]); break
  case "revoke": revoke(rest[0]); break
  case "reset-loops": resetLoops(rest[0]); break
  case "test-db": testDb(); break
  default:
    say("Usage : node .claude/hooks/dfguard.mjs <init|doctor|approve L1|revoke L1|reset-loops L1|test-db>")
    process.exit(cmd ? 1 : 0)
}
