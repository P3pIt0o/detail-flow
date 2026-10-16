#!/usr/bin/env node
// Outil du workflow /lot : état persistant, reprise, classification du risque,
// contrôles automatiques (secrets, migrations, multi-tenant, Stripe) et tests.
// Appelé par Claude via : node .claude/hooks/lot.mjs <commande> <LOT> [options]
// Il ne peut NI approuver un lot, NI remettre à zéro les compteurs : c'est dfguard.mjs (humain).
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import {
  POLICY, approvalPath, git, isEnvFile, matchesAny, maxRisk, planDeclaredRisk, planFiles, planPath,
  readJson, repoInfo, riskOf, riskRank, sha256, sha256File, stateDir, statePath, lotIdFromBranch,
} from "./lib.mjs"

const PHASES = ["AUDIT", "PLAN_READY", "IMPLEMENTING", "IMPLEMENTED", "REVIEWED", "FIXING", "VERIFIED", "DONE", "BLOCKED"]
const REVIEWERS_BY_RISK = {
  faible: [],
  moyen: ["revue-metier", "revue-securite"],
  critique: ["revue-metier", "revue-securite", "verificateur"],
}

const [cmd, LOT, ...rest] = process.argv.slice(2)
const opts = new Set(rest.filter((a) => a.startsWith("--")))
const args = rest.filter((a) => !a.startsWith("--"))

function out(lines) { process.stdout.write((Array.isArray(lines) ? lines.join("\n") : lines) + "\n") }
function fail(msg, code = 2) { process.stderr.write(`ERREUR : ${msg}\n`); process.exit(code) }
const now = () => new Date().toISOString()

if (!cmd || cmd === "help" || cmd === "--help") {
  out([
    "Usage : node .claude/hooks/lot.mjs <commande> <LOT>",
    "  status L1          état, cohérence git et prochaine action",
    "  start L1           crée l'état du lot (sur la branche lot/L1-<slug>)",
    "  baseline L1        mémorise les tests déjà en échec AVANT tout changement",
    "  plan-ready L1      vérifie le plan .lot-state/L1.plan.md et calcule son risque",
    "  begin L1           passe en implémentation (exige l'approbation humaine)",
    "  verify L1 [--quick] contrôles automatiques + typecheck + tests",
    "  pack L1            prépare le dossier de revue et indique les relecteurs nécessaires",
    "  review L1 <agent> <OK|A_CORRIGER> [bloquants] [majeurs]",
    "  fix L1             ouvre une boucle de correction (limitée)",
    "  done L1            clôture si tout est vérifié",
  ])
  process.exit(0)
}
if (!/^L[0-9]+$/.test(LOT || "")) fail("identifiant de lot attendu (ex. L1)")

const { top, branch } = repoInfo(process.cwd())
if (!top) fail("pas dans un dépôt git")
mkdirSync(stateDir(top), { recursive: true })
const SP = statePath(top, LOT)
const head = () => git(top, ["rev-parse", "HEAD"])
const short = (s) => (s || "").slice(0, 8)

function load() { return readJson(SP) }
function save(st) { st.updatedAt = now(); writeFileSync(SP, JSON.stringify(st, null, 2) + "\n") }
function log(st, event) { (st.history ||= []).push({ at: now(), event, head: short(head()) }); if (st.history.length > 200) st.history.shift() }
function requireState() { const st = load(); if (!st) fail(`aucun état pour ${LOT} : lance « start ${LOT} »`); return st }
function requireBranch(st) {
  if (branch !== st.branch) fail(`branche courante « ${branch} » ≠ branche du lot « ${st.branch} ». Fais « git switch ${st.branch} »`)
}

// ------------------------------------------------------------------ changements
function changedFiles(base) {
  const files = new Map()
  const ns = git(top, ["diff", "--name-status", "--no-renames", base]) || ""
  for (const line of ns.split("\n").filter(Boolean)) {
    const [status, file] = line.split("\t")
    files.set(file, status[0])
  }
  const untracked = git(top, ["ls-files", "--others", "--exclude-standard"]) || ""
  for (const f of untracked.split("\n").filter(Boolean)) files.set(f, "A")
  for (const f of [...files.keys()]) if (f.startsWith(".lot-state/")) files.delete(f)
  return files
}

function addedLinesByFile(base, files) {
  const res = new Map()
  const diff = git(top, ["diff", "-U0", "--no-renames", base]) || ""
  let cur = null
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) { cur = line.slice(4).replace(/^b\//, ""); if (cur === "/dev/null") cur = null; continue }
    if (cur && line.startsWith("+") && !line.startsWith("+++")) {
      if (!res.has(cur)) res.set(cur, [])
      res.get(cur).push(line.slice(1))
    }
  }
  for (const [f, st] of files) {
    if (st === "A" && !res.has(f)) {
      try { res.set(f, readFileSync(path.join(top, f), "utf8").split("\n")) } catch { /* binaire */ }
    }
  }
  return res
}

