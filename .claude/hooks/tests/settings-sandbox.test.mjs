// settings.json : seules git add/commit/switch/checkout sortent du bac à sable ; le push reste interdit. node --test .claude/hooks/tests/settings-sandbox.test.mjs
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const s = JSON.parse(readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "settings.json"), "utf8"))

test("excludedCommands : exactement add, commit, switch, checkout (pas de push, pas de lot.mjs, pas d'autre)", () => {
  assert.deepEqual(s.sandbox.excludedCommands, ["git add *", "git commit *", "git switch *", "git checkout *"])
})
test("le bac à sable et le blocage du push restent en place", () => {
  assert.equal(s.sandbox.enabled, true); assert.equal(s.sandbox.failIfUnavailable, true); assert.equal(s.sandbox.allowUnsandboxedCommands, false)
  for (const r of ["Bash(git push)", "Bash(git push *)", "Bash(git merge *)", "Edit(./.claude/**)", "Edit(./.git/**)"]) assert.ok(s.permissions.deny.includes(r), r)
  assert.ok(s.hooks.PreToolUse.some((h) => JSON.stringify(h).includes("guard.mjs")), "la garde doit rester branchée")
})
