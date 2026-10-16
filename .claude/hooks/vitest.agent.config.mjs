// Configuration Vitest utilisée par les AGENTS (via lot.mjs verify).
// Identique à vitest.config.ts du dépôt (include, timeouts, alias), SAUF qu'elle ne charge
// JAMAIS DATABASE_URL depuis les fichiers .env : les tests BDD/réseau sont donc ignorés
// (describe.skip / skipIf) quand ce sont les agents qui testent.
// Les tests BDD se lancent par le développeur : node .claude/hooks/dfguard.mjs test-db
// Si vitest.config.ts évolue, lot.mjs le signale (empreinte dans policy.json) : reporter ici.
import path from "node:path"
import { defineConfig } from "vitest/config"

const root = process.cwd()

export default defineConfig({
  root,
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      "server-only": path.join(root, "tests", "stubs", "server-only.ts"),
      "@": root + path.sep,
    },
  },
})
