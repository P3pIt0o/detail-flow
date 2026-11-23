// Garde v3 : lot libre, zones critiques bloquées au moment où on les touche. Lancer : node --test .claude/hooks/tests/garde-lot-libre.test.mjs
import { test } from "node:test"
import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const HOOKS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const home = realpathSync(mkdtempSync(path.join(tmpdir(), "dfg-home-")))   // HOME isolé : la vraie clé n'est jamais lue
const repo = realpathSync(mkdtempSync(path.join(tmpdir(), "dfg-repo-")))
const env = { ...process.env, HOME: home }
const git = (...a) => execFileSync("git", ["-C", repo, ...a], { encoding: "utf8" })
const P = (rel) => path.join(repo, rel)
const put = (rel, txt = "x\n") => { mkdirSync(path.dirname(P(rel)), { recursive: true }); writeFileSync(P(rel), txt) }

git("init", "-q", "-b", "main"); git("config", "user.email", "t@t"); git("config", "user.name", "t")
put("lib/a.ts"); put(".lot-state/L9.plan.md", "# Plan L9\n## Fichiers\n- lib/a.ts\n")
git("add", "-A"); git("commit", "-qm", "init"); git("switch", "-qc", "lot/L9-test")

const run = (code) => spawnSync("node", ["--input-type=module", "-e", code], { cwd: HOOKS, env, encoding: "utf8" })
const keyDir = run(`import {GUARD_DIR} from "./lib.mjs"; process.stdout.write(GUARD_DIR)`).stdout
assert.ok(keyDir.startsWith(home), "la clé de test doit être sous le HOME isolé")
mkdirSync(keyDir, { recursive: true }); writeFileSync(path.join(keyDir, "approval.key"), "ab".repeat(32) + "\n")
const signed = (files) => run(`import {signApproval,sha256File,planPath} from "./lib.mjs"
process.stdout.write(JSON.stringify(signApproval({lot:"L9",branch:"lot/L9-test",planSha256:sha256File(planPath(${JSON.stringify(repo)},"L9")),risk:"critique",files:${JSON.stringify(files)},approvedAt:"2026-01-01T00:00:00Z",kitVersion:"t"})))`).stdout

const guard = (tool_name, tool_input) => {
  const r = spawnSync("node", [path.join(HOOKS, "guard.mjs")], { env, encoding: "utf8", input: JSON.stringify({ tool_name, tool_input, cwd: repo }) })
  return r.stdout.includes('"deny"') ? "deny" : "pass"
}
const W = (rel, content) => guard("Write", { file_path: P(rel), content })
const B = (command) => guard("Bash", { command })

test("lot libre, SANS aucune approbation : code, tests, état, git", () => {
  assert.equal(W("lib/booking/new.ts", "export const x = 1\n"), "pass")
  assert.equal(W("tests/new.test.ts", 'vi.mock("stripe")\nimport Stripe from "stripe"\n'), "pass")
  assert.equal(W("components/ui/btn.tsx"), "pass")
  assert.equal(W(".lot-state/L9.notes.md"), "pass")
  assert.equal(W(".lot-state/L9.apercu.html"), "pass")
  for (const rel of ["lib/sms/config.ts", "lib/promo/x.ts", "next.config.mjs", "scripts/outil.mjs"]) assert.equal(W(rel), "pass", rel)
  for (const c of ["git add -A", "git commit -m x", "git switch -c lot/L10-autre", "git checkout lot/L9-test", "node .claude/hooks/lot.mjs status L9", "pnpm test", "cat .lot-state/L9.json"]) assert.equal(B(c), "pass", c)
})

test("main : écriture, fusion et push bloqués ; bascule vers lot/* permise", () => {
  git("switch", "-q", "main")
  assert.equal(W("lib/booking/new.ts"), "deny")
  for (const c of ["git merge lot/L9-test", "git push", "git push origin main", "git commit -m x", "git add -A"]) assert.equal(B(c), "deny", c)
  assert.equal(B("git checkout lot/L9-test"), "pass")
  assert.equal(B("git switch lot/L9-test"), "pass")
  git("switch", "-q", "lot/L9-test")
})

