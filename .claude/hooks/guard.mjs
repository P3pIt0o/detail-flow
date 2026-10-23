#!/usr/bin/env node
// Garde DetailFlow — hook PreToolUse (et SessionStart avec --session-start).
// Lit l'appel d'outil sur stdin et refuse ce qui est dangereux AVANT exécution.
// Configuré avec onFailure:"block" : si ce script plante, l'action est bloquée (fail-closed).
import { existsSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  POLICY, coveredByApproval, git, hasApprovalKey, isEnvFile, isKitProtected, isProtectedBranch,
  isSecretPath, lotIdFromBranch, planPath, readJson, repoInfo, riskOf, statePath, verifyApproval,
} from "./lib.mjs"

const READONLY_AGENTS = new Set(["revue-securite", "revue-metier", "verificateur"])

// ------------------------------------------------------------------ sortie
function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: `[Garde DetailFlow] ${reason}`,
    },
  }))
  process.exit(0)
}
const pass = () => process.exit(0) // aucune décision : règles de permission + sandbox s'appliquent

// ------------------------------------------------------------------ contexte
function computeContext(input) {
  const cwd = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd()
  const { top, branch } = repoInfo(cwd)
  const agentType = input.agent_type || null
  const ctx = { cwd, top, branch, agentType, lot: null, approval: null, mode: "write", why: "" }
  if (!top) { ctx.mode = "readonly"; ctx.why = "dossier hors dépôt git"; return ctx }
  if (agentType && READONLY_AGENTS.has(agentType)) { ctx.mode = "readonly"; ctx.why = `l'agent ${agentType} est en lecture seule`; return ctx }
  if (isProtectedBranch(branch)) {
    ctx.mode = "readonly"
    ctx.why = branch ? `la branche ${branch} est protégée : crée d'abord une branche de travail` : "HEAD détachée"
    return ctx
  }
  const lot = lotIdFromBranch(branch)
  if (lot) {
    ctx.lot = lot
    const v = verifyApproval(top, lot, branch)
    if (v.ok) { ctx.mode = "write-lot"; ctx.approval = v.approval }
    else { ctx.mode = "plan-only"; ctx.why = `lot ${lot} non approuvé (${v.reason}). Rédige le plan dans .lot-state/${lot}.plan.md puis attends l'approbation humaine` }
  } else if (/^lot\//.test(branch)) {
    ctx.mode = "readonly"; ctx.why = `nom de branche de lot invalide (attendu lot/L<n>-<slug>)`
  }
  return ctx
}

// ------------------------------------------------------------------ fichiers
function relToTop(ctx, abs) {
  const rel = path.relative(ctx.top, abs)
  return rel.startsWith("..") || path.isAbsolute(rel) ? null : rel.split(path.sep).join("/")
}

function checkWrite(ctx, filePath) {
  if (!filePath) deny("chemin de fichier manquant")
  const abs = path.resolve(ctx.cwd, filePath)
  if (isSecretPath(abs)) deny(`écriture interdite sur un fichier sensible (${path.basename(abs)})`)
  const rel = ctx.top ? relToTop(ctx, abs) : null
  if (rel === null) {
    const tmp = path.resolve(tmpdir())
    if (abs.startsWith(tmp + path.sep)) return pass()
    deny("écriture hors du dépôt interdite (seul le dossier temporaire est autorisé)")
  }
  const isPlan = ctx.lot && (rel === `.lot-state/${ctx.lot}.plan.md` || rel === `.lot-state/${ctx.lot}.notes.md` || rel === `.lot-state/${ctx.lot}.apercu.html`)
  if (isKitProtected(rel) && !isPlan) {
    deny(`« ${rel} » fait partie du kit ou de l'état du workflow : seul le développeur peut le modifier`)
  }
  if (ctx.mode === "readonly") deny(`écriture refusée : ${ctx.why}`)
  if (ctx.mode === "plan-only") {
    if (isPlan) return pass()
    deny(`écriture refusée : ${ctx.why}`)
  }
  if (ctx.mode === "write-lot") {
    if (isPlan) return pass()
    if (riskOf(rel) === "critique" && !coveredByApproval(rel, ctx.approval)) {
      deny(`« ${rel} » est un fichier CRITIQUE absent de la liste approuvée du plan ${ctx.lot}. Ajoute-le au plan (section « ## Fichiers ») et demande une nouvelle approbation`)
    }
  }
  return pass()
}

