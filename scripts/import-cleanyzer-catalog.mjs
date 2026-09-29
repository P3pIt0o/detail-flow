/**
 * Initialisation du catalogue Cleanyzer (tenant EXISTANT `cleanyzer`).
 *
 *   Dry-run (aucune écriture) :
 *     node --env-file=.env.production.local scripts/import-cleanyzer-catalog.mjs
 *   Application (uniquement si le dry-run affiche SAFE TO APPLY: YES) :
 *     node --env-file=.env.production.local scripts/import-cleanyzer-catalog.mjs --apply
 *
 * Logique : scripts/cleanyzer-catalog-import.mjs (create if missing, preserve if existing).
 */
import pg from "pg"
import { formatReport, runCleanyzerImport } from "./cleanyzer-catalog-import.mjs"

const apply = process.argv.includes("--apply")
const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error("DATABASE_URL manquant.")
  process.exit(1)
}

let target = "inconnue"
try {
  const url = new URL(connectionString)
  target = `${url.hostname}/${url.pathname.replace(/^\//, "")}`
} catch {}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } })
await client.connect()
try {
  const result = await runCleanyzerImport(client, { apply })
  console.log(formatReport(result, { target }))
  if (!result.safe) process.exitCode = 1
} finally {
  await client.end()
}