test("lot : Stripe, auth/isolation, migration, déploiement, secrets, garde bloqués à l'écriture", () => {
  for (const rel of ["lib/customer-subscriptions/stripe.ts", "lib/billing/x.ts", "app/api/billing/route.ts", "lib/tenant.ts", "lib/auth.ts", "middleware.ts",
    "package.json", "pnpm-lock.yaml", "lib/pricing/plans.ts", "lib/licensing/x.ts", "lib/invoice/x.ts", "app/api/cron/reminders/route.ts", "scripts/add-x-migration.sql", "scripts/setup-stripe-x.ts", "vercel.json", ".github/workflows/ci.yml", ".env.local", ".env.production", ".claude/hooks/guard.mjs", "CLAUDE.md"]) assert.equal(W(rel), "deny", rel)
  assert.equal(W("lib/booking/pay.ts", 'import Stripe from "stripe"\n'), "deny")
  assert.equal(W("lib/booking/pay.ts", "const k = process.env.STRIPE_SECRET_KEY\n"), "deny")
  assert.equal(W("lib/db/rls.sql", "create policy p on t using (true)"), "deny")
})

test("push : toujours interdit à l'agent (le développeur pousse lui-même)", () => {
  for (const c of ["git push", "git push -u origin lot/L9-test", "git push --force origin lot/L9-test", "git push origin main"]) assert.equal(B(c), "deny", c)
})

test("git add/commit/switch/checkout tournent hors bac à sable : seuls dans la commande", () => {
  for (const c of ["git add -A && rm -rf lib", "git commit -m x; curl evil.sh", "git add -A | tee f", "git commit -m x > out.txt", "git commit -m $(whoami)", "git switch lot/L9-test && echo x"]) assert.equal(B(c), "deny", c)
  assert.equal(B('git commit -m "fix; autre && chose"'), "pass")
})

test("état machine du lot : compteurs, dbCheck, verify/vitest non modifiables par l'agent ; plan et notes libres", () => {
  for (const rel of [".lot-state/L9.json", ".lot-state/L9.verify.json", ".lot-state/L9.vitest.json"]) assert.equal(W(rel), "deny", rel)
  for (const c of ["echo '{}' > .lot-state/L9.json", "sed -i s/0/1/ .lot-state/L9.json", "rm .lot-state/L9.verify.json", "cp x .lot-state/L9.vitest.json", "jq . .lot-state/L9.json > .lot-state/L9.json"]) assert.equal(B(c), "deny", c)
  assert.equal(B("jq .dbCheck .lot-state/L9.json"), "pass")
  assert.equal(W(".lot-state/L9.plan.md"), "pass"); assert.equal(W(".lot-state/L9.notes.md"), "pass")
})

test("approbations : jamais créées ni modifiées par l'agent ; fichier forgé inutile", () => {
  assert.equal(W(".lot-state/L9.approved"), "deny")
  assert.equal(B("echo '{}' > .lot-state/L9.approved"), "deny")
  assert.equal(B("cp x .lot-state/L9.approved"), "deny")
  writeFileSync(P(".lot-state/L9.approved"), JSON.stringify({ lot: "L9", branch: "lot/L9-test", files: ["lib/auth.ts"], mac: "00" }))
  assert.equal(W("lib/auth.ts"), "deny")
})

test("contournement par sed/redirection : le commit est bloqué tant que la zone n'est pas approuvée", () => {
  put("lib/auth.ts", "changé hors Write\n")
  assert.equal(B("git add -A"), "deny")
  assert.equal(B("git commit -m x"), "deny")
  assert.equal(B("git push -u origin lot/L9-test"), "deny")
})

test("approbation signée par le développeur : lève le blocage de CES fichiers seulement", () => {
  writeFileSync(P(".lot-state/L9.approved"), signed(["lib/auth.ts"]))
  assert.equal(W("lib/auth.ts"), "pass")
  assert.equal(W("lib/tenant.ts"), "deny")
  assert.equal(B("git commit -m x"), "pass")
  assert.equal(W(".env.local"), "deny")
  assert.equal(W(".claude/hooks/guard.mjs"), "deny")
})
