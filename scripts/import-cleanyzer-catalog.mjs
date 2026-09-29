/**
 * Initialisation du catalogue Cleanyzer (tenant EXISTANT `cleanyzer`).
 *
 *   Dry-run (aucune écriture) :
 *     DATABASE_URL=<url branche> node scripts/import-cleanyzer-catalog.mjs --durations=durees.json
 *   Application (uniquement si le dry-run affiche SAFE TO APPLY: YES) :
 *     DATABASE_URL=<url branche> node scripts/import-cleanyzer-catalog.mjs --durations=durees.json --apply
 *
 *   durees.json = { "<slug prestation>": minutes, ... } — obligatoire pour chaque prestation à créer.
 *
 * Logique : scripts/cleanyzer-catalog-import.mjs (create if missing, preserve if existing).
 */
import { readFileSync } from "node:fs"
import pg from "pg"
import { formatReport, runCleanyzerImport } from "./cleanyzer-catalog-import.mjs"

const apply = process.argv.includes("--apply")
// Durées (minutes) par slug de prestation, fournies par Cleanyzer : jamais inventées par le script.
const durationsArg = process.argv.find((a) => a.startsWith("--durations="))
const durations = durationsArg ? JSON.parse(readFileSync(durationsArg.slice("--durations=".length), "utf8")) : {}
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
  const result = await runCleanyzerImport(client, { apply, durations })
  console.log(formatReport(result, { target }))
  if (!result.safe) process.exitCode = 1
} finally {
  await client.end()
}