// ------------------------------------------------------------------ contrôles statiques
const GUARD_RX = /(requireCompanyMember|requireAdminCompanyId|requireCompanyRole|requireSuperAdmin|requireAdmin\b|requireTenant|requireWebsiteFeature|resolvePublicRequestTenant|resolveRequestTenant|requireCompanyId|getSession|constructEvent|CRON_SECRET)/
const MONEY_FILES = ["lib/billing/**", "lib/payments/**", "lib/customer-subscriptions/**", "lib/sms/**", "lib/pricing/**", "lib/invoice/**", "app/api/billing/**", "app/api/payments/**"]

function staticChecks(files, added, approval) {
  const F = [], W = []
  const add = (arr, file, msg) => arr.push(`${file} — ${msg}`)
  const isTest = (f) => f.startsWith("tests/")
  const src = (f) => /\.(ts|tsx|mjs|js)$/.test(f)

  for (const [f, st] of files) {
    if (isEnvFile(f)) add(F, f, "fichier .env ajouté ou modifié : interdit")
    if (/^scripts\/.*\.sql$/.test(f) && st !== "A") add(F, f, "migration EXISTANTE modifiée ou supprimée : les migrations sont immuables, crée un nouveau fichier")
    if (/\.sql$/.test(f) && !f.startsWith("scripts/")) add(W, f, "fichier SQL hors de scripts/")
  }

  for (const [f, lines] of added) {
    const text = lines.join("\n")
    // Secrets
    if (/\b(sk|rk)_live_[0-9A-Za-z]{8,}/.test(text)) add(F, f, "clé Stripe LIVE en clair")
    if (/\bsk_test_[0-9A-Za-z]{16,}/.test(text)) add(isTest(f) ? W : F, f, "clé Stripe de test en clair")
    if (/\bwhsec_[0-9A-Za-z]{16,}/.test(text)) add(F, f, "secret de webhook Stripe en clair")
    if (/\bgh[pousr]_[0-9A-Za-z]{20,}|github_pat_[0-9A-Za-z_]{20,}/.test(text)) add(F, f, "jeton GitHub en clair")
    if (/postgres(ql)?:\/\/[^\s:'"@/]+:[^\s'"@]+@/.test(text)) add(F, f, "URL PostgreSQL avec mot de passe en clair")
    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) add(F, f, "clé privée en clair")
    if (!isTest(f) && /\bprice_[0-9A-Za-z]{14,}\b/.test(text)) add(F, f, "Price ID Stripe réel en dur (doit venir d'une variable d'environnement)")
    if (/\bacct_[0-9A-Za-z]{12,}\b/.test(text) && !isTest(f)) add(W, f, "identifiant de compte Stripe Connect en dur")

    // Migrations (fichiers ajoutés)
    if (/^scripts\/.*\.sql$/.test(f) && files.get(f) === "A") {
      const sql = text.replace(/--.*$/gm, "")
      if (/\b(DROP\s+(TABLE|COLUMN|INDEX|TYPE|SCHEMA|CONSTRAINT|VIEW|FUNCTION|TRIGGER|SEQUENCE|POLICY)|TRUNCATE|RENAME\s+(TO|COLUMN|CONSTRAINT)|ALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE|ALTER\s+COLUMN\s+\S+\s+SET\s+NOT\s+NULL)\b/i.test(sql)) add(F, f, "opération destructive ou bloquante (DROP/TRUNCATE/RENAME/changement de type/NOT NULL)")
      if (/\b(DELETE\s+FROM|UPDATE\s+\S+\s+SET|GRANT|REVOKE)\b/i.test(sql)) add(W, f, "modification de données ou de droits : validation humaine explicite requise dans le rapport")
      for (const m of sql.matchAll(/\bCREATE\s+(UNIQUE\s+)?(TABLE|INDEX|SEQUENCE|SCHEMA)\s+(?!IF\s+NOT\s+EXISTS)(CONCURRENTLY\s+(?!IF\s+NOT\s+EXISTS))?/gi)) add(F, f, `CREATE ${m[2].toUpperCase()} sans IF NOT EXISTS (non idempotent)`)
      if (/\bADD\s+COLUMN\s+(?!IF\s+NOT\s+EXISTS)/i.test(sql)) add(F, f, "ADD COLUMN sans IF NOT EXISTS (non idempotent)")
      if (/\bCREATE\s+TYPE\b/i.test(sql) && !/DO\s+\$\$|EXCEPTION\s+WHEN\s+duplicate_object/i.test(sql)) add(W, f, "CREATE TYPE non protégé contre la ré-exécution")
      if (!/^\s*--/.test(lines[0] || "")) add(W, f, "en-tête de commentaire de migration absent")
    }

    if (!src(f) || isTest(f)) continue
    const isEntry = /^app\/.*\/(actions|route)\.tsx?$/.test(f) || /^\s*["']use server["']/m.test(text)
    // Multi-tenant
    const tenantFromClient = /(formData\.get\(\s*["'](companyId|tenantId|company_id|tenant_id)["']|searchParams\.get\(\s*["'](companyId|tenantId)["']|\b(params|body|searchParams|query|headers|cookies)\??\.(companyId|tenantId)\b)/
    if (tenantFromClient.test(text)) add(f.startsWith("app/") ? F : W, f, "companyId/tenantId lu depuis une donnée client (URL, FormData, body) : il doit venir de requireCompanyMember()/requireAdminCompanyId()")
    if (/\brequireCompanyId\s*\(/.test(text) && /^(app\/admin\/|lib\/admin\/|app\/api\/admin\/)/.test(f)) add(F, f, "requireCompanyId() est réservé aux chemins PUBLICS : côté admin utiliser requireCompanyMember()/requireAdminCompanyId()")
    for (let i = 0; i < lines.length; i++) {
      if (/\.\s*(update|delete)\s*\(\s*[a-zA-Z_]/.test(lines[i]) && /\bdb\b|\btx\b/.test(lines.slice(Math.max(0, i - 2), i + 1).join(" "))) {
        const win = lines.slice(i, i + 10).join(" ")
        if (!/companyId|tenantId|company_id/.test(win)) add(W, f, `update/delete sans filtre companyId visible (ligne ajoutée « ${lines[i].trim().slice(0, 60)} »)`)
      }
    }
    // Stripe / argent
    if (matchesAny(f, MONEY_FILES)) {
      if (/\bparseFloat\s*\(|\.toFixed\s*\(|\*\s*100(?!\d)|\/\s*100(?!\d)/.test(text)) add(W, f, "calcul monétaire possiblement non entier (centimes et points de base attendus)")
      for (let i = 0; i < lines.length; i++) {
        if (/\.(create|confirm|capture|refund|transfer)\s*\(/.test(lines[i]) && /stripe/i.test(lines.slice(Math.max(0, i - 3), i + 1).join(" "))) {
          if (!/idempotencyKey/.test(lines.slice(i, i + 15).join(" "))) add(W, f, "appel Stripe d'écriture sans idempotencyKey visible")
        }
      }
    }
    if (/^\s*["']use client["']/m.test(text) && /process\.env\.(?!NEXT_PUBLIC_)[A-Z_]+/.test(text)) add(F, f, "variable d'environnement serveur utilisée dans un composant client")
    if (/NEXT_PUBLIC_[A-Z_]*(SECRET|PRIVATE|PASSWORD|DATABASE)/.test(text)) add(F, f, "secret exposé via une variable NEXT_PUBLIC_")
    if (/\/webhook\/route\.ts$/.test(f) && !/constructEvent|verifyWebhook|lifetime-webhook|subscription-webhook/.test(readSafe(f))) add(F, f, "route webhook sans vérification de signature Stripe visible")
    if (/^app\/api\/cron\//.test(f) && !/CRON_SECRET|verifyCron|isAuthorizedCron/.test(readSafe(f))) add(W, f, "route cron sans contrôle CRON_SECRET visible")
    if (isEntry && !GUARD_RX.test(readSafe(f))) add(W, f, "point d'entrée serveur sans garde d'authentification/tenant visible")
  }

  // Couverture par le plan approuvé
  if (approval) {
    for (const f of files.keys()) {
      if (riskOf(f) === "critique" && !matchesAny(f, approval.files || [])) add(F, f, "fichier CRITIQUE modifié hors de la liste approuvée : nouvelle approbation requise")
    }
  }
  // Tests
  const srcChanged = [...files.keys()].filter((f) => /^(app|lib|components|middleware)/.test(f) && src(f))
  const testsChanged = [...files.keys()].filter(isTest)
  return { F, W, srcChanged, testsChanged }
}

function readSafe(f) { try { return readFileSync(path.join(top, f), "utf8") } catch { return "" } }

// ------------------------------------------------------------------ exécution typecheck/tests
function scrubbedEnv() {
  const env = { ...process.env }
  for (const k of Object.keys(env)) {
    if (POLICY.secretEnvVars.includes(k) || /SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|PRIVATE_KEY|DATABASE_URL|^PG[A-Z]+$|^STRIPE_|^ALLMYSMS_/.test(k)) delete env[k]
  }
  env.CI = "1"
  env.DF_AGENT_RUN = "1"
  return env
}

function bin(name) {
  const p = path.join(top, "node_modules", ".bin", name)
  return existsSync(p) ? p : null
}

function runTypecheck() {
  const tsc = bin("tsc")
  if (!tsc) return { ok: false, summary: "tsc introuvable : dépendances non installées (le développeur doit lancer pnpm install)" }
  const r = spawnSync(tsc, ["--noEmit", "-p", "tsconfig.json"], { cwd: top, env: scrubbedEnv(), encoding: "utf8", timeout: 15 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 })
  const outp = `${r.stdout || ""}${r.stderr || ""}`
  const errs = outp.split("\n").filter((l) => /error TS\d+/.test(l))
  return { ok: r.status === 0, summary: r.status === 0 ? "OK" : `${errs.length} erreur(s)`, details: errs.slice(0, 15) }
}

function runTests(mode, relatedFiles) {
  const vitest = bin("vitest")
  if (!vitest) return { ok: false, summary: "vitest introuvable : dépendances non installées (le développeur doit lancer pnpm install)", failed: [] }
  const outFile = path.join(stateDir(top), `${LOT}.vitest.json`)
  const cfg = path.join(top, ".claude", "hooks", "vitest.agent.config.mjs")
  const base = mode === "quick" && relatedFiles.length ? ["related", "--run", ...relatedFiles] : ["run"]
  const r = spawnSync(vitest, [...base, "--config", cfg, "--reporter=json", `--outputFile=${outFile}`, "--passWithNoTests"], {
    cwd: top, env: scrubbedEnv(), encoding: "utf8", timeout: 30 * 60 * 1000, maxBuffer: 64 * 1024 * 1024,
  })
  const j = readJson(outFile)
  if (!j) return { ok: false, summary: `résultat vitest illisible (code ${r.status})`, failed: [], details: `${r.stderr || ""}`.split("\n").slice(-15) }
  const failed = []
  for (const tr of j.testResults || []) {
    const file = path.relative(top, tr.name || "").split(path.sep).join("/")
    const bad = (tr.assertionResults || []).filter((a) => a.status === "failed").map((a) => `${file} › ${a.fullName || a.title}`)
    if (bad.length) failed.push(...bad)
    else if (tr.status === "failed") failed.push(`${file} › (erreur de chargement du fichier)`)
  }
  return {
    ok: failed.length === 0 && (j.numFailedTestSuites ?? 0) === 0,
    summary: `${j.numPassedTests ?? "?"} réussis, ${j.numFailedTests ?? failed.length} échoués, ${j.numPendingTests ?? 0} ignorés (dont tests BDD/réseau sans configuration)`,
    failed,
  }
}

// ------------------------------------------------------------------ commandes
function nextAction(st) {
  switch (st.phase) {
    case "AUDIT": return `auditer, rédiger .lot-state/${LOT}.plan.md, puis « plan-ready ${LOT} »`
    case "PLAN_READY": return `ATTENDRE l'approbation humaine : le développeur lance « node .claude/hooks/dfguard.mjs approve ${LOT} » dans son terminal, puis « begin ${LOT} »`
    case "IMPLEMENTING": return `implémenter (tests d'abord), committer, puis « verify ${LOT} »`
    case "IMPLEMENTED": return `« pack ${LOT} » puis lancer uniquement les relecteurs indiqués`
    case "REVIEWED": return st.reviewOutcome === "OK" ? `« verify ${LOT} » final puis « done ${LOT} »` : `« fix ${LOT} » puis corriger les points BLOQUANT/MAJEUR`
    case "FIXING": return `corriger, committer, puis « verify ${LOT} »`
    case "VERIFIED": return `« done ${LOT} » puis rapport final`
    case "DONE": return "lot terminé : rapport final au développeur, rien d'autre à faire"
    case "BLOCKED": return `ARRÊT : limite de boucles atteinte ou incohérence. Faire un point au développeur (dfguard.mjs reset-loops ${LOT} pour relancer)`
    default: return "?"
  }
}

function statusCmd() {
  const st = load()
  if (!st) {
    out([`LOT ${LOT} : aucun état.`, lotIdFromBranch(branch) === LOT ? `Branche ${branch} OK → « start ${LOT} ».` : `Crée la branche : « git switch main && git switch -c lot/${LOT}-<slug> » puis « start ${LOT} ».`])
    return
  }
  const h = head()
  const dirty = (git(top, ["status", "--porcelain"]) || "").split("\n").filter((l) => l && !l.includes(".lot-state/"))
  const appr = existsSync(approvalPath(top, LOT)) ? readJson(approvalPath(top, LOT)) : null
  const planSha = sha256File(planPath(top, LOT))
  const lines = [
    `LOT ${LOT} — phase ${st.phase} — branche ${st.branch}${branch !== st.branch ? ` (ATTENTION : branche courante ${branch})` : ""}`,
    `HEAD ${short(h)} — base ${short(st.base)} — risque ${st.risk ?? "?"} — boucles de correction ${st.fixLoops ?? 0}/${POLICY.maxFixLoops}`,
    `Approbation : ${appr ? (appr.planSha256 === planSha ? `présente (risque ${appr.risk}${appr.risk === "critique" ? ", validée CRITIQUE" : ""})` : "PÉRIMÉE (plan modifié)") : "aucune"}`,
  ]
  if (st.lastVerify) lines.push(`Dernière vérification : ${st.lastVerify.result} @${short(st.lastVerify.head)}${st.lastVerify.head !== h ? " (HEAD a changé depuis)" : ""}`)
  if (st.reviews && Object.keys(st.reviews).length) lines.push(`Revues : ${Object.entries(st.reviews).map(([k, v]) => `${k}=${v.verdict}@${short(v.head)}`).join(", ")}`)
  if (dirty.length) lines.push(`Modifications non committées (${dirty.length}) : ${dirty.slice(0, 8).join(" | ")} → reprise : montrer ce diff au développeur avant de continuer`)
  lines.push(`Prochaine action : ${nextAction(st)}`)
  out(lines)
}

function startCmd() {
  if (lotIdFromBranch(branch) !== LOT) fail(`la branche courante doit être lot/${LOT}-<slug> (actuelle : ${branch})`)
  const ex = load()
  if (ex) { out(`État déjà présent (phase ${ex.phase}) : rien à recréer.`); return statusCmd() }
  const base = git(top, ["merge-base", "main", "HEAD"]) || head()
  const st = { lot: LOT, branch, base, phase: "AUDIT", risk: null, fixLoops: 0, reReviews: 0, reviews: {}, createdAt: now(), kitVersion: POLICY.kitVersion }
  log(st, "start")
  save(st)
  out(`LOT ${LOT} démarré sur ${branch} (base ${short(base)}). Prochaine action : ${nextAction(st)}`)
}

function baselineCmd() {
  const st = requireState(); requireBranch(st)
  if (st.baseline && !opts.has("--force")) { out(`Baseline déjà enregistrée (${st.baseline.failed.length} test(s) en échec avant le lot).`); return }
  const changed = changedFiles(st.base)
  if (changed.size) fail("la baseline doit être prise AVANT toute modification (des changements existent déjà)")
  const t = runTests("full", [])
  st.baseline = { at: now(), head: head(), summary: t.summary, failed: t.failed, ok: t.ok }
  log(st, "baseline")
  save(st)
  out([`Baseline : ${t.summary}`, ...(t.failed.length ? ["Déjà en échec AVANT le lot (ne pas les corriger sans accord) :", ...t.failed.slice(0, 20).map((x) => `  - ${x}`)] : [])])
}

function planReadyCmd() {
  const st = requireState(); requireBranch(st)
  if (!["AUDIT", "PLAN_READY"].includes(st.phase)) fail(`phase ${st.phase} : le plan ne peut plus être modifié sans nouvelle approbation`)
  const p = planPath(top, LOT)
  if (!existsSync(p)) fail(`plan absent : écris .lot-state/${LOT}.plan.md`)
  const text = readFileSync(p, "utf8")
  const missing = ["Objectif", "Fichiers", "Tests", "Risque", "Décisions"].filter((s) => !new RegExp(`^##\\s+${s}`, "im").test(text))
  if (missing.length) fail(`sections manquantes dans le plan : ${missing.map((s) => `## ${s}`).join(", ")}`)
  const files = planFiles(text)
  if (!files.length) fail("la section « ## Fichiers » ne liste aucun fichier (`chemin` par ligne)")
  if (/\[ \]/.test(text.split(/^##\s+Décisions/im)[1]?.split(/^##\s/m)[0] || "")) fail("des décisions sont encore à confirmer ([ ]) : pose les questions au développeur, n'invente rien")
  const computed = maxRisk(files.map(riskOf))
  const declared = planDeclaredRisk(text)
  const risk = declared && riskRank(declared) > riskRank(computed) ? declared : computed
  st.phase = "PLAN_READY"; st.risk = risk; st.planSha256 = sha256(text)
  log(st, `plan-ready risque=${risk}`)
  save(st)
  const crit = files.filter((f) => riskOf(f) === "critique")
  out([
    `PLAN ${LOT} prêt — risque ${risk.toUpperCase()}${declared && declared !== risk ? ` (déclaré ${declared}, recalculé ${risk})` : ""}`,
    `Fichiers : ${files.length}${crit.length ? ` dont CRITIQUES : ${crit.join(", ")}` : ""}`,
    `Relecteurs prévus : ${REVIEWERS_BY_RISK[risk].join(", ") || "aucun (contrôles automatiques seulement)"}`,
    `STOP. Présente le plan au développeur. Il approuve dans SON terminal : node .claude/hooks/dfguard.mjs approve ${LOT}`,
  ])
}

function beginCmd() {
  const st = requireState(); requireBranch(st)
  if (st.phase === "IMPLEMENTING") { out("Déjà en implémentation."); return }
  if (st.phase !== "PLAN_READY") fail(`phase ${st.phase} : « begin » n'est possible qu'après « plan-ready »`)
  const a = readJson(approvalPath(top, LOT))
  if (!a) fail(`aucune approbation. Le développeur doit lancer : node .claude/hooks/dfguard.mjs approve ${LOT}`)
  if (a.planSha256 !== sha256File(planPath(top, LOT))) fail("approbation périmée : le plan a changé depuis")
  st.phase = "IMPLEMENTING"; st.risk = a.risk; st.approvedFiles = a.files
  log(st, "begin")
  save(st)
  out(`Implémentation autorisée (risque ${a.risk}). Fichiers critiques modifiables : ${(a.files || []).filter((f) => riskOf(f) === "critique").join(", ") || "aucun"}.`)
}

function verifyCmd() {
  const st = requireState(); requireBranch(st)
  if (!["IMPLEMENTING", "IMPLEMENTED", "REVIEWED", "FIXING", "VERIFIED"].includes(st.phase)) fail(`phase ${st.phase} : rien à vérifier`)
  const quick = opts.has("--quick")
  const files = changedFiles(st.base)
  if (!files.size) fail("aucun changement par rapport à la base")
  const approval = readJson(approvalPath(top, LOT))
  const risk = maxRisk([...files.keys()].map(riskOf))
  const added = addedLinesByFile(st.base, files)
  const { F, W, srcChanged, testsChanged } = staticChecks(files, added, approval)
  if (approval && riskRank(risk) > riskRank(approval.risk)) F.push(`risque réel ${risk} > risque approuvé ${approval.risk} : nouvelle approbation requise`)
  if (srcChanged.length && !testsChanged.length) (risk === "critique" ? F : W).push(`aucun test ajouté/modifié alors que ${srcChanged.length} fichier(s) source ont changé`)
  if (sha256File(path.join(top, "vitest.config.ts")) !== POLICY.vitestConfigSha256) W.push("vitest.config.ts a changé depuis l'installation du kit : faire vérifier .claude/hooks/vitest.agent.config.mjs par le développeur")
  const dirty = (git(top, ["status", "--porcelain"]) || "").split("\n").filter((l) => l && !l.includes(".lot-state/"))
  if (dirty.length && !quick) F.push(`${dirty.length} modification(s) non committée(s) : committer avant la vérification complète`)

  const tc = runTypecheck()
  if (!tc.ok) F.push(`typecheck : ${tc.summary}`)
  const related = [...files.keys()].filter((f) => /\.(ts|tsx)$/.test(f) && existsSync(path.join(top, f)))
  const tests = runTests(quick ? "quick" : "full", related)
  const base = new Set(st.baseline?.failed || [])
  const newFails = tests.failed.filter((x) => !base.has(x))
  const oldFails = tests.failed.filter((x) => base.has(x))
  if (!tests.failed.length && !tests.ok) F.push(`tests : ${tests.summary}`)
  if (newFails.length) F.push(`tests : ${newFails.length} NOUVEL(S) échec(s)`)
  if (oldFails.length) W.push(`${oldFails.length} test(s) déjà en échec avant le lot (baseline)`)
  if (!st.baseline) W.push("pas de baseline : impossible de distinguer les échecs préexistants")

  const result = F.length ? "ECHEC" : "OK"
  const h = head()
  const rep = { at: now(), head: h, quick, result, risk, F, W, typecheck: tc.summary, tests: tests.summary, newFails, files: [...files.keys()] }
  writeFileSync(path.join(stateDir(top), `${LOT}.verify.json`), JSON.stringify(rep, null, 2) + "\n")
  if (!quick) {
    st.lastVerify = { head: h, result, at: rep.at }
    st.verifyFailsInRow = result === "OK" ? 0 : (st.verifyFailsInRow || 0) + 1
    if (st.verifyFailsInRow >= 3) { st.blockedFrom = st.phase; st.phase = "BLOCKED"; F.push("3 vérifications complètes en échec d'affilée : ARRÊT, point avec le développeur") }
    if (result === "OK" && st.phase === "IMPLEMENTING") st.phase = "IMPLEMENTED"
    if (result === "OK" && st.phase === "FIXING") st.phase = "VERIFIED"
    if (result === "OK" && st.phase === "REVIEWED" && st.reviewOutcome === "OK") st.phase = "VERIFIED"
  }
  st.risk = maxRisk([st.risk || "faible", risk])
  log(st, `verify${quick ? "-quick" : ""} ${result}`)
  save(st)
  out([
    `VERIFY ${LOT}${quick ? " (rapide)" : ""} @${short(h)} — risque ${risk} — RÉSULTAT : ${result}`,
    `Typecheck : ${tc.summary} | Tests : ${tests.summary}`,
    ...F.map((x) => `  BLOQUANT ${x}`),
    ...W.map((x) => `  ATTENTION ${x}`),
    ...newFails.slice(0, 15).map((x) => `  échec : ${x}`),
    ...(tc.details && !tc.ok ? tc.details.slice(0, 8).map((x) => `  ${x}`) : []),
    `Phase : ${st.phase}. Prochaine action : ${nextAction(st)}`,
  ])
  process.exit(result === "OK" ? 0 : 1)
}

function packCmd() {
  const st = requireState(); requireBranch(st)
  if (!["IMPLEMENTED", "REVIEWED", "FIXING", "VERIFIED"].includes(st.phase)) fail(`phase ${st.phase} : la revue se fait après une vérification réussie`)
  const h = head()
  if (st.lastVerify?.head !== h || st.lastVerify?.result !== "OK") fail(`HEAD ${short(h)} n'a pas de vérification complète OK : lance « verify ${LOT} » d'abord`)
  const needed = REVIEWERS_BY_RISK[st.risk || "faible"]
  const already = needed.filter((r) => st.reviews?.[r]?.head === h)
  const postFix = (st.fixLoops || 0) > 0 && Object.keys(st.reviews || {}).length > 0
  // Après correction : on ne relance QUE les relecteurs qui avaient un BLOQUANT (+ le vérificateur si lot critique).
  const todo = (postFix
    ? needed.filter((r) => (st.reviews?.[r]?.bloquants > 0 && st.reviews[r].verdict !== "OK") || (r === "verificateur" && st.risk === "critique"))
    : needed
  ).filter((r) => !already.includes(r))
  const sinceReview = Object.values(st.reviews || {}).filter((r) => r.verdict === "A_CORRIGER").map((r) => r.head).pop()
  const files = changedFiles(st.base)
  const diffBase = opts.has("--delta") && sinceReview ? sinceReview : st.base
  const diff = git(top, ["diff", "--no-renames", "--stat", diffBase]) || ""
  const fullDiff = git(top, ["diff", "--no-renames", "-U5", diffBase, "--", ".", ":(exclude).lot-state"]) || ""
  const verify = readJson(path.join(stateDir(top), `${LOT}.verify.json`)) || {}
  const pack = [
    `# Dossier de revue ${LOT} @${short(h)} (risque ${st.risk})`,
    "", `Fiche : docs/lots/${LOT}-*.md — Plan approuvé : .lot-state/${LOT}.plan.md`,
    "", "## Fichiers modifiés", ...[...files].map(([f, s]) => `- ${s} \`${f}\` (${riskOf(f)})`),
    "", "## Contrôles automatiques (déjà faits, ne pas refaire)", `- Typecheck : ${verify.typecheck}`, `- Tests : ${verify.tests}`,
    ...(verify.W || []).map((x) => `- ATTENTION ${x}`),
    "", `## Diff (${diffBase === st.base ? "complet depuis la base" : "delta depuis la dernière revue"})`, "```", diff, "```", "", "```diff", fullDiff.length > 400000 ? fullDiff.slice(0, 400000) + "\n[… diff tronqué : lire les fichiers concernés]" : fullDiff, "```",
  ]
  writeFileSync(path.join(stateDir(top), `${LOT}.review.md`), pack.join("\n") + "\n")
  out([
    `Dossier de revue : .lot-state/${LOT}.review.md (${files.size} fichiers, ${Math.round(fullDiff.length / 1024)} Ko de diff)`,
    `Relecteurs requis pour le risque ${st.risk} : ${needed.join(", ") || "aucun"}`,
    already.length ? `Déjà relus à ce HEAD (NE PAS relancer) : ${already.join(", ")}` : "",
    todo.length ? `À lancer (en parallèle, avec l'id du lot uniquement) : ${todo.join(", ")}` : "Aucun relecteur à lancer.",
  ].filter(Boolean))
}

function reviewCmd() {
  const st = requireState(); requireBranch(st)
  const [agent, verdict, bloq = "0", maj = "0"] = args
  if (!["revue-metier", "revue-securite", "verificateur"].includes(agent)) fail("agent attendu : revue-metier | revue-securite | verificateur")
  if (!["OK", "A_CORRIGER"].includes(verdict)) fail("verdict attendu : OK | A_CORRIGER")
  const h = head()
  const prev = st.reviews?.[agent]
  const count = (prev?.count || 0) + 1
  if (count > 1 + POLICY.maxReReviews) {
    st.blockedFrom = st.phase; st.phase = "BLOCKED"; log(st, `blocked re-review ${agent}`); save(st)
    fail(`${agent} a déjà été relancé ${POLICY.maxReReviews} fois : arrêt et point avec le développeur`, 3)
  }
  st.reviews = { ...(st.reviews || {}), [agent]: { verdict, head: h, bloquants: Number(bloq) || 0, majeurs: Number(maj) || 0, count, at: now() } }
  const needed = REVIEWERS_BY_RISK[st.risk || "faible"]
  const done = needed.filter((r) => st.reviews[r]?.head === h)
  if (done.length === needed.length) {
    st.phase = "REVIEWED"
    st.reviewOutcome = needed.every((r) => st.reviews[r].verdict === "OK") ? "OK" : "A_CORRIGER"
  }
  log(st, `review ${agent} ${verdict}`)
  save(st)
  out(`Revue ${agent} enregistrée (${verdict}). ${st.phase === "REVIEWED" ? `Toutes les revues sont faites : ${st.reviewOutcome}.` : `En attente : ${needed.filter((r) => !done.includes(r)).join(", ")}`} Prochaine action : ${nextAction(st)}`)
}

function fixCmd() {
  const st = requireState(); requireBranch(st)
  if (!["REVIEWED", "FIXING", "IMPLEMENTED"].includes(st.phase)) fail(`phase ${st.phase} : pas de correction à ouvrir`)
  st.fixLoops = (st.fixLoops || 0) + 1
  if (st.fixLoops > POLICY.maxFixLoops) {
    st.blockedFrom = st.phase; st.phase = "BLOCKED"; log(st, "blocked fix-loops"); save(st)
    fail(`limite de ${POLICY.maxFixLoops} boucles de correction atteinte : ARRÊTE et fais un point au développeur`, 3)
  }
  st.phase = "FIXING"
  log(st, `fix ${st.fixLoops}`)
  save(st)
  out(`Boucle de correction ${st.fixLoops}/${POLICY.maxFixLoops}. Corrige les BLOQUANT et MAJEUR, ajoute un test par bug, committe, puis « verify ${LOT} ». Ne relance ensuite QUE le relecteur qui avait un BLOQUANT, avec « pack ${LOT} --delta ».`)
}

function doneCmd() {
  const st = requireState(); requireBranch(st)
  const h = head()
  if (st.lastVerify?.head !== h || st.lastVerify?.result !== "OK") fail(`pas de vérification complète OK à HEAD ${short(h)} : « verify ${LOT} »`)
  const needed = REVIEWERS_BY_RISK[st.risk || "faible"]
  const missing = needed.filter((r) => !st.reviews?.[r])
  if (missing.length) fail(`revues manquantes : ${missing.join(", ")}`)
  for (const r of needed) {
    const rv = st.reviews[r]
    if (rv.verdict === "OK") continue
    if (rv.bloquants > 0) fail(`${r} a remonté ${rv.bloquants} BLOQUANT(S) : après correction, relance UNIQUEMENT ${r} sur le delta (« pack ${LOT} --delta ») pour qu'il confirme`)
    if ((st.fixLoops || 0) < 1) fail(`${r} a demandé des corrections (MAJEUR/MINEUR) : « fix ${LOT} », corrige, puis « verify ${LOT} »`)
  }
  if (st.risk === "critique" && (st.fixLoops || 0) > 0 && !(st.reviews.verificateur?.verdict === "OK" && st.reviews.verificateur.head === h)) {
    fail("lot CRITIQUE corrigé après revue : le verificateur doit confirmer à ce HEAD (« pack " + LOT + " » puis lancer verificateur)")
  }
  st.phase = "DONE"
  log(st, "done")
  save(st)
  const commits = git(top, ["log", "--oneline", `${st.base}..HEAD`]) || ""
  out([`LOT ${LOT} TERMINÉ @${short(h)} (risque ${st.risk}).`, "Commits :", commits, st.risk === "critique" ? "LOT CRITIQUE : le rapport doit demander une relecture humaine ligne à ligne avant push." : ""].filter(Boolean))
}

const CMDS = { status: statusCmd, start: startCmd, baseline: baselineCmd, "plan-ready": planReadyCmd, begin: beginCmd, verify: verifyCmd, pack: packCmd, review: reviewCmd, fix: fixCmd, done: doneCmd }
if (!CMDS[cmd]) fail(`commande inconnue « ${cmd} » (voir help)`)
CMDS[cmd]()
