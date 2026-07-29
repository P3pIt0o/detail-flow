import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"
import { readFileSync } from "node:fs"
import path from "node:path"

// Charge DATABASE_URL depuis .env*.local pour les tests d'intégration DB,
// sans dépendre de `vite`/dotenv. Parsing minimal ligne par ligne.
if (!process.env.DATABASE_URL) {
  for (const file of [".env.development.local", ".env.local", ".env"]) {
    try {
      const content = readFileSync(path.join(process.cwd(), file), "utf8")
      const match = content.match(/^DATABASE_URL\s*=\s*(.*)$/m)
      if (match) {
        process.env.DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, "")
        break
      }
    } catch {
      // fichier absent : on continue
    }
  }
}

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      // `server-only` est un no-op côté runtime Node de test.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
})
