// Garde-fou des bases de test de la CI (L34). Lit DATABASE_URL (base dev) et
// CUSTOMER_SUBSCRIPTIONS_TEST_DATABASE_URL (base de test) et refuse avant tout test :
// une adresse de production (« long-mud »), deux bases sur le même hôte, une configuration
// incomplète ou illisible. Aucun message n'affiche une adresse, un utilisateur ni un mot de passe.
import path from "node:path"
import { realpathSync } from "node:fs"
import { fileURLToPath } from "node:url"

const LABELS = { DATABASE_URL: "base dev", CUSTOMER_SUBSCRIPTIONS_TEST_DATABASE_URL: "base de test" }

function hostOf(url) {
  try {
    const u = new URL(String(url).trim().replace(/^["']|["']$/g, ""))
    // Neon : « ep-x-pooler.… » et « ep-x.… » désignent la même base.
    return u.hostname ? u.hostname.toLowerCase().replace(/^([^.]+)-pooler\./, "$1.") : null
  } catch {
    return null
  }
}

/** @returns {{ status: "ok" | "skip" | "error", message: string }} */
export function checkDbSecrets(env) {
  const vars = Object.keys(LABELS)
  const set = vars.filter((v) => (env[v] || "").trim())
  if (set.length === 0) {
    return { status: "skip", message: "Bases de test non fournies (PR : réservées au push sur main) : tests BDD ignorés." }
  }
  if (set.length < vars.length) {
    const missing = vars.filter((v) => !set.includes(v)).map((v) => LABELS[v])
    return { status: "error", message: `Configuration incomplète : ${missing.join(", ")} non renseignée.` }
  }
  for (const v of vars) {
    if (/long-mud/i.test(env[v])) {
      return { status: "error", message: `Refus : la ${LABELS[v]} vise la base de production.` }
    }
  }
  const hosts = vars.map((v) => hostOf(env[v]))
  const bad = vars.filter((_, i) => !hosts[i])
  if (bad.length) return { status: "error", message: `Adresse illisible : ${bad.map((v) => LABELS[v]).join(", ")}.` }
  if (hosts[0] === hosts[1]) {
    return { status: "error", message: "Refus : base dev et base de test sur le même hôte." }
  }
  return { status: "ok", message: "Bases de test vérifiées (dev et test distinctes, hors production)." }
}

const realOr = (p) => {
  try {
    return realpathSync(p)
  } catch {
    return p
  }
}

if (process.argv[1] && realOr(path.resolve(process.argv[1])) === realOr(fileURLToPath(import.meta.url))) {
  const r = checkDbSecrets(process.env)
  if (r.status === "error") {
    console.log(`::error::${r.message}`)
    process.exitCode = 1
  } else if (r.status === "skip") {
    console.log(`::warning::${r.message}`)
  } else {
    console.log(r.message)
  }
}