function checkRead(ctx, filePath) {
  if (!filePath) return pass()
  const abs = path.resolve(ctx.cwd, filePath)
  if (isSecretPath(abs)) deny(`lecture interdite d'un fichier sensible (${path.basename(abs)})`)
  return pass()
}

function checkSearch(ctx, ti) {
  const p = ti.path ? path.resolve(ctx.cwd, ti.path) : null
  if (p && isSecretPath(p)) deny("recherche interdite dans un emplacement sensible")
  for (const g of [ti.glob, ti.pattern && ti.tool === "Glob" ? ti.pattern : null, ti.type === "env" ? ".env" : null]) {
    if (g && /(^|[/*{,])\.env(?!\.example)(\b|[.*{])/.test(String(g))) deny("recherche ciblant des fichiers .env interdite")
  }
  return pass()
}

// ------------------------------------------------------------------ Bash
function splitSegments(cmd) {
  const segs = []
  let cur = "", q = null, subst = false, redirect = false
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i], n = cmd[i + 1]
    if (q) {
      if (c === "\\" && q === '"') { cur += c + (n ?? ""); i++; continue }
      if (q === '"' && (c === "`" || (c === "$" && n === "("))) subst = true
      if (c === q) q = null
      cur += c
      continue
    }
    if (c === "\\") { cur += c + (n ?? ""); i++; continue }
    if (c === "'" || c === '"') { q = c; cur += c; continue }
    if (c === "`" || (c === "$" && n === "(") || (c === "<" && n === "(") || (c === ">" && n === "(")) subst = true
    if (c === ">") {
      const rest = cmd.slice(i + 1)
      if (!/^&[12-]/.test(rest) && !/^>?\s*\/dev\/null/.test(rest)) redirect = true
    }
    if (c === "\n" || c === ";" || (c === "&" && n === "&") || (c === "|" && n === "|") || c === "|" || (c === "&" && n !== ">" && cmd[i - 1] !== ">")) {
      if (cur.trim()) segs.push(cur.trim())
      cur = ""
      if ((c === "&" && n === "&") || (c === "|" && n === "|")) i++
      continue
    }
    cur += c
  }
  if (cur.trim()) segs.push(cur.trim())
  return { segs, subst, redirect }
}

function tokenize(seg) {
  const out = []
  let cur = "", q = null, has = false
  for (let i = 0; i < seg.length; i++) {
    const c = seg[i]
    if (q) { if (c === q) q = null; else cur += c; continue }
    if (c === "'" || c === '"') { q = c; has = true; continue }
    if (c === "\\") { cur += seg[i + 1] ?? ""; i++; has = true; continue }
    if (/\s/.test(c)) { if (cur || has) out.push(cur); cur = ""; has = false; continue }
    cur += c; has = true
  }
  if (cur || has) out.push(cur)
  return out
}

const SECRET_VAR_RX = new RegExp(String.raw`\$\{?(?:` + [
  ...POLICY.secretEnvVars,
  String.raw`[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|PRIVATE_KEY)[A-Z0-9_]*`,
].join("|") + String.raw`)\b`)
const ENV_FILE_RX = /(^|[\s/'"=<>:(])\.env(\.(?!example(?=$|[\s'";|&)<>]))[\w.-]+)?(?=$|[\s'";|&)<>/])/
const SECRET_PATH_RX = /(\.ssh(\/|\b)|\.aws\/|\.config\/(gh|stripe|neonctl|detailflow-guard)|detailflow-guard|\.git-credentials|\.netrc|\.npmrc|\.pgpass|(^|[\s/'"])\.vercel(\/|\b)|com\.vercel\.cli|\.credentials\.json|\.claude\.json|id_rsa|id_ed25519|id_ecdsa|\.pem\b|\/proc\/[^\s]*\/environ|\.git\/config)/
const LIVE_SECRET_RX = /\b(sk|rk)_live_[0-9A-Za-z]{8,}|\bwhsec_[0-9A-Za-z]{8,}|\bgh[pousr]_[0-9A-Za-z]{20,}|github_pat_[0-9A-Za-z_]{20,}/
const KIT_PATH_RX = /(\.claude\/|(^|[\s/'"])CLAUDE\.md\b|\.mcp\.json|\.lot-state\b|(^|[\s'"])\.git\/)/

const DENY_COMMANDS = new Map(Object.entries({
  gh: "CLI GitHub", hub: "CLI GitHub", vercel: "CLI Vercel (déploiement)", netlify: "déploiement",
  stripe: "CLI Stripe", neonctl: "CLI Neon", psql: "client PostgreSQL", pg_dump: "client PostgreSQL",
  pg_dumpall: "client PostgreSQL", pg_restore: "client PostgreSQL", pgcli: "client PostgreSQL",
  createdb: "client PostgreSQL", dropdb: "client PostgreSQL", "drizzle-kit": "migrations Drizzle",
  prisma: "migrations Prisma", supabase: "CLI base de données", heroku: "déploiement", flyctl: "déploiement",
  fly: "déploiement", railway: "déploiement", aws: "cloud", gcloud: "cloud", gsutil: "cloud", bq: "cloud",
  az: "cloud", doctl: "cloud", docker: "conteneurs", podman: "conteneurs", kubectl: "cloud", helm: "cloud",
  terraform: "cloud", ssh: "réseau", scp: "réseau", sftp: "réseau", rsync: "réseau", nc: "réseau",
  ncat: "réseau", netcat: "réseau", socat: "réseau", telnet: "réseau", ftp: "réseau", curl: "réseau",
  wget: "réseau", http: "réseau", https: "réseau", xh: "réseau", sudo: "élévation de privilèges",
  su: "élévation de privilèges", doas: "élévation de privilèges", pkexec: "élévation de privilèges",
  crontab: "tâches planifiées", systemctl: "services système", service: "services système",
  eval: "exécution indirecte", source: "exécution indirecte", ".": "exécution indirecte",
  exec: "exécution indirecte", npx: "exécution de paquet arbitraire", pnpx: "exécution de paquet arbitraire",
  bunx: "exécution de paquet arbitraire", tsx: "exécution de scripts TypeScript (scripts/ touchent Stripe/BDD)",
  "ts-node": "exécution de scripts TypeScript", deno: "interpréteur", bun: "interpréteur",
  python: "interpréteur", python3: "interpréteur", perl: "interpréteur", ruby: "interpréteur", php: "interpréteur",
  bash: "shell imbriqué", sh: "shell imbriqué", zsh: "shell imbriqué", dash: "shell imbriqué", ksh: "shell imbriqué",
  fish: "shell imbriqué", yarn: "gestionnaire de paquets non utilisé par le projet", printenv: "lecture des variables d'environnement",
  compgen: "lecture des variables d'environnement", gpg: "clés", "xdg-open": "ouverture externe",
}))

const WRAPPERS = new Set(["time", "nice", "nohup", "command", "builtin", "stdbuf"])

/** Retire assignations VAR=... et préfixes neutres ; renvoie [tokens, assignations]. */
function unwrap(tokens) {
  const assigns = []
  let t = tokens.slice()
  for (;;) {
    while (t.length && /^\(+$/.test(t[0])) t.shift()
    if (t.length && /^\(/.test(t[0])) t[0] = t[0].replace(/^\(+/, "")
    while (t.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(t[0])) assigns.push(t.shift())
    if (!t.length) break
    if (WRAPPERS.has(t[0])) { t.shift(); continue }
    if (t[0] === "timeout") { t.shift(); while (t.length && /^-|^[0-9.]+[smhd]?$/.test(t[0])) t.shift(); continue }
    if (t[0] === "env") {
      t.shift()
      while (t.length && (/^-/.test(t[0]) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(t[0]))) {
        if (/^-/.test(t[0])) { if (["-u", "--unset", "-C", "--chdir", "-S", "--split-string"].includes(t[0])) t.shift(); t.shift() } else assigns.push(t.shift())
      }
      if (!t.length) return [["env"], assigns]
      continue
    }
    if (t[0] === "xargs") {
      t.shift()
      while (t.length && /^-/.test(t[0])) { const o = t.shift(); if (/^-(n|I|P|L|s|d|E|a)$/.test(o)) t.shift() }
      continue
    }
    break
  }
  return [t, assigns]
}

const GIT_DENY = new Set(["push", "merge", "rebase", "pull", "fetch", "filter-branch", "filter-repo", "update-ref",
  "replace", "am", "clean", "gc", "prune", "credential", "credential-store", "credential-cache", "submodule",
  "tag", "send-email", "request-pull", "bundle", "remote-https", "daemon", "http-backend", "p4", "svn",
  "fast-import", "symbolic-ref", "notes", "maintenance", "lfs", "archive"])
const GIT_READONLY = new Set(["status", "diff", "log", "show", "rev-parse", "ls-files", "ls-tree", "merge-base",
  "blame", "grep", "shortlog", "describe", "cat-file", "rev-list", "name-rev", "whatchanged", "count-objects", "--version", "version"])

function gitSub(tokens) {
  // tokens[0] === "git"
  let i = 1
  while (i < tokens.length && tokens[i].startsWith("-")) {
    const o = tokens[i]
    if (o === "-c" || o.startsWith("--config-env") || o.startsWith("--exec-path") || o.startsWith("--git-dir") ||
      o.startsWith("--work-tree") || o === "--namespace" || o.startsWith("--super-prefix")) {
      return { sub: "__option__", opt: o, args: [] }
    }
    if (o === "-C") i += 2; else i += 1
  }
  return { sub: tokens[i] ?? "", args: tokens.slice(i + 1) }
}

function checkGit(ctx, tokens, readonly) {
  const { sub, args, opt } = gitSub(tokens)
  if (sub === "__option__") return `option git ${opt} interdite (injection de configuration)`
  if (GIT_DENY.has(sub)) return `« git ${sub} » est interdit : push, merge, rebase, fetch/pull et tags sont réservés au développeur`
  const a = args.join(" ")
  if (sub === "reset" && /--hard|--merge|--keep/.test(a)) return "« git reset --hard » est interdit (perte de travail)"
  if (sub === "config" && !/(^|\s)(--get|--get-all|--get-regexp|--list|-l)(\s|$)/.test(a)) return "modification de la configuration git interdite"
  if (sub === "remote" && args.length && !/^(-v|--verbose|show|get-url)$/.test(args[0])) return "modification des remotes git interdite"
  if (sub === "stash" && /^(drop|clear|pop)$/.test(args[0] ?? "")) return `« git stash ${args[0]} » interdit (perte de travail possible)`
  if (sub === "branch") {
    if (/(^|\s)(-d|-D|--delete|-m|-M|--move|-c|-C|--copy|-f|--force|-u|--set-upstream-to|--unset-upstream|--edit-description)(\s|$)/.test(a)) return "suppression, renommage ou forçage de branche interdit"
    const created = args.filter((x) => !x.startsWith("-"))
    if (created.length && !args.some((x) => /^(--list|-l|-a|-r|-v|-vv|--show-current|--contains|--merged|--no-merged|--points-at|--sort=.*|--format=.*)$/.test(x))) {
      if (created.some((b) => isProtectedBranch(b) || !/^(lot\/L[0-9]+-[a-z0-9-]+|wip\/[a-z0-9-]+)$/.test(b))) return "création de branche limitée à lot/L<n>-<slug>"
    }
  }
  if (sub === "switch" || sub === "checkout") {
    if (/(^|\s)(-C|-B|--force-create|-f|--force|--discard-changes|--orphan|--detach|-t|--track|-p|--patch|--ours|--theirs)(\s|$)/.test(a)) return `options de « git ${sub} » interdites (écrasement ou détachement)`
    const ci = args.findIndex((x) => x === "-c" || x === "-b" || x === "--create")
    if (ci >= 0) {
      const name = args[ci + 1] ?? ""
      if (!/^lot\/L[0-9]+-[a-z0-9-]+$/.test(name)) return "création de branche limitée au format lot/L<n>-<slug>"
    }
    if (sub === "checkout" && readonly) {
      const ok = (args.length === 2 && args[0] === "-b") ||
        (args.length === 1 && !args[0].startsWith("-") && git(ctx.top, ["show-ref", "--verify", "--quiet", `refs/heads/${args[0]}`]) !== null)
      if (!ok) return "en lecture seule, git checkout sert uniquement à changer de branche"
    }
  }
  if (sub === "commit" || sub === "revert" || sub === "cherry-pick" || sub === "restore" || sub === "rm" || sub === "mv" || sub === "apply" || sub === "add" || sub === "worktree" || sub === "init" || sub === "clone") {
    if (sub === "init" || sub === "clone") return `« git ${sub} » interdit dans ce dépôt`
    if (readonly) return `« git ${sub} » refusé : ${ctx.why}`
    if (sub === "commit" && isProtectedBranch(ctx.branch)) return "commit interdit sur une branche protégée"
    if (sub === "worktree" && /(^|\s)(remove|prune|move)(\s|$)/.test(a)) return "suppression ou déplacement de worktree interdit"
  }
  if (readonly && !GIT_READONLY.has(sub) && !["branch", "switch", "checkout", "stash"].includes(sub)) return `« git ${sub} » refusé : ${ctx.why}`
  if (readonly && sub === "stash" && !/^(list|show)$/.test(args[0] ?? "list")) return `« git stash » refusé : ${ctx.why}`
  return null
}

const RO_SIMPLE = new Set(["ls", "cat", "head", "tail", "wc", "grep", "egrep", "fgrep", "rg", "sort", "uniq", "cut", "tr",
  "jq", "diff", "cmp", "stat", "file", "pwd", "echo", "printf", "true", "false", "test", "[", "which", "type", "tree",
  "du", "df", "basename", "dirname", "realpath", "readlink", "date", "sha256sum", "md5sum", "column", "nl", "cd", "comm", "paste", "fold"])

function checkPnpm(tokens, readonly) {
  const sub = tokens[1] ?? ""
  if (sub === "test" || sub === "t") return null
  if (sub === "--version" || sub === "-v" || sub === "ls" || sub === "list" || sub === "why") return null
  if (sub === "exec") {
    const bin = tokens[2] ?? ""
    if (bin === "vitest" || bin === "tsc") return null
    return `« pnpm exec ${bin} » interdit (seuls vitest et tsc sont autorisés)`
  }
  if (["install", "i", "add", "remove", "rm", "uninstall", "update", "up"].includes(sub)) {
    if (readonly) return "modification des dépendances refusée en lecture seule"
    if (tokens.some((t) => /^--(ignore-scripts=false|unsafe-perm)$/.test(t))) return "options d'installation dangereuses"
    return null // soumis à confirmation par les règles « ask » de settings.json
  }
  if (sub === "build" || sub === "typecheck") return readonly ? "build refusé en lecture seule" : null
  return `« pnpm ${sub} » interdit (scripts arbitraires, dlx, run, dev, publish…). Utilise pnpm test / pnpm exec vitest / pnpm exec tsc`
}

function checkNode(tokens) {
  const a1 = tokens[1] ?? ""
  if (a1 === "--version" || a1 === "-v") return null
  const script = a1.replace(/^\.\//, "")
  if (script === ".claude/hooks/lot.mjs") return null
  if (/(^|\/)\.claude\/hooks\/dfguard\.mjs$/.test(script)) return "dfguard.mjs est réservé au développeur (approbations, tests BDD)"
  return "exécution directe de code par node interdite (seul « node .claude/hooks/lot.mjs » est autorisé)"
}

function checkSegment(ctx, seg, readonly) {
  const [tokens, assigns] = unwrap(tokenize(seg))
  for (const as of assigns) {
    const name = as.split("=")[0]
    if (POLICY.secretEnvVars.includes(name) || /SECRET|TOKEN|PASSWORD|API_KEY|DATABASE_URL/.test(name)) return `injection de la variable sensible ${name} interdite`
    if (/^(PATH|LD_PRELOAD|LD_LIBRARY_PATH|NODE_OPTIONS|GIT_[A-Z_]+|HOME|BASH_ENV|ENV|PROMPT_COMMAND)$/.test(name)) return `redéfinition de ${name} interdite`
  }
  if (!tokens.length) return null
  const cmd0 = tokens[0]
  const base = cmd0
  if (base === "env" && tokens.length === 1) return "affichage des variables d'environnement interdit"
  if ((base === "export" && (tokens.length === 1 || tokens[1] === "-p")) || base === "set" && tokens.length === 1 ||
    (base === "declare" || base === "typeset") && /-[a-z]*[px]/.test(tokens[1] ?? "-p")) return "affichage des variables d'environnement interdit"
  const name = path.basename(cmd0)
  if (DENY_COMMANDS.has(name)) return `commande « ${name} » interdite (${DENY_COMMANDS.get(name)})`
  if (name === "base64" && tokens.some((t) => /^(-d|--decode|-D)$/.test(t))) return "décodage base64 interdit (contournement)"
  if (name === "rm") {
    const flags = tokens.filter((t) => /^-/.test(t)).join("")
    const targets = tokens.slice(1).filter((t) => !/^-/.test(t))
    if (/r|R/.test(flags) && targets.some((t) => /^(\/|~|~\/|\$HOME|\.\.?|\.\.\/.*|\*|\.git|\.\/\.git|\/.*)$/.test(t))) return "suppression récursive dangereuse interdite"
    if (readonly) return `« rm » refusé : ${ctx.why}`
  }
  if (name === "git") return checkGit(ctx, tokens, readonly)
  if (name === "pnpm") return checkPnpm(tokens, readonly)
  if (name === "npm") return /^(--version|-v|ls|list|view|why)$/.test(tokens[1] ?? "") ? null : "npm interdit (le projet utilise pnpm)"
  if (name === "node" || name === "nodejs") return checkNode(tokens)
  if (/node_modules\/\.bin\/(vitest|tsc)$/.test(cmd0)) return null
  if (/node_modules\/\.bin\//.test(cmd0)) return "exécution de binaires node_modules limitée à vitest et tsc"
  if (readonly) {
    if (name === "find") return tokens.some((t) => /^-(exec|execdir|ok|okdir|delete|fprint|fprint0|fprintf|fls)$/.test(t)) ? "find avec action d'écriture/exécution refusé" : null
    if (name === "sed") {
      if (tokens.some((t) => /^(-i|--in-place)/.test(t))) return `« sed -i » refusé : ${ctx.why}`
      if (!tokens.includes("-n")) return "en lecture seule, sed doit être utilisé avec -n"
      if (tokens.some((t) => /(^|[;}\s])\s*[0-9,$]*\s*[wWe](\s|$)/.test(t))) return "commande sed d'écriture/exécution refusée"
      return null
    }
    if (RO_SIMPLE.has(name)) return null
    return `« ${name} » refusé : ${ctx.why}`
  }
  return null
}

function checkBash(ctx, command) {
  const cmd = String(command || "")
  if (!cmd.trim()) return pass()
  if (LIVE_SECRET_RX.test(cmd)) deny("une clé secrète apparaît en clair dans la commande")
  if (ENV_FILE_RX.test(cmd)) deny("accès aux fichiers .env interdit (seul .env.example est autorisé)")
  if (SECRET_PATH_RX.test(cmd)) deny("accès à un emplacement de secrets interdit (ssh, gh, vercel, clé d'approbation…)")
  if (SECRET_VAR_RX.test(cmd)) deny("lecture d'une variable d'environnement sensible interdite")
  if (/\bdfguard(\.mjs)?\b/.test(cmd)) deny("dfguard.mjs est réservé au développeur (approbations, tests BDD)")

  const { segs, subst, redirect } = splitSegments(cmd)
  const readonly = ctx.mode === "readonly" || ctx.mode === "plan-only"

  if (KIT_PATH_RX.test(cmd)) {
    // Lecture du kit/état autorisée, jamais d'écriture ni d'exécution indirecte.
    const allRead = !redirect && !subst && segs.every((s) => {
      const [t] = unwrap(tokenize(s))
      const n = path.basename(t[0] ?? "")
      if (n === "node" && (t[1] ?? "").replace(/^\.\//, "") === ".claude/hooks/lot.mjs") return true
      if (n === "git") { const { sub } = gitSub(t); return GIT_READONLY.has(sub) }
      return ["ls", "cat", "head", "tail", "wc", "grep", "rg", "diff", "sha256sum", "stat", "find", "jq", "sort", "uniq", "cut", "tr", "echo", "cd", "tree", "file", "test", "["].includes(n) &&
        !(n === "find" && t.some((x) => /^-(exec|execdir|ok|okdir|delete|fprint|fprint0|fprintf|fls)$/.test(x)))
    })
    if (!allRead) deny("les fichiers du kit (.claude/, CLAUDE.md), l'état .lot-state/ et .git/ ne peuvent être modifiés que par le développeur")
  }

  if (readonly && subst) deny(`substitution de commande refusée en lecture seule (${ctx.why})`)
  if (readonly && redirect) deny(`redirection d'écriture refusée : ${ctx.why}`)
  if (readonly && /\btee\b/.test(cmd)) deny(`« tee » refusé : ${ctx.why}`)

  const all = [...segs]
  if (subst) {
    // Analyse aussi les commandes cachées dans $(...), `...`, <(...) : « echo $(git push) » est refusé.
    const flat = cmd.replace(/\$\(|`|<\(|>\(/g, " ; ").replace(/\)/g, " ; ")
    all.push(...splitSegments(flat).segs)
  }
  for (const seg of all) {
    const reason = checkSegment(ctx, seg, readonly)
    if (reason) deny(reason)
  }
  return pass()
}

// ------------------------------------------------------------------ SessionStart
function sessionStart(input) {
  const ctx = computeContext(input)
  const lines = []
  if (!ctx.top) return process.exit(0)
  lines.push(`[Garde DetailFlow ${POLICY.kitVersion}] branche « ${ctx.branch ?? "HEAD détachée"} » — mode : ${{
    "readonly": "LECTURE SEULE", "plan-only": "PLAN UNIQUEMENT (lot non approuvé)", "write-lot": "ÉCRITURE (lot approuvé)", "write": "ÉCRITURE",
  }[ctx.mode]}${ctx.why ? ` — ${ctx.why}` : ""}.`)
  if (ctx.lot) {
    const st = readJson(statePath(ctx.top, ctx.lot))
    lines.push(st ? `Lot ${ctx.lot} : phase ${st.phase}. Reprends avec /lot ${ctx.lot}.` : `Lot ${ctx.lot} : aucun état. Lance /lot ${ctx.lot}.`)
  }
  if (!hasApprovalKey()) lines.push("ATTENTION : clé d'approbation absente (le développeur doit lancer « node .claude/hooks/dfguard.mjs init »). Aucun lot ne peut être approuvé.")
  if (ctx.lot && ctx.mode === "write-lot" && ctx.approval?.risk === "critique") lines.push("Lot CRITIQUE : seuls les fichiers critiques listés dans le plan approuvé sont modifiables.")
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: lines.join("\n") } }))
  process.exit(0)
}

// ------------------------------------------------------------------ main
let raw = ""
try { raw = readFileSync(0, "utf8") } catch { raw = "" }
let input
try { input = JSON.parse(raw || "{}") } catch { deny("entrée de hook illisible : action bloquée par sécurité") }

if (process.argv.includes("--session-start")) sessionStart(input)

const tool = String(input.tool_name || "")
const ti = input.tool_input || {}

if (/^mcp__/.test(tool)) deny(`outil MCP « ${tool} » désactivé dans ce projet (GitHub, Stripe, Vercel, Neon… passent par le développeur)`)

const ctx = computeContext(input)

switch (tool) {
  case "Read": checkRead(ctx, ti.file_path); break
  case "Edit": case "Write": case "MultiEdit": checkWrite(ctx, ti.file_path); break
  case "NotebookEdit": checkWrite(ctx, ti.notebook_path || ti.file_path); break
  case "Grep": checkSearch(ctx, { ...ti, tool: "Grep" }); break
  case "Glob": checkSearch(ctx, { ...ti, tool: "Glob" }); break
  case "Bash": checkBash(ctx, ti.command); break
  case "PowerShell": deny("PowerShell non utilisé sur ce projet"); break
  case "Monitor": checkBash(ctx, ti.command); break
  default: pass()
}
pass()
